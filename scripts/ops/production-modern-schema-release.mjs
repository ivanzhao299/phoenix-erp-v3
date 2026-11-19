/** Exact operations accepted by the reviewed production SSH wrapper. */
import {pathToFileURL} from 'node:url';
import {modernSchemaDispatchFromEnvironment, prepareModernSchemaRelease} from './production-modern-schema-preparation.mjs';
import {superviseModernSchemaRelease} from './production-modern-schema-supervisor.mjs';
import {validateModernSchemaContext} from './production-modern-schema-authority.mjs';
import {ModernSchemaRegistry} from './production-modern-schema-registration.mjs';
import {ModernSchemaReadClient} from './production-modern-schema-read-client.mjs';
import {verifyModernSchemaStage} from './production-modern-schema-stage.mjs';
import {finalizeCommittedModernSchemaOpen} from './production-modern-schema-terminal.mjs';
import {finalizeCommittedModernSchemaRecoveredOriginal, observeCommittedModernSchemaRecoveryOpen} from './production-modern-schema-recover-original.mjs';
import {readPublicManifest} from './background-control-manifest.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';

const fail = () => { throw Error('MODERN_SCHEMA_ENTRY_HOLD'); };
const failures = new Set(['BOOTSTRAP','FLOOR','HOST_SURFACE','PLAN','BACKUP','REHEARSAL','HISTORICAL_AUDIT','UNSPECIFIED']);

export async function readModernSchemaRunRequest(stream) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += value.length;
    if (bytes > 20480) fail();
    chunks.push(value);
  }
  let input;
  try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(); }
  if (!input || Object.getPrototypeOf(input) !== Object.prototype ||
      Object.keys(input).sort().join(',') !== 'githubReadToken,identityToken,preparationSha256,schema' ||
      input.schema !== 'phoenix.modern-schema-run-input/v1' ||
      typeof input.preparationSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.preparationSha256) ||
      typeof input.identityToken !== 'string' || input.identityToken.length > 16384 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(input.identityToken) ||
      typeof input.githubReadToken !== 'string' || !/^[A-Za-z0-9_.-]{10,2048}$/.test(input.githubReadToken)) fail();
  return input;
}

/** Protected re-entry after the original transport or process was lost. The
 * only supported effect is finalizing an already durable, exact public OPEN. */
export async function finalizeModernSchemaCommittedRelease(env) {
  const dispatch = modernSchemaDispatchFromEnvironment(env);
  const store = new ModernSchemaRegistry();
  store.guard();
  const stage = verifyModernSchemaStage(dispatch);
  const record = store.read('schema-release-preparation-' + dispatch.owner + '.json');
  const {preparationSha256,...content}=record;
  if(canonicalDigest(content)!==preparationSha256)fail();
  const context = validateModernSchemaContext(record.context);
  if (context.owner !== dispatch.owner || context.targetSha !== dispatch.targetSha || context.floorSha !== dispatch.floorSha ||
      !same(stage, record.stagedSource) || !/^[a-f0-9]{64}$/.test(record.preparationSha256 ?? '')) fail();
  const manifest = readPublicManifest();
  if (manifest?.phase !== 'OPEN' || manifest.owner !== dispatch.owner) fail();
  const targetCommitted = manifest.targetSha === dispatch.targetSha;
  const recoveryCommitted = manifest.targetSha === context.runtimeSha && observeCommittedModernSchemaRecoveryOpen(context);
  if (!targetCommitted && !recoveryCommitted) fail();
  if (targetCommitted && !store.exists('schema-release-open-commit-intent-' + context.owner + '.json')) fail();
  const client = new ModernSchemaReadClient();
  try {
    await client.start();
    const args = {context,preparationSha256:record.preparationSha256,client};
    if (targetCommitted) {
      const result = await finalizeCommittedModernSchemaOpen(args);
      if (result.outcome !== 'SUCCESS' || result.pendingMarkerCleared !== true || result.defaultOff !== true) fail();
    } else {
      const result = await finalizeCommittedModernSchemaRecoveredOriginal(args);
      if (result.formalTargetSuccess !== false || result.pendingMarkerCleared !== true || result.defaultOff !== true) fail();
    }
    return {schema:'phoenix.modern-schema-public-result/v1',owner:dispatch.owner,targetSha:dispatch.targetSha,
      outcome:targetCommitted ? 'SUCCESS' : 'HOLD',defaultOff:true};
  } finally {
    await client.close();
  }
}

export async function runModernSchemaEntry(args, env, stdin, dependencies = {}) {
  if (args.length !== 1 || !['prepare','run','finalize'].includes(args[0])) fail();
  const {owner,targetSha} = modernSchemaDispatchFromEnvironment(env);
  const binding = {owner,targetSha};
  if (args[0] === 'prepare') {
    let phase = 'BOOTSTRAP';
    try {
      const result = await (dependencies.prepare ?? prepareModernSchemaRelease)(env, {
        onStage(stage) { phase = failures.has(stage) ? stage : 'UNSPECIFIED'; },
      });
      if (result?.schema !== 'phoenix.modern-schema-public-preparation/v1' || result.owner !== owner || result.targetSha !== targetSha ||
          result.prepared !== true || typeof result.preparationSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(result.preparationSha256) ||
          Object.keys(result).sort().join(',') !== 'owner,preparationSha256,prepared,schema,targetSha') fail();
      return {result, exitCode: 0};
    } catch {
      return {result: {schema:'phoenix.modern-schema-public-preparation-hold/v1', ...binding, prepared:false, failure:phase}, exitCode: 1};
    }
  }

  let input;
  try {
    let result;
    if (args[0] === 'finalize') {
      for await (const chunk of stdin) if (chunk.length !== 0) fail();
      result = await (dependencies.finalize ?? finalizeModernSchemaCommittedRelease)(env);
    } else {
      input = await readModernSchemaRunRequest(stdin);
      result = await (dependencies.supervise ?? superviseModernSchemaRelease)(env, input);
    }
    if (result?.schema !== 'phoenix.modern-schema-public-result/v1' || result.owner !== owner || result.targetSha !== targetSha ||
        result.defaultOff !== true || !['SUCCESS','HOLD'].includes(result.outcome) ||
        Object.keys(result).sort().join(',') !== 'defaultOff,outcome,owner,schema,targetSha') fail();
    return {result, exitCode: result.outcome === 'SUCCESS' ? 0 : 1};
  } catch {
    return {result: {schema:'phoenix.modern-schema-public-result/v1', ...binding, outcome:'HOLD', defaultOff:true}, exitCode: 1};
  } finally {
    if (input) {
      input.identityToken = null;
      input.githubReadToken = null;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const {result, exitCode} = await runModernSchemaEntry(process.argv.slice(2), process.env, process.stdin);
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exitCode = exitCode;
  } catch {
    process.stderr.write('MODERN_SCHEMA_ENTRY_HOLD\n');
    process.exitCode = 1;
  }
}
