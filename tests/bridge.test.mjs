import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {makeBridge} from '../orca-plugin/bridge-core.mjs';
import {startServer} from '../orca-plugin/main.mjs';

function mock({multiple=false,chat=false,old=false}={}) {
  const calls=[];
  const ws=[{id:'wt-ventas', name:'Ventas', project:'Ventas',projectId:'repo-1',path:'C:\\dev\\Ventas',branch:'main',kind:'worktree'},{id:'wt-cultivo',name:'Cultivos',project:'Cultivos',projectId:'repo-2',path:'C:\\dev\\Cultivos',branch:'dev',kind:'worktree'}];
  const claude=[{terminalId:chat?null:'t-claude',title:'Claude Ventas',agent:'claude',state:'waiting',sessionId:'session-1'}];
  if(multiple)claude.push({terminalId:'t-claude-2',title:'Claude QA',agent:'claude',state:'working',sessionId:'session-2'});
  const impl={
    'workspace.list':async()=>({workspaces:ws,truncated:false}),
    'project.list':async()=>({projects:[{id:'repo-1',name:'Ventas',kind:'git',path:'C:\\dev\\Ventas'}],truncated:false}),
    'workspace.open':async x=>({opened:true}),
    'agents.list':async x=>({agents:x.workspaceId==='wt-ventas'?[...claude,{terminalId:'t-codex',title:'Codex',agent:'codex',state:'working'}]:[]}),
    'terminal.sendText':async x=>({accepted:true}),
    'terminal.read':async x=>({lines:['Fase 1','Pruebas OK'],truncated:false}),
    'terminal.focus':async()=>({focused:true}),
    'agent.launch':async()=>({terminalId:'t-new'}),
    'agent.listSessions':async()=>({sessions:[{sessionId:'session-1',agent:'claude',workspaceId:'wt-ventas',title:'Ventas',running:false,updatedAt:1}],truncated:false}),
    'agent.resume':async()=>({terminalId:'t-resume',started:true}),
    'editor.open':async()=>({opened:true}),
  };
  const orca={api:{major:1,minor:old?9:10},host:{has:m=>m in impl,call:async(m,p)=>{calls.push({m,p});return impl[m](p)}},commands:{register(){}}};
  return {orca,calls};
}
const promiseError=(action, code)=>assert.rejects(action,e=>e.code===code);

