/** Read-only source/dependency plan for an owned legacy API image. This does
 * not build, start, fence or drain a runtime, and never grants release rights. */
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { canonicalDigest } from '../ops/production-maintenance-receipts.mjs';
const yaml = createRequire(import.meta.url)('js-yaml');
const SHA = /^[a-f0-9]{40}$/;
const fail = code => { throw Error('OWNED_LEGACY_SOURCE_HOLD='+code); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const helperFile = fileURLToPath(import.meta.url);
const loadedHelperSha256 = hash(fs.readFileSync(helperFile));
export function pinnedApiSourceHelperIdentity() {
  if (hash(fs.readFileSync(helperFile)) !== loadedHelperSha256) fail('LOADED_HELPER_SOURCE_CHANGED');
  return loadedHelperSha256;
}
// Preserve the capsule's existing tree-summary encoding; commit SHA remains
// the actual source identity. Both planner and builder use this exact function.
export const pinnedApiTreeHash = tree => hash(tree.trim());
const controls = ['apps/api/package.json','apps/api/tsconfig.json','apps/api/tsconfig.build.json'];
const selected = ['apps/api/src', ...controls];
function read(root, args) {
  try { return execFileSync('/usr/bin/git', ['--no-replace-objects','-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','--no-optional-locks',...args], {
    cwd: root, env: { PATH:'/usr/bin:/bin', HOME:'/nonexistent-owned-api-build' }, timeout:10000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe'] }).toString('utf8'); }
  catch { fail('READONLY_GIT_SOURCE_UNAVAILABLE'); }
}
function lockedGraph(raw) {
  let value; try { value=yaml.load(raw,{schema:yaml.JSON_SCHEMA}); } catch { fail('LOCKFILE_INVALID'); }
  if (!value || String(value.lockfileVersion)!=='9.0' || !value.importers?.['apps/api'] || !value.packages || !value.snapshots
    || [value.importers['apps/api'],value.packages,value.snapshots].some(v=>Object.getPrototypeOf(v)!==Object.prototype)) fail('LOCKFILE_GRAPH_UNSUPPORTED');
  // Deliberately stricter than an incomplete transitive resolver. Any package
  // or snapshot-map change requires a separate dependency reconstruction.
  return canonicalDigest({apiImporter:value.importers['apps/api'],packages:value.packages,snapshots:value.snapshots});
}
export function planPinnedLegacyApiSource(request) {
  pinnedApiSourceHelperIdentity();
  if(!request||Object.getPrototypeOf(request)!==Object.prototype||Object.keys(request).sort().join(',')!=='expectedHead,root,sourceSha')fail('EXACT_OLD_NEW_SOURCE_REQUIRED');
  const {root,sourceSha,expectedHead}=request;
  if (!path.isAbsolute(root||'') || fs.realpathSync(root)!==root || !SHA.test(sourceSha||'') || !SHA.test(expectedHead||'') || sourceSha===expectedHead) fail('EXACT_OLD_NEW_SOURCE_REQUIRED');
  const graftFile=path.resolve(root,read(root,['rev-parse','--git-path','info/grafts']).trim());
  if(fs.lstatSync(graftFile,{throwIfNoEntry:false})!==undefined)fail('GRAFTED_SOURCE_HISTORY_UNSUPPORTED');
  if (read(root,['rev-parse','HEAD']).trim()!==expectedHead) fail('BUILDER_HEAD_CHANGED');
  read(root,['cat-file','-e',sourceSha+'^{commit}']);read(root,['merge-base','--is-ancestor',sourceSha,expectedHead]);
  const blobs={};
  for (const file of controls) {
    const before=read(root,['rev-parse',sourceSha+':'+file]).trim(),after=read(root,['rev-parse',expectedHead+':'+file]).trim();
    if (!SHA.test(before)||before!==after) fail('API_BUILD_CONTROLS_CHANGED');blobs[file]=before;
  }
  const oldLock=read(root,['show',sourceSha+':pnpm-lock.yaml']),builderLock=read(root,['show',expectedHead+':pnpm-lock.yaml']);
  const graph=lockedGraph(oldLock);if(graph!==lockedGraph(builderLock))fail('LOCKED_RESOLUTION_GRAPH_CHANGED');
  if(read(root,['rev-parse','HEAD']).trim()!==expectedHead)fail('BUILDER_HEAD_CHANGED');
  const sourceTreeHash=pinnedApiTreeHash(read(root,['ls-tree','-r',sourceSha,'--',...selected]));
  pinnedApiSourceHelperIdentity();
  return {schema:'phoenix.owned-pinned-legacy-api-source/v1',fixtureOnly:true,productionAuthorized:false,
    sourceSha,builderHead:expectedHead,pinnedApiSourceHelperSha256:loadedHelperSha256,sourceTreeHash,sourceTreeEncoding:'UTF8_GIT_LS_TREE_TRIMMED_V1',
    exactBuildControlBlobs:blobs,sourceLockSha256:hash(oldLock),builderLockSha256:hash(builderLock),lockedResolutionGraphSha256:graph,
    dependencyContract:'API_IMPORTER_PLUS_ENTIRE_PACKAGE_AND_SNAPSHOT_MAPS_EQUAL',archiveSource:'EXACT_OLD_GIT_OBJECTS',
    installedDependencyVerification:'NOT_RUN_EXISTING_MODULES_NOT_CERTIFIED',compilerVerification:'NOT_RUN',
    buildExecuted:false,runtimeStartup:'NOT_RUN',legacyDrainResult:'UNSUPPORTED'};
}
