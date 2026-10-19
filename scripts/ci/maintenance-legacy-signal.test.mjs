/** Real owned Node signal/stdio-close test. Provider/PG transports are stubs;
 * no network, database, source mutation or production connection is involved. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { networkPreload } from './maintenance-erp-candidate.fixture.mjs';
test('the fixture preload preserves old Node default SIGTERM termination', async t => {
  const owner = 'owned-legacy-signal-test';
  const script = `const vm=require('node:vm');
    class Client{};Client.prototype.connect=function(){};
    const provider={listen(_port,_host,callback){callback();return this;},unref(){return this;},close(){}};
    const context={process,URL,global:{fetch:async()=>{}},require:name=>name==='http'?{createServer:()=>provider}:name==='pg'?{Client}:require(name)};
    vm.runInNewContext(${JSON.stringify(networkPreload(owner))},context);
    setInterval(()=>{},10000);process.stdout.write('READY\\n');`;
  const bounded = promise => Promise.race([promise, new Promise((_, reject) => {
    const timer = setTimeout(() => reject(Error('OWNED_SIGNAL_TEST_DEADLINE')), 10000); timer.unref(); promise.finally(() => clearTimeout(timer)).catch(() => {});
  })]);
  const child = spawn(process.execPath, ['-e', script], { env: { ERP_CANDIDATE_FIXTURE: owner, DB_HOST: 'fixture-db', DB_NAME: 'api_bootstrap_fixture' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let hasClosed = false;
  const closed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => { hasClosed = true; resolve({ code, signal }); }); });
  t.after(async () => {
    // Only the saved locally spawned test child; never a discovered service.
    // A failed regression stays FAIL even if this fault-only cleanup succeeds.
    if (!hasClosed) child.kill('SIGKILL');
    try { await bounded(closed); }
    catch { t.diagnostic(JSON.stringify({ originalOwnedPid: child.pid, cleanupDebt: true, stdioCloseVerified: false })); throw Error('OWNED_SIGNAL_CHILD_CLOSE_UNVERIFIED'); }
  });
  const ready = new Promise((resolve, reject) => {
    let out = ''; child.stdout.on('data', chunk => { out += chunk; if (out.includes('READY\n')) resolve(); });
    child.once('error', reject); child.once('close', () => reject(Error('Owned signal fixture exited before READY')));
  });
  await bounded(ready); assert.equal(child.kill('SIGTERM'), true);
  assert.deepEqual(await bounded(closed), { code: null, signal: 'SIGTERM' });
});
