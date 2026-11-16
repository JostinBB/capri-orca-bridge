import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {describeRateLimit,summarizeAccountSnapshot,createAccountCli,accountOperation,chooseCliExecutable} from '../orca-plugin/accounts.mjs';
import {makeBridge} from '../orca-plugin/bridge-core.mjs';
import {startServer} from '../orca-plugin/main.mjs';

const window=(usedPercent,minutes=300,resetsAt=1810000000000)=>({usedPercent,windowMinutes:minutes,resetsAt});
function fixture({active='acct-claude-1',remaining=31,antigravity=true}={}) {
 return {ok:true,result:{
  claude:{activeAccountId:active,accounts:[{id:'acct-claude-1',email:'a@ejemplo.test',displayName:'Personal'},{id:'acct-claude-2',email:'b@ejemplo.test',displayName:'Trabajo'}]},
  codex:{activeAccountId:null,accounts:[{id:'codex-1',email:'c@ejemplo.test'}]},
  antigravity:antigravity?{activeAccountId:'agy-1',accounts:[{id:'agy-1',email:'d@ejemplo.test',usage:{provider:'antigravity',status:'ok',session:window(17),weekly:null}}]}:undefined,
  rateLimits:{
   claude:{provider:'claude',status:'ok',updatedAt:1809990000000,session:window(100-remaining),weekly:window(55,10080)},
   codex:{provider:'codex',status:'unavailable',error:'Sin permiso de cuota',session:null,weekly:null},
   antigravity:{provider:'antigravity',status:'ok',session:window(17),weekly:null},
   inactiveClaudeAccounts:[{accountId:'acct-claude-2',rateLimits:{status:'ok',session:window(19),weekly:window(12,10080)}}],
   inactiveCodexAccounts:[]
  },
  highlySecretAccessToken:'NO_FILTRAR'
 }};
}
function fakeCli(override={}) {
 let snapshot=fixture(); const calls=[];
 return {calls,setSnapshot:x=>{snapshot=x},list:async()=>snapshot,
 select:async(provider,id)=>{calls.push([provider,id]);snapshot.result[provider].activeAccountId=id; return snapshot},...override};
}
test('cuota por ventana: porcentaje restante = 100 - usedPercent',()=>{
 const info=describeRateLimit({status:'ok',session:window(80),weekly:window(15,10080)});
 assert.deepEqual(info.windows.map(w=>w.remainingPercent),[20,85]);
 assert.equal(info.windows[0].resetAt,1810000000000);
 assert.equal(info.windows[1].windowMinutes,10080);
});
test('no inventa porcentajes cuando Orca no los devuelve o el dato es inválido',()=>{
 assert.equal(describeRateLimit(null).windows.length,0);
 assert.equal(describeRateLimit({status:'ok',session:{usedPercent:'12'},weekly:null}).windows.length,0);
 assert.equal(describeRateLimit({status:'ok',session:{usedPercent:120},weekly:null}).windows.length,0);
});
test('lista cuentas y cuota activa e inactiva sin exponer credenciales ni rutas',()=>{
 const out=summarizeAccountSnapshot(fixture());
 assert.equal(out.usage.find(x=>x.provider==='claude').windows[0].remainingPercent,31);
 const claude=out.accounts.find(x=>x.provider==='claude').accounts;
 assert.equal(claude.length,2);assert.equal(claude[0].active,true);
 assert.equal(claude[1].usage.windows[0].remainingPercent,81);
 assert.equal(out.accounts.find(x=>x.provider==='antigravity').accounts[0].usage.windows[0].remainingPercent,83);
 assert.equal(JSON.stringify(out).includes('NO_FILTRAR'),false);
});
test('cuenta predeterminada Codex queda explícita',()=>{
 const out=summarizeAccountSnapshot(fixture());
 const codex=out.accounts.find(x=>x.provider==='codex').accounts;
 assert.equal(codex[0].id,'system');assert.equal(codex[0].active,true);
 assert.equal(codex[0].usage.status,'unavailable');
});
test('rechaza JSON sin campo rateLimits en lugar de inventar cuota',()=>{
 assert.throws(()=>summarizeAccountSnapshot({result:{claude:{accounts:[]}}}),/rateLimits/);
});
test('comando CLI usa execFile sin shell y argumentos literales',async()=>{
 const calls=[];
 const fake=(exe,args,opts,cb)=>{calls.push({exe,args,opts});cb(null,JSON.stringify(fixture()),'')};
 const cli=createAccountCli({executable:'/ruta/orca',exec:fake});
 const raw=await cli.list();assert.equal(raw.ok,true);
 await cli.select('claude','acct-claude-2');
 assert.deepEqual(calls.map(x=>x.args),[['account','list','--json'],['account','select','--agent','claude','--account','acct-claude-2','--json']]);
 assert.equal(calls.every(x=>x.opts.shell===false),true);
 await assert.rejects(()=>cli.select('claude','abc & powershell'),/no válido/);
});
test('mensaje claro cuando la CLI devuelve error o salida que no es JSON',async()=>{
 const bad=createAccountCli({executable:'orca',exec:(exe,args,opts,cb)=>cb(null,'Orca no JSON','')});
 await assert.rejects(()=>bad.list(),/no devolvió JSON/);
 const err=createAccountCli({executable:'orca',exec:(exe,args,opts,cb)=>cb(Object.assign(new Error('not found'),{code:'ENOENT'}),'','')});
 await assert.rejects(()=>err.list(),/Activa Orca CLI/);
});
test('cambia cuenta solo si figura en Orca y verifica selección posterior',async()=>{
 const cli=fakeCli();
 const result=await accountOperation(cli,'select_account',{provider:'claude',accountId:'acct-claude-2'});
 assert.equal(result.selected,true);assert.equal(cli.calls.length,1);
 assert.equal(cli.calls[0][1],'acct-claude-2');
 const current=await accountOperation(cli,'select_account',{provider:'claude',accountId:'acct-claude-2'});
 assert.equal(current.unchanged,true);
});
test('no cambia a cuenta desconocida ni ejecuta comandos arbitrarios',async()=>{
 const cli=fakeCli();
 await assert.rejects(()=>accountOperation(cli,'select_account',{provider:'claude',accountId:'no-existe'}),/no verificada/i);
 await assert.rejects(()=>accountOperation(cli,'select_account',{provider:'bash',accountId:'x'}),/inválida/i);
 assert.equal(cli.calls.length,0);
});
test('no declara exitoso el cambio si Orca no confirma nueva cuenta',async()=>{
 const cli=fakeCli({select:async()=>fixture()});
 await assert.rejects(()=>accountOperation(cli,'select_account',{provider:'claude',accountId:'acct-claude-2'}),/no confirmó/i);
});
test('integración HTTP real de consulta de cuotas y cambio con token y solicitud idempotente',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'capri-orca-v09-'));
 const cli=fakeCli();
 const host={api:{major:1,minor:10},host:{has:()=>true,call:async()=>({})},commands:{register(){}}};
 const server=await startServer(host,{file:path.join(dir,'connection.json'),accountCli:cli});
 const pairing=JSON.parse(fs.readFileSync(server.file,'utf8'));
 function request(operation,params={},requestId='request123456') {
  return new Promise((resolve,reject)=>{
   const data=Buffer.from(JSON.stringify({version:1,operation,params,requestId}));
   const req=http.request({host:'127.0.0.1',port:pairing.port,path:'/v1',method:'POST',headers:{'content-type':'application/json','x-capri-orca-token':pairing.token,'content-length':data.length}},res=>{
    const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve(JSON.parse(Buffer.concat(chunks).toString())));
   });req.on('error',reject);req.end(data);
  });
 }
 try {
  const initial=await request('accounts_status');
  assert.equal(initial.ok,true);assert.equal(initial.result.usage.find(x=>x.provider==='claude').windows[0].remainingPercent,31);
  const moved=await request('select_account',{provider:'claude',accountId:'acct-claude-2'},'switch12345678');
  assert.equal(moved.ok,true);assert.equal(moved.result.selected,true);
  assert.equal(cli.calls.length,1);
  const duplicate=await request('select_account',{provider:'claude',accountId:'acct-claude-2'},'switch12345678');
  assert.equal(duplicate.error.code,'duplicate');assert.equal(cli.calls.length,1);
 }finally{await server.stop();fs.rmSync(dir,{recursive:true,force:true})}
});

test('invoca un CLI de prueba como proceso real sin shell, lee JSON auténtico', {skip:process.platform==='win32'}, async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'capri-orca-cli-process-'));
 const executable=path.join(dir,'orca-fixture');
 try {
   const raw=JSON.stringify(fixture());
   fs.writeFileSync(executable,'#!/usr/bin/env node\nprocess.stdout.write('+JSON.stringify(raw)+');\n',{mode:0o700});
   fs.chmodSync(executable,0o700);
   const cli=createAccountCli({executable});
   const result=await cli.list();
   assert.equal(result.ok,true);
   assert.equal(summarizeAccountSnapshot(result).usage.find(x=>x.provider==='claude').windows[0].remainingPercent,31);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
