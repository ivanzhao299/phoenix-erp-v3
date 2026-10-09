// Isolated process-exit fixture: uses the real current lease and an existing test schema.
const { DataSource } = require('typeorm');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { transpileModule, ModuleKind, ScriptTarget } = require('typescript');
const fixture = new URL(process.env.CHANJET_READONLY_FIXTURE_URL);
if (fixture.hostname !== '127.0.0.1' || fixture.pathname !== '/chanjet_restore_fixture') throw Error('isolated fixture required');
const source = readFileSync(join(__dirname, '../../src/modules/chanjet/chanjet-readonly-lock-lease.ts'), 'utf8');
const compiled = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
const target = { exports: {} };
new Function('require', 'module', 'exports', compiled)(require, target, target.exports);
(async () => {
  const ds = new DataSource({ type: 'postgres', url: fixture.href, synchronize: false });
  await ds.initialize();
  const lease = await target.exports.ChanjetReadonlyLockLease.acquire(ds.createQueryRunner(), 'chanjet-full-readonly-sync');
  if (!lease) throw Error('unexpected competing fixture owner');
  await lease.runner.startTransaction();
  await lease.runner.query(`INSERT INTO chanjet_sync_jobs(job_type,book_id,company_code,period,status,request_scope)
    VALUES('BOOK_REFRESH','BOOK-1','COMP-1','202610','RUNNING',$1::jsonb)`,
    [JSON.stringify({ approvalId: 'TEST_APPROVED', orchestrationRunId: 'CHANJET-RO-PROCESS-EXIT', lifecycleState: 'QUEUED', lockBackendPid: lease.backendPid })]);
  await lease.runner.commitTransaction();
  await lease.assertOwnership();
  process.send({ ready: true, pid: lease.backendPid });
  // The parent kills this process after its explicit durable-reservation barrier.
  process.on('message', () => {});
})().catch(() => { process.send?.({ failed: true }); process.exitCode = 1; });
