import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {makeBridge, BridgeError} from './bridge-core.mjs';
import {createAccountCli,accountOperation} from './accounts.mjs';

const MAX_BODY=32*1024;
const BRIDGE_VERSION=1; // protocol stable; version of plugins is 0.9.0
export const pairingPath = () => path.join(process.env.LOCALAPPDATA || path.join(os.homedir(),'.local','share'),'CapriOrcaBridge','connection.json');
const message = (res,status,payload) => {
  const body=JSON.stringify(payload);
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(body),'cache-control':'no-store','x-content-type-options':'nosniff'});
  res.end(body);
};
const constantEqual = (one,two) => {
  const a=Buffer.from(String(one||'')),b=Buffer.from(String(two||''));
  return a.length===b.length && crypto.timingSafeEqual(a,b);
};
export async function startServer(orca,{file=pairingPath(),log=()=>{}, accountCli=null}={}) {
  const token=crypto.randomBytes(32).toString('hex');
  const accounts=accountCli||createAccountCli();
  const bridge=makeBridge(orca,{dispatch:(op,params)=>accountOperation(accounts,op,params)});
  const seen=new Map();
  const server=http.createServer(async (req,res) => {
    // Never accept other network interfaces, browser cross-origin calls, or unauthenticated clients.
    if(req.socket.remoteAddress!=='127.0.0.1'||req.headers.origin||req.headers.host !== '127.0.0.1:'+server.address().port) return message(res,403,{ok:false,error:{code:'forbidden',message:'Solo clientes locales autorizados'}});
    if(req.url!=='/v1' || req.method!=='POST') return message(res,404,{ok:false,error:{code:'not_found',message:'Ruta no admitida'}});
    if(!constantEqual(req.headers['x-capri-orca-token'],token)) return message(res,401,{ok:false,error:{code:'unauthorized',message:'Clave de conexion no valida'}});
    if(!/^application\/json(?:\s*;|\s*$)/i.test(req.headers['content-type']||'')) return message(res,415,{ok:false,error:{code:'unsupported_media_type',message:'Se requiere application/json'}});
    if(Number(req.headers['content-length'])>MAX_BODY) return message(res,413,{ok:false,error:{code:'too_large',message:'Solicitud demasiado grande'}});
    let payload;
    try {
      // Buffer.concat avoids corrupting accented characters when UTF-8 bytes cross TCP chunks.
      const chunks=[]; let received=0;
      for await(const chunk of req) { received+=chunk.length; if(received>MAX_BODY) throw new BridgeError('too_large','Solicitud demasiado grande'); chunks.push(chunk); }
      payload=Buffer.concat(chunks,received).toString('utf8');
      const parsed=JSON.parse(payload);
      if(!parsed || typeof parsed!=='object' || Array.isArray(parsed)) throw new BridgeError('invalid_params','Solicitud JSON debe ser un objeto');
      if(parsed.version!==BRIDGE_VERSION || typeof parsed.operation!=='string') throw new BridgeError('invalid_params','Version o accion no valida');
      const mutating=new Set(['open_workspace','send_prompt','focus_agent','launch_agent','resume_session','open_file','select_account']);
      const requestId=parsed.requestId;
      if(mutating.has(parsed.operation) && (typeof requestId!=='string'|| !/^[a-zA-Z0-9-]{10,90}$/.test(requestId))) throw new BridgeError('invalid_params','Falta requestId para accion que modifica Orca');
      const now=Date.now();
      for (const [key,row] of seen) if(now-row.at>120000)seen.delete(key);
      if (seen.size>=250) seen.delete(seen.keys().next().value);
      if(mutating.has(parsed.operation) && seen.has(requestId)) throw new BridgeError('duplicate','No se repite una accion con el mismo requestId');
      if(mutating.has(parsed.operation)) seen.set(requestId,{at:now});
      const output=await bridge.dispatch(parsed.operation,parsed.params||{});
      message(res,200,{ok:true,result:output});
    } catch(e) {
      const status=e.code==='too_large'?413 : e.code==='unauthorized'?401 : (e.code?400:500);
      if(!(e instanceof SyntaxError))log(`Capri-Orca ${e.code||'unexpected'}: ${String(e.message).slice(0,180)}`);
      message(res,status,{ok:false,error:{code:e.code||(e instanceof SyntaxError?'invalid_json':'action_failed'),message:e.message||'Error',...(e.details?{details:e.details}:{})}});
    }
  });
  server.requestTimeout=20_000;
  server.headersTimeout=15_000;
  server.keepAliveTimeout=1_000;
  await new Promise((resolve,reject)=>{server.once('error',reject); server.listen(0,'127.0.0.1',resolve)});
  const port=server.address().port;
  const data={version:BRIDGE_VERSION,host:'127.0.0.1',port,token,startedAt:Date.now()};
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(data),{encoding:'utf8',mode:0o600,flag:'wx'});
  try{fs.renameSync(tmp,file)}catch(e){try{fs.unlinkSync(tmp)}catch{};server.close();throw e}
  log('Capri-Orca Bridge escuchando solo en 127.0.0.1; autenticacion activada');
  const stop=async()=>{
    try{const current=JSON.parse(fs.readFileSync(file,'utf8'));if(current.token===token&&current.port===port)fs.unlinkSync(file)}catch{}
    await new Promise(resolve=>server.close(resolve));
  };
  return {server,port,file,stop};
}
let active;
export default async function activate(orca) {
  active=await startServer(orca,{log:message=>orca.log(message)});
  orca.commands.register('bridge-info',()=>`Capri-Orca Bridge activo en puerto local ${active.port}. Archivo de conexion: ${active.file}. El token no se muestra.`);
}
export async function deactivate(){if(active){await active.stop();active=undefined}}
