/** Capri -> Orca. Solo llamadas a la API publica de plugins; nunca clics. */
export class BridgeError extends Error {
  constructor(code, message, details = undefined) { super(message); this.code = code; this.details = details; }
}
const isString = x => typeof x === 'string' && x.trim().length > 0;
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const capText = (s, max = 14000) => isString(s) && s.length <= max && !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(s);
const required = (value, name, max=500) => { if (!isString(value) || value.length > max || !capText(value, max)) throw new BridgeError('invalid_params', `${name} invalido`); return value.trim(); };
const asArray = a => Array.isArray(a) ? a : [];

export function makeBridge(orca, accountCli) {
  const has = method => orca.host.has(method);
  const supports = method => { if (!has(method)) throw new BridgeError('unsupported', `Orca no ofrece ${method}; actualiza Orca`); };
  const api = (method, params={}) => { supports(method); return orca.host.call(method, params); };
  const workspaces = async () => {
    const result = await api('workspace.list', {});
    if (result?.truncated) throw new BridgeError('truncated', 'Orca ha truncado la lista de workspaces; no se seleccionara uno a ciegas');
    return asArray(result?.workspaces);
  };
  const findWorkspace = async workspaceId => {
    const id = required(workspaceId, 'workspaceId');
    const entries = await workspaces();
    const entry = entries.find(w => w.id === id);
    if (!entry) throw new BridgeError('not_found', 'Ese workspace ya no existe. Vuelve a listar proyectos.');
    return entry;
  };
  const validAgents = new Set(['claude','codex','antigravity','gemini','opencode','pi','grok','qwen-code','copilot','cursor','kimi','droid','kiro','hermes','qoder','codebuddy','muse','devin','opencode2']);
  const validateAgent = value => {
    const agent=required(value,'agent',80).toLowerCase().replace(/\s+/g,'');
    const normalized=agent==='claudecode'?'claude':agent;
    if(!validAgents.has(normalized)) throw new BridgeError('invalid_params','Agente desconocido o no admitido por el puente');
    return normalized;
  };
  const agentList = async workspaceId => {
    // 1.10 introduce workspaceId en agents.list. Versiones anteriores solo ven el workspace enfocado.
    supports('agents.list');
    if ((orca.api?.minor || 0) < 10) throw new BridgeError('unsupported', 'Para consultar agentes de otros proyectos se necesita Orca Host API 1.10 o posterior');
    return asArray((await api('agents.list', {workspaceId})).agents);
  };
  const agentsFor = async workspaceId => {
    await findWorkspace(workspaceId);
    return agentList(workspaceId);
  };
  const agentMatches = (candidate, name) => {
    const a = norm(candidate).replace(/[\s_-]/g,'');
    const b = norm(name).replace(/[\s_-]/g,'');
    return a === b || (b === 'claudecode' && a === 'claude') || (a === 'claudecode' && b === 'claude');
  };
  const findTerminalAgent = async ({workspaceId,agent,terminalId}) => {
    const list = await agentsFor(workspaceId);
    let matches = list.filter(a => agentMatches(a.agent, agent));
    if (terminalId) matches = matches.filter(a => a.terminalId === terminalId);
    if (!matches.length) throw new BridgeError('not_found', `No hay terminal verificada para ${agent} en ese workspace (las sesiones Chat no son terminales)`, {agents:list.map(a=>({agent:a.agent,terminalId:a.terminalId,state:a.state,title:a.title}))});
    if (matches.length > 1) throw new BridgeError('ambiguous', 'Hay varias sesiones de ese agente; elige una terminal especifica', {candidates:matches.map(a=>({terminalId:a.terminalId,title:a.title,state:a.state}))});
    if (!matches[0].terminalId) throw new BridgeError('chat_unsupported', 'La sesion seleccionada es Chat UI. Esta version no puede enviarle prompts por terminal API');
    return matches[0];
  };
  const dispatch = async (op,p={}) => {
    if(op==='accounts_status'||op==='select_account') {
      if(!accountCli)throw new BridgeError('unsupported','La CLI de cuentas de Orca no esta configurada');
      try { return await accountCli.dispatch(op,p); }
      catch(e) { throw new BridgeError('account_error',String(e.message||e)); }
    }
    if (!p || typeof p!=='object' || Array.isArray(p)) throw new BridgeError('invalid_params','params debe ser un objeto');
    switch(op) {
      case 'ping': return {bridge:'0.10.0',accounts:!!accountCli,hostApi:orca.api,capabilities:{projects:has('project.list'),sessions:has('agent.listSessions'),resuming:has('agent.resume'),agentScope:(orca.api?.minor||0)>=10}};
      case 'projects': {
        const ws = await workspaces();
        const projects = has('project.list') ? await api('project.list',{}) : {projects:[]};
        if (projects.truncated) throw new BridgeError('truncated','La lista de proyectos esta truncada');
        return {projects:asArray(projects.projects).map(x=>({id:x.id,name:x.name,kind:x.kind,path:x.path,hostId:x.hostId})),workspaces:ws.map(x=>({id:x.id,name:x.name,project:x.project,projectId:x.projectId,path:x.path,branch:x.branch,kind:x.kind,hostId:x.hostId})),hint:'Solo se pueden abrir workspaces que ya existen. Un proyecto sin workspace requiere crearlo en Orca.'};
      }
      case 'open_workspace': {
        const ws=await findWorkspace(p.workspaceId);
        const result=await api('workspace.open',{workspaceId:ws.id});
        return {opened:result.opened===true,workspace:{id:ws.id,name:ws.name,project:ws.project}};
      }
      case 'agents': {
        const ws=await findWorkspace(p.workspaceId);
        const list=await agentsFor(ws.id);
        return {workspace:{id:ws.id,name:ws.name},agents:list.map(a=>({terminalId:a.terminalId,title:a.title,agent:a.agent,state:a.state,sessionId:a.sessionId??null,task:a.task?.title??null}))};
      }
      case 'send_prompt': {
        const workspaceId=required(p.workspaceId,'workspaceId');
        const agent=validateAgent(p.agent);
        if (!capText(p.prompt, 12000)) throw new BridgeError('invalid_params','Prompt vacio, demasiado largo o con caracteres de control');
        const target=await findTerminalAgent({workspaceId,agent,terminalId:p.terminalId||null});
        const result=await api('terminal.sendText',{terminalId:target.terminalId,text:p.prompt,enter:true});
        if(result?.accepted !== true) throw new BridgeError('not_accepted','Orca no confirmo el envio; NO se reintento');
        return {accepted:true,agent:target.agent,terminalId:target.terminalId,workspaceId,notice:'El prompt se recibio; no significa que haya terminado.'};
      }
      case 'agent_status': {
        const workspaceId=required(p.workspaceId,'workspaceId');
        const agent=validateAgent(p.agent);
        const target=await findTerminalAgent({workspaceId,agent,terminalId:p.terminalId||null});
        return {agent:target.agent,state:target.state,terminalId:target.terminalId,workspaceId,
          sessionId:target.sessionId||null,task:target.task?.title||null};
      }
      case 'read_agent': {
        const workspaceId=required(p.workspaceId,'workspaceId');
        const agent=validateAgent(p.agent);
        const target=await findTerminalAgent({workspaceId,agent,terminalId:p.terminalId||null});
        const result=await api('terminal.read',{terminalId:target.terminalId,maxLines:Math.min(100,Math.max(1,Number(p.maxLines)||35))});
        return {agent:target.agent,state:target.state,terminalId:target.terminalId,lines:asArray(result?.lines).slice(-100).map(x=>String(x).slice(0,500)),truncated:!!result?.truncated};
      }
      case 'focus_agent': {
        const workspaceId=required(p.workspaceId,'workspaceId');
        const agent=validateAgent(p.agent);
        const target=await findTerminalAgent({workspaceId,agent,terminalId:p.terminalId||null});
        const result=await api('terminal.focus',{terminalId:target.terminalId});
        return {focused:result.focused === true,terminalId:target.terminalId};
      }
      case 'launch_agent': {
        const ws=await findWorkspace(p.workspaceId);
        const agent=validateAgent(p.agent);
        if (p.prompt && !capText(p.prompt,12000)) throw new BridgeError('invalid_params','Prompt no valido');
        const result=await api('agent.launch',{workspaceId:ws.id,agent,...(p.prompt?{prompt:p.prompt}:{})});
        return {launched:true,terminalId:result.terminalId,workspaceId:ws.id,agent,notice:'Orca inicio una nueva terminal del agente; no es una sesion Chat UI.'};
      }
      case 'session_history': {
        const ws=await findWorkspace(p.workspaceId);
        const result=await api('agent.listSessions',{workspaceId:ws.id,limit:Math.min(50,Math.max(1,Number(p.limit)||20))});
        const rows=asArray(result.sessions).filter(x=> !p.agent || agentMatches(x.agent,p.agent));
        return {sessions:rows.map(x=>({sessionId:x.sessionId,agent:x.agent,title:x.title,running:x.running,
            updatedAt:x.updatedAt,workspaceId:x.workspaceId??null,branch:x.branch??null})),truncated:!!result.truncated};
      }
      case 'resume_session': {
        const ws=await findWorkspace(p.workspaceId);
        const agent=validateAgent(p.agent), sessionId=required(p.sessionId,'sessionId',250);
        if(has('agent.listSessions')) {
          const h=await api('agent.listSessions',{workspaceId:ws.id,limit:200});
          if(h.truncated) throw new BridgeError('truncated','Historial truncado. No se puede verificar la sesion');
          const record=asArray(h.sessions).find(s=>s.sessionId===sessionId && agentMatches(s.agent,agent) && s.workspaceId===ws.id);
          if(!record) throw new BridgeError('not_found','La sesion no pertenece a ese agente y workspace');
        } else throw new BridgeError('unsupported','Orca necesita agent.listSessions para validar sesiones');
        const result=await api('agent.resume',{workspaceId:ws.id,agent,sessionId});
        return {terminalId:result.terminalId,started:result.started,workspaceId:ws.id};
      }
      case 'open_file': {
        const ws=await findWorkspace(p.workspaceId), file=required(p.path,'path',600);
        if(file.includes('\0') || /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(file) || /^[\\/]/.test(file) || /^[a-zA-Z]:/.test(file))
          throw new BridgeError('invalid_params','Ruta invalida: usa una ruta relativa al workspace');
        const result=await api('editor.open',{workspaceId:ws.id,path:file});
        return {opened:result.opened===true};
      }
      default: throw new BridgeError('unknown_operation','Operacion no admitida');
    }
  };
  return {dispatch};
}
