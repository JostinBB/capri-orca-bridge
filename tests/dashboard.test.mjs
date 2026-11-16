import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {describeRateLimit,summarizeAccountSnapshot} from '../orca-plugin/accounts.mjs';
const src=fs.readFileSync(new URL('../capri-mod/capri-orca-bridge.capri-code',import.meta.url),'utf8');
test('ventana Capri y comandos show/hide aparecen en mod',()=>{
 for(const part of ['QuotaDashboard : Form','FormBorderStyle.None','ShowUsage("")','HideUsage()','"CAPRI   /   ORCA BRIDGE"','MIS CUOTAS','remainingPercent']) {
   assert.ok(src.includes(part),part);
 }
});
test('cuotas visuales no dependen de reconocimiento de micrófono ni voz nueva',()=>{
 const show=src.slice(src.indexOf('private void ShowUsage(string provider)'),src.indexOf('private void ReadUsage(string provider)'));
 assert.ok(show.includes('quotaDashboard.Render(result,provider)'));
 assert.ok(!show.includes('Say('),'pantalla no debería narrar cuotas por defecto');
});
test('la voz es optativa y solo se activa con la petición leer cuotas',()=>{
 assert.ok(src.includes('ReadUsage("")'));
 assert.ok(src.includes('leeme|lee|read aloud|speak'));
});
test('ventanas de cuota se calculan con valores reales, sin números inventados',()=>{
 const a=describeRateLimit({status:'ok',session:{usedPercent:7,windowMinutes:300,resetsAt:null},weekly:{usedPercent:100,windowMinutes:10080,resetsAt:null}});
 assert.deepEqual(a.windows.map(x=>x.remainingPercent),[93,0]);
 assert.equal(describeRateLimit({status:'unavailable'}).windows.length,0);
});
test('el render admite una respuesta de cuentas con información no disponible',()=>{
 const x=summarizeAccountSnapshot({ok:true,result:{claude:{accounts:[],activeAccountId:null},codex:{accounts:[],activeAccountId:null},rateLimits:{claude:null,codex:null}}});
 assert.equal(x.usage.find(y=>y.provider==='claude').status,'unavailable');
});
