/** Lectura SOLO de los datos que Orca devuelve. No hay scrapes, claves ni cuotas inventadas. */
import {execFile} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const LIMIT = 2_000_000;
const providers = ['claude','codex','gemini','opencodeGo','kimi','antigravity','minimax','grok','cursor','zcode','muse'];
const supportedSwitch = new Set(['claude','codex','opencode','devin','antigravity']);
const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const safe = x => typeof x === 'string' ? x.replace(/[\u0000-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '').slice(0,160) : null;
const fromPercent = x => Number.isFinite(x) && x >= 0 && x <= 100 ? Number((100 - x).toFixed(1)) : null;
const numbersOnly = x => Number.isFinite(x) && x > 0 ? x : null;
const windowSummary = value => {
  if(!isObject(value)) return null;
  const remainingPercent=fromPercent(value.usedPercent);
  if(remainingPercent===null) return null;
  return {
    remainingPercent,
    usedPercent:Number(value.usedPercent),
    resetAt: numbersOnly(value.resetsAt),
    windowMinutes: numbersOnly(value.windowMinutes)
  };
};
export function describeRateLimit(raw) {
  if(!isObject(raw)) return {status:'unavailable',updatedAt:null,stale:true,windows:[],buckets:[],notice:'Orca no informa la cuota'};
  const status=['ok','error','unavailable','idle','fetching'].includes(raw.status)?raw.status:'unavailable';
  const windows=[];
  for(const [id,label] of [['session','5 horas'],['weekly','semanal'],['fableWeekly','Fable semanal'],['monthly','mensual']]) {
    const info=windowSummary(raw[id]);if(info)windows.push({id,label,...info});
  }
  const buckets=Array.isArray(raw.buckets)?raw.buckets.slice(0,16).flatMap(b=>{
    const info=windowSummary(b);
    return info?[{name:safe(b.name)||'modelo',group:safe(b.group),...info}]:[];
  }):[];
  let notice=null;
  if(status!=='ok')notice=safe(raw.error)|| (status==='fetching'?'Consultando cuota':status==='idle'?'Cuota no consultada':'Datos de cuota no disponibles');
  if(status==='ok' && windows.length===0 && buckets.length===0)notice='Orca no devuelve porcentajes para este proveedor';
  const updatedAt=numbersOnly(raw.updatedAt);
  const now=Date.now();
  // A future-dated observation cannot be trusted as fresh (clock skew or malformed CLI data).
  // A failed, idle or in-progress fetch must never make cached percentages appear current.
  const stale=status!=='ok' || updatedAt===null || updatedAt>now+60_000 || now-updatedAt>30*60*1000;
  return {status,updatedAt,stale,windows,buckets,notice,planType:safe(raw.planType),
    extraUsage:(isObject(raw.extraUsage) && raw.extraUsage.enabled===true)?{unit:raw.extraUsage.unit, balance:Number.isFinite(raw.extraUsage.balance)?raw.extraUsage.balance:null}:null};
}
const safeAccount = (x) => ({id:safe(x.id),name:safe(x.displayName)||safe(x.label)||safe(x.email)||safe(x.id)||'Cuenta sin nombre',needsSignIn:x.needsSignIn===true});
const makeAccountRows = (snapshot, provider) => {
  const root=isObject(snapshot?.[provider])?snapshot[provider]:{};
  const list=Array.isArray(root.accounts)?root.accounts:[];
  const activeId=root.activeAccountIdsByRuntime?.host ?? root.activeAccountId ?? null;
  const rows=list.map(x=>({...safeAccount(x),active:x.id===activeId}));
  if((provider==='claude'||provider==='codex') && activeId===null) {
    rows.unshift({id:'system',name:'Cuenta predeterminada',needsSignIn:false,active:true});
  }
  const activeRate=describeRateLimit(snapshot?.rateLimits?.[provider]);
  const cached=provider==='claude'?snapshot?.rateLimits?.inactiveClaudeAccounts:provider==='codex'?snapshot?.rateLimits?.inactiveCodexAccounts:null;
  for(const row of rows){
    if(row.active) row.usage=(provider==='antigravity'&&activeRate.status==='unavailable')?describeRateLimit(list.find(x=>x?.id===row.id)?.usage):activeRate;
    else {
      const inactive=Array.isArray(cached)?cached.find(x=>x?.accountId===row.id):null;
      if(inactive?.rateLimits)row.usage=describeRateLimit(inactive.rateLimits);
      else if(provider==='antigravity')row.usage=describeRateLimit(list.find(x=>x?.id===row.id)?.usage);
      else row.usage={status:'unavailable',updatedAt:null,windows:[],buckets:[],notice:'Sin lectura de cuota de esta cuenta'};
    }
  }
  return rows;
};
export function summarizeAccountSnapshot(input) {
  const snapshot=isObject(input?.result)?input.result:input;
  if(!isObject(snapshot)||!isObject(snapshot.rateLimits)) throw new Error('Orca no devolvió rateLimits; no se inventan porcentajes');
  const usage=providers.map(provider=>({provider,...describeRateLimit(snapshot.rateLimits[provider])}));
  const accounts=['claude','codex','antigravity','opencode','devin'].map(provider=>({provider,accounts:makeAccountRows(snapshot,provider)}));
  // No credentials, paths, tokens, auth files or secrets in the local response.
  return {usage,accounts,source:'orca account list --json',observedAt:Date.now()};
}
export function chooseCliExecutable(env=process.env,platform=process.platform) {
  if(env.ORCA_CLI_COMMAND) {
    if(/[\r\n"'<>|&%!^]/.test(env.ORCA_CLI_COMMAND))throw new Error('ORCA_CLI_COMMAND no válido');
    return env.ORCA_CLI_COMMAND;
  }
  if(platform==='win32') {
    const local=env.LOCALAPPDATA;
    if(local)for(const folder of ['Orca','orca']){
      const executable=path.win32.join(local,'Programs',folder,'resources','bin','orca.exe');
      if(fs.existsSync(executable))return executable;
    }
    return 'orca.exe';
  }
  return platform==='linux'?'orca-ide':'orca';
}
export function createAccountCli({executable=chooseCliExecutable(), exec=execFile}={}) {
  const call = args => new Promise((resolve,reject)=>{
    exec(executable,args,{encoding:'utf8',timeout:30_000,maxBuffer:LIMIT,windowsHide:true,shell:false},(err,stdout,stderr)=>{
      if(err)return reject(new Error(`No se pudo ejecutar Orca CLI (${err.code||'error'}). Activa Orca CLI en Settings > General.`));
      let data;try{data=JSON.parse(stdout)}catch{return reject(new Error('Orca CLI no devolvió JSON. Comprueba orca status --json.'))}
      if(data?.ok!==true || !isObject(data.result))return reject(new Error(safe(data?.error?.message)||'Orca CLI respondió con error'));
      resolve(data);
    });
  });
  return {
    list:()=>call(['account','list','--json']),
    select:async (provider,id)=>{
      if(!supportedSwitch.has(provider)||typeof id!=='string'||!(/^[A-Za-z0-9@._:+-]{1,150}$/.test(id)))throw new Error('Cuenta o proveedor no válido');
      return call(['account','select','--agent',provider,'--account',id,'--json']);
    }
  };
}
export async function accountOperation(cli,op,p={}){
  if(op==='accounts_status')return summarizeAccountSnapshot(await cli.list());
  if(op!=='select_account')throw new Error('Operación de cuenta no admitida');
  const provider=p.provider,id=p.accountId;
  if(!supportedSwitch.has(provider)||typeof id!=='string')throw new Error('Cuenta inválida');
  const before=summarizeAccountSnapshot(await cli.list());
  const group=before.accounts.find(x=>x.provider===provider);
  if(!group)throw new Error('Proveedor no encontrado');
  const found=group.accounts.find(x=>x.id===id && !x.needsSignIn);
  if(!found)throw new Error('Cuenta no verificada o requiere volver a iniciar sesión');
  if(found.active)return {selected:true,unchanged:true,provider,accountName:found.name,scope:'sin cambios'};
  await cli.select(provider,id);
  const after=summarizeAccountSnapshot(await cli.list());
  const selected=after.accounts.find(x=>x.provider===provider)?.accounts.find(x=>x.id===id);
  if(!selected?.active)throw new Error('Orca no confirmó la cuenta activa: revisa su configuración, no se reintentó');
  return {selected:true,unchanged:false,provider,accountName:found.name,
    scope:provider==='antigravity'?'Cuenta de Antigravity seleccionada; la sesión actual puede requerir reinicio':'La cuenta seleccionada afecta a nuevas sesiones; las terminales ya abiertas mantienen su cuenta'};
}