test('lista proyectos y abre el workspace exacto',async()=>{
 const {orca,calls}=mock(),bridge=makeBridge(orca);
 const projects=await bridge.dispatch('projects');assert.equal(projects.workspaces.length,2);
 assert.equal((await bridge.dispatch('open_workspace',{workspaceId:'wt-ventas'})).opened,true);
 assert.equal(calls.at(-1).m,'workspace.open');assert.equal(calls.at(-1).p.workspaceId,'wt-ventas');
 await promiseError(()=>bridge.dispatch('open_workspace',{workspaceId:'inventado'}),'not_found');
});
test('envia solo a Claude dentro del workspace elegido, nunca a Codex',async()=>{
 const {orca,calls}=mock(),bridge=makeBridge(orca);
 const result=await bridge.dispatch('send_prompt',{workspaceId:'wt-ventas',agent:'claude',prompt:'Revisa la clase ventas y haz tests'});
 assert.equal(result.accepted,true);
 assert.deepEqual(calls.at(-1),{m:'terminal.sendText',p:{terminalId:'t-claude',text:'Revisa la clase ventas y haz tests',enter:true}});
});
test('no selecciona un Claude aleatorio entre dos',async()=>{
 const {orca,calls}=mock({multiple:true}),bridge=makeBridge(orca);
 await promiseError(()=>bridge.dispatch('send_prompt',{workspaceId:'wt-ventas',agent:'claude',prompt:'Hola'}),'ambiguous');
 assert.equal(calls.filter(x=>x.m==='terminal.sendText').length,0);
 await bridge.dispatch('send_prompt',{workspaceId:'wt-ventas',agent:'claude',terminalId:'t-claude-2',prompt:'Hola'});
 assert.equal(calls.at(-1).p.terminalId,'t-claude-2');
});
test('no confunde Chat UI con terminal',async()=>{
 const {orca,calls}=mock({chat:true}),bridge=makeBridge(orca);
 await promiseError(()=>bridge.dispatch('send_prompt',{workspaceId:'wt-ventas',agent:'claude',prompt:'Hola'}),'chat_unsupported');
 assert.equal(calls.filter(x=>x.m==='terminal.sendText').length,0);
});
test('no envía prompts a workspaces inexistentes ni prompts invalidos',async()=>{
 const {orca,calls}=mock(),bridge=makeBridge(orca);
 await promiseError(()=>bridge.dispatch('send_prompt',{workspaceId:'otro',agent:'claude',prompt:'Hola'}),'not_found');
 await promiseError(()=>bridge.dispatch('send_prompt',{workspaceId:'wt-ventas',agent:'claude',prompt:'\u0001'}),'invalid_params');
 assert.equal(calls.filter(x=>x.m==='terminal.sendText').length,0);
});
test('rechaza version host vieja para consultar agentes de otros proyectos',async()=>{
 const {orca}=mock({old:true}),bridge=makeBridge(orca);
 await promiseError(()=>bridge.dispatch('agents',{workspaceId:'wt-ventas'}),'unsupported');
});
test('lee estado, abre archivo y puede reanudar una sesion verificada',async()=>{
 const {orca,calls}=mock(),bridge=makeBridge(orca);
 const output=await bridge.dispatch('read_agent',{workspaceId:'wt-ventas',agent:'claude'});
 assert.equal(output.state,'waiting');assert.equal(output.lines.at(-1),'Pruebas OK');
 assert.equal((await bridge.dispatch('open_file',{workspaceId:'wt-ventas',path:'src/main.py'})).opened,true);
 await bridge.dispatch('resume_session',{workspaceId:'wt-ventas',agent:'claude',sessionId:'session-1'});
 assert.equal(calls.at(-1).m,'agent.resume');
 await promiseError(()=>bridge.dispatch('resume_session',{workspaceId:'wt-ventas',agent:'codex',sessionId:'session-1'}),'not_found');
});
test('HTTP autentificado en loopback, bloqueo duplicados y apagado limpia la conexion',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'capri-orca-test-'));const file=path.join(dir,'connection.json');
 const {orca,calls}=mock();const server=await startServer(orca,{file});
 try{
  const connection=JSON.parse(fs.readFileSync(file,'utf8'));
  const send=(token,operation,params={},id='abc123456789',origin)=>new Promise((resolve,reject)=>{
    const data=JSON.stringify({version:1,operation,params,requestId:id});
    const headers={'content-type':'application/json','x-capri-orca-token':token,'content-length':Buffer.byteLength(data)};
    if(origin)headers.origin='http://example.com';
    const req=http.request({hostname:'127.0.0.1',port:connection.port,path:'/v1',method:'POST',headers},res=>{
      let str='';res.on('data',x=>str+=x);res.on('end',()=>resolve({status:res.statusCode,response:JSON.parse(str)}));});
    req.on('error',reject);req.end(data);
  });
  const unauthorized=await send('invalid','ping');assert.equal(unauthorized.status,401);
  const forbidden=await send(connection.token,'ping',{},'abcdef123456','http://attacker.test');assert.equal(forbidden.status,403);
  const ping=await send(connection.token,'ping');assert.equal(ping.response.result.bridge,'0.10.1');
  const action={workspaceId:'wt-ventas',agent:'claude',prompt:'test'};
  const first=await send(connection.token,'send_prompt',action,'same123456789');assert.equal(first.response.ok,true);
  const second=await send(connection.token,'send_prompt',action,'same123456789');assert.equal(second.response.error.code,'duplicate');
  assert.equal(calls.filter(x=>x.m==='terminal.sendText').length,1);
  const huge=await send(connection.token,'send_prompt',{...action,prompt:'Z'.repeat(20000)},'other123456789');assert.equal(huge.response.error.code,'invalid_params');
 }finally{await server.stop();assert.equal(fs.existsSync(file),false);fs.rmSync(dir,{recursive:true,force:true});}
});

