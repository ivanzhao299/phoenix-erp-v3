/** The two exact operations accepted by the reviewed production SSH wrapper. */
import {pathToFileURL} from 'node:url';
import {modernSchemaDispatchFromEnvironment, prepareModernSchemaRelease} from './production-modern-schema-preparation.mjs';
import {superviseModernSchemaRelease} from './production-modern-schema-supervisor.mjs';

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

export async function runModernSchemaEntry(args, env, stdin, dependencies = {}) {
  if (args.length !== 1 || !['prepare','run'].includes(args[0])) fail();
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
    input = await readModernSchemaRunRequest(stdin);
    const result = await (dependencies.supervise ?? superviseModernSchemaRelease)(env, input);
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
