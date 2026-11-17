import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeBridge} from '../orca-plugin/bridge-core.mjs';

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const version = read('../VERSION').trim();

test('version semantica coincide en manifest, mod C# y ping HTTP', async () => {
  assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  const manifest = JSON.parse(read('../orca-plugin/orca-plugin.json'));
  assert.equal(manifest.version, version);
  const capri = read('../capri-mod/capri-orca-bridge.capri-code');
  assert.ok(capri.includes('// version: ' + version));
  const bridge = makeBridge({api:{major:1,minor:10},host:{has:()=>false,call:()=>{throw Error('No calls expected')}}});
  assert.equal((await bridge.dispatch('ping')).bridge, version);
});

test('compatibilidad declarada no afirma pruebas reales en Windows', () => {
  const metadata = JSON.parse(read('../compatibility/upstreams.json'));
  assert.equal(metadata.validation.realDesktopIntegrationVerified, false);
  assert.match(metadata.orca.reviewedRelease, /^v\d+\.\d+\.\d+$/);
  assert.match(metadata.capri.reviewedRelease, /^v\d+\.\d+\.\d+(?:\.\d+)?$/);
});