test('agent_status observa la terminal exacta y no confunde agente',async()=>{
 const {orca,calls}=mock({multiple:true});const bridge=makeBridge(orca);
 const s=await bridge.dispatch('agent_status',{workspaceId:'wt-ventas',agent:'claude',terminalId:'t-claude-2'});
 assert.equal(s.state,'working');assert.equal(s.terminalId,'t-claude-2');
 await promiseError(()=>bridge.dispatch('agent_status',{workspaceId:'wt-ventas',agent:'claude'}),'ambiguous');
 assert.equal(calls.filter(x=>x.m==='terminal.sendText').length,0);
});

test('historial se puede filtrar por agente y tiene sesion verificable',async()=>{
 const {orca}=mock();const bridge=makeBridge(orca);
 const h=await bridge.dispatch('session_history',{workspaceId:'wt-ventas',agent:'claude'});
 assert.equal(h.sessions.length,1);assert.equal(h.sessions[0].sessionId,'session-1');
 assert.equal(h.sessions[0].workspaceId,'wt-ventas');
 const empty=await bridge.dispatch('session_history',{workspaceId:'wt-ventas',agent:'codex'});
 assert.equal(empty.sessions.length,0);
});

test('no admite rutas con traversal ni fuera del proyecto',async()=>{
 const {orca,calls}=mock();const bridge=makeBridge(orca);
 for(const file of ['../passwd','a/../../secrets','C:\\Windows\\secret.txt','/etc/passwd']) {
   await promiseError(()=>bridge.dispatch('open_file',{workspaceId:'wt-ventas',path:file}),'invalid_params');
 }
 assert.equal(calls.filter(x=>x.m==='editor.open').length,0);
});

test('servidor rechaza host forjado y JSON no objeto',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'capri-orca-v7-'));
 const file=path.join(dir,'connection.json');const {orca}=mock();const bridge=await startServer(orca,{file});
 try{
  const connection=JSON.parse(fs.readFileSync(file,'utf8'));
  async function call(body,host){return new Promise((resolve,reject)=>{
   const headers={'content-type':'application/json','x-capri-orca-token':connection.token,'content-length':Buffer.byteLength(body)};
   if(host)headers.host=host;
   const req=http.request({hostname:'127.0.0.1',port:connection.port,path:'/v1',method:'POST',headers},res=>{
     let out='';res.on('data',c=>out+=c);res.on('end',()=>resolve({code:res.statusCode,payload:JSON.parse(out)}));
   });req.on('error',reject);req.end(body);
  });}
  const fake=await call(JSON.stringify({version:1,operation:'ping'}),'attacker.invalid');
  assert.equal(fake.code,403);
  const notObject=await call('null');assert.equal(notObject.payload.error.code,'invalid_params');
 }finally{await bridge.stop();fs.rmSync(dir,{recursive:true,force:true});}
});


test('servidor conserva acentos y emojis aunque el cuerpo UTF-8 llegue por fragmentos',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'capri-orca-v08-unicode-'));
 const {orca,calls}=mock();const server=await startServer(orca,{file:path.join(dir,'connection.json')});
 try {
  const pairing=JSON.parse(fs.readFileSync(server.file,'utf8'));
  const prompt='Revisa programación en español: ñ, á, é y 🐍';
  const payload=Buffer.from(JSON.stringify({version:1,operation:'send_prompt',requestId:'unicode123456',params:{workspaceId:'wt-ventas',agent:'claude',prompt}}));
  const res=await new Promise((resolve,reject)=>{
   const req=http.request({host:'127.0.0.1',port:pairing.port,path:'/v1',method:'POST',headers:{host:`127.0.0.1:${pairing.port}`,'content-type':'application/json','x-capri-orca-token':pairing.token,'content-length':payload.length}},r=>{
    const parts=[];r.on('data',x=>parts.push(x));r.on('end',()=>resolve(JSON.parse(Buffer.concat(parts).toString('utf8'))));
   });
   req.on('error',reject);
   for(let i=0;i<payload.length;i++)req.write(payload.subarray(i,i+1));
   req.end();
  });
  assert.equal(res.ok,true);
  assert.equal(calls.find(x=>x.m==='terminal.sendText').p.text,prompt);
 }finally{await server.stop();fs.rmSync(dir,{recursive:true,force:true});}
});

