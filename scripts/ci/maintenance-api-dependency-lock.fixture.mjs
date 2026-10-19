/** Conservative archive-build compatibility check. Lock equality is necessary
 * evidence for this fixture, never proof of installed bytes or native ABI. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import yaml from 'js-yaml';
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&Object.getPrototypeOf(item)===Object.prototype
  ?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
export function verifyArchivedApiDependencyLock({previousLock,currentLock,previousManifest,currentManifest}){
  assert.equal(previousManifest,currentManifest,'ARCHIVED_API_MANIFEST_CHANGED');
  const previous=yaml.load(previousLock),current=yaml.load(currentLock);
  assert.equal(String(previous?.lockfileVersion),'9.0');assert.equal(String(current?.lockfileVersion),'9.0');
  const api=previous.importers?.['apps/api'];assert.ok(api&&Object.getPrototypeOf(api)===Object.prototype);
  assert.equal(canonical(api),canonical(current.importers?.['apps/api']),'ARCHIVED_API_IMPORTER_CHANGED');
  for(const kind of ['dependencies','devDependencies','optionalDependencies'])for(const value of Object.values(api[kind]??{})){
    assert.ok(value&&typeof value.version==='string'&&!/^(?:link|file|workspace|https?):/.test(value.version),'ARCHIVED_API_NONREGISTRY_DEPENDENCY');
  }
  // Stronger than comparing just API's transitive closure: require every
  // resolution/snapshot/settings map unchanged. Changes to other importers
  // alone cannot select different dependencies for this archived API build.
  const resolved=Object.fromEntries(Object.entries(previous).filter(([key])=>key!=='importers'));
  const currentResolved=Object.fromEntries(Object.entries(current).filter(([key])=>key!=='importers'));
  assert.ok(resolved.packages&&resolved.snapshots);
  assert.equal(canonical(resolved),canonical(currentResolved),'ARCHIVED_API_RESOLUTIONS_CHANGED');
  return {schema:'phoenix.archived-api-lock-equivalence/v1',fixtureOnly:true,productionAuthority:false,
    manifestSha256:createHash('sha256').update(previousManifest).digest('hex'),apiImporterSha256:digest(api),
    allResolutionMapsSha256:digest(resolved),packages:Object.keys(resolved.packages).length,
    snapshots:Object.keys(resolved.snapshots).length,installedBytesVerified:false,nativeAbiVerified:false};
}
