import test from 'node:test';import assert from 'node:assert/strict';
import yaml from 'js-yaml';
import {verifyArchivedApiDependencyLock} from './maintenance-api-dependency-lock.fixture.mjs';
const manifest='{"dependencies":{"pg":"8.20.0"}}';
const lock=()=>({lockfileVersion:'9.0',settings:{autoInstallPeers:true},importers:{'.':{},'apps/api':{dependencies:{pg:{specifier:'8.20.0',version:'8.20.0'}}}},packages:{'pg@8.20.0':{resolution:{integrity:'FIXTURE_NOT_AN_INSTALL_INTEGRITY'}}},snapshots:{'pg@8.20.0':{}}});
const verify=(a,b,other={})=>verifyArchivedApiDependencyLock({previousLock:yaml.dump(a),currentLock:yaml.dump(b),previousManifest:manifest,currentManifest:manifest,...other});
test('root importer-only dev tool change permits equality while declining installed-byte/ABI claims',()=>{
 const a=lock(),b=lock();b.importers['.']={devDependencies:{tool:{version:'1.0.0'}}};
 const v=verify(a,b);assert.equal(v.installedBytesVerified,false);assert.equal(v.nativeAbiVerified,false);assert.equal(v.productionAuthority,false);
});
for(const [name,mutate]of[
 ['API version',v=>v.importers['apps/api'].dependencies.pg.version='8.19.0'],
 ['dependency snapshot',v=>v.snapshots['pg@8.20.0'].dependencies={changed:'1.0.0'}],
 ['package integrity',v=>v.packages['pg@8.20.0'].resolution.integrity='DIFFERENT'],
 ['peer settings',v=>v.settings.autoInstallPeers=false],['new override',v=>v.overrides={pg:'8.19.0'}],
])test(name+' invalidates archived compatibility',()=>{const a=lock(),b=lock();mutate(b);assert.throws(()=>verify(a,b));});
test('equal local-link importers still cannot authorize dependency reuse',()=>{
 const a=lock();a.importers['apps/api'].dependencies.pg.version='link:../../private';assert.throws(()=>verify(a,a),/NONREGISTRY/);
});
test('manifest drift fails even when lock importer was not updated',()=>assert.throws(()=>verify(lock(),lock(),{currentManifest:'{}'}),/MANIFEST_CHANGED/));