test('servidor no acepta contenido que no sea JSON',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'capri-orca-v08-type-'));
 const {orca,calls}=mock();const server=await startServer(orca,{file:path.join(dir,'connection.json')});
 try{
  const pairing=JSON.parse(fs.readFileSync(server.file,'utf8'));
  const reply=await new Promise((resolve,reject)=>{
   const req=http.request({host:'127.0.0.1',port:pairing.port,path:'/v1',method:'POST',headers:{'content-type':'text/plain','x-capri-orca-token':pairing.token}},r=>{let text='';r.on('data',x=>text+=x);r.on('end',()=>resolve({status:r.statusCode,response:JSON.parse(text)}));});
   req.on('error',reject);req.end('{}');
  });
  assert.equal(reply.status,415);
  assert.equal(reply.response.error.code,'unsupported_media_type');
  assert.equal(calls.length,0);
 }finally{await server.stop();fs.rmSync(dir,{recursive:true,force:true});}
});

test('no inicia agentes que no reconoce, ni comandos arbitrarios',async()=>{
 const {orca,calls}=mock();const bridge=makeBridge(orca);
 await promiseError(()=>bridge.dispatch('launch_agent',{workspaceId:'wt-ventas',agent:'powershell -enc abc'}),'invalid_params');
 await promiseError(()=>bridge.dispatch('resume_session',{workspaceId:'wt-ventas',agent:'bash',sessionId:'session-1'}),'invalid_params');
 assert.equal(calls.some(x=>x.m==='agent.launch'||x.m==='agent.resume'),false);
});

test('no realiza envios si el host informa accepted false',async()=>{
 const {orca,calls}=mock();const original=orca.host.call;
 orca.host.call=(m,p)=>m==='terminal.sendText'?Promise.resolve({accepted:false}):original(m,p);
 await promiseError(()=>makeBridge(orca).dispatch('send_prompt',{workspaceId:'wt-ventas',agent:'claude',prompt:'Revisar'}),'not_accepted');
 assert.equal(calls.some(x=>x.m==='terminal.sendText'),false);
});

test('acepta identificadores actuales y nombres hablados sin lanzar agentes desconocidos',async()=>{
 const {orca,calls}=mock();const bridge=makeBridge(orca);
 const r=await bridge.dispatch('launch_agent',{workspaceId:'wt-ventas',agent:'Prime Agent',prompt:'Revisa el codigo'});
 assert.equal(r.launched,true);assert.equal(r.terminalId,'t-new');
 assert.equal(calls.at(-1).p.agent,'prime-agent');
 const r2=await bridge.dispatch('launch_agent',{workspaceId:'wt-ventas',agent:'Mimo Code'});
 assert.equal(r2.agent,'mimo-code');
 const before=calls.filter(x=>x.m==='agent.launch').length;
 await promiseError(()=>bridge.dispatch('launch_agent',{workspaceId:'wt-ventas',agent:'agente-desconocido'}),'invalid_params');
 assert.equal(calls.filter(x=>x.m==='agent.launch').length,before);
});

test('no afirma inicio de agente si Host API no devuelve terminalId',async()=>{
 const {orca}=mock();const original=orca.host.call;
 orca.host.call=async(m,p)=>m==='agent.launch'?{}:original(m,p);
 const bridge=makeBridge(orca);
 await promiseError(()=>bridge.dispatch('launch_agent',{workspaceId:'wt-ventas',agent:'codex'}),'not_accepted');
});


test('no elige una terminal cuando Orca trunca agents.list',async()=>{
 const {orca,calls}=mock();const original=orca.host.call;
 orca.host.call=async(m,p)=>m==='agents.list'?{truncated:true,agents:[{terminalId:'t-claude',agent:'claude',state:'waiting'}]}:original(m,p);
 const bridge=makeBridge(orca);
 await promiseError(()=>bridge.dispatch('send_prompt',{workspaceId:'wt-ventas',agent:'claude',prompt:'No enviar a una lista incompleta'}),'truncated');
 await promiseError(()=>bridge.dispatch('agents',{workspaceId:'wt-ventas'}),'truncated');
 assert.equal(calls.some(x=>x.m==='terminal.sendText'),false);
});
