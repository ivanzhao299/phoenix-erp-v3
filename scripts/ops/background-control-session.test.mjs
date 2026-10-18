import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { DockerPostgresControlSession, ADMISSION_KEY, EXECUTION_KEY } from './background-control-coordinator.mjs';
function fakeProcess({ answer = () => 't', exitOnEnd = true } = {}) {
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.exitCode = null;
  const sql = []; let ended = false;
  child.kill = () => { child.exitCode = 1; queueMicrotask(() => child.emit('exit', 1)); };
  child.stdin = new Writable({
    write(chunk, _encoding, done) {
      const text = chunk.toString().trim(); sql.push(text); const reply = answer(text);
      if (reply !== null) queueMicrotask(() => child.stdout.write(`${reply}\n`)); done();
    },
    final(done) { ended = true; if (exitOnEnd) { child.exitCode = 0; queueMicrotask(() => child.emit('exit', 0)); } done(); },
  });
  let args;
  const session = new DockerPostgresControlSession({ commandTimeoutMs: 30 }, { spawn: (...value) => { args = value; return child; } });
  return { child, session, sql, get args() { return args; }, get ended() { return ended; } };
}
test('coordinator PG adapter retains one fixed DB session and only fixed lock SQL; no credentials in arguments', async () => {
  const f = fakeProcess(); assert.equal(await f.session.tryLock(ADMISSION_KEY), true); assert.equal(await f.session.tryLock(EXECUTION_KEY), true);
  assert.equal(await f.session.ping(), true); assert.equal(await f.session.unlock(EXECUTION_KEY), true); assert.equal(await f.session.unlock(ADMISSION_KEY), true);
  assert.deepEqual(f.sql, ['SELECT true;', 'SELECT pg_try_advisory_lock(17455,1);', 'SELECT pg_try_advisory_lock(17455,2);', 'SELECT true;', 'SELECT pg_advisory_unlock(17455,2);', 'SELECT pg_advisory_unlock(17455,1);']);
  assert.equal(f.args[0], 'docker'); assert.equal(f.args[1][2], 'phoenix-v3-db');
  assert.equal(f.args[2].env.DOCKER_HOST, 'unix:///var/run/docker.sock'); assert.equal('PGPASSWORD' in f.args[2].env, false);
  await f.session.close(); assert.equal(f.ended, true); assert.equal(f.session.connected(), false);
});
test('coordinator session serializes concurrent SQL and never creates one connection per lock request', async () => {
  const f = fakeProcess(); await f.session.start();
  const results = await Promise.all([f.session.tryLock(ADMISSION_KEY), f.session.tryLock(EXECUTION_KEY), f.session.ping()]);
  assert.deepEqual(results, [true, true, true]); assert.equal(f.sql.length, 4); await f.session.close();
});
test('unavailable exclusive lock returns false for bounded coordinator polling', async () => {
  const f = fakeProcess({ answer: sql => sql.includes('pg_try') ? 'f' : 't' });
  assert.equal(await f.session.tryLock(EXECUTION_KEY), false); await f.session.close();
});
test('SQL stderr is never returned; malformed stdout or unexpected session exit permanently poisons control', async () => {
  const f = fakeProcess({ answer: sql => sql.includes('pg_try') ? 'unsafe-diagnostic' : 't' });
  f.child.stderr.write('sensitive connection detail fixture');
  await assert.rejects(f.session.tryLock(ADMISSION_KEY), /CONTROL_SESSION_LOST/); assert.equal(f.session.connected(), false);
  await assert.rejects(f.session.start(), /CONTROL_SESSION_LOST/); await f.session.close();
});
test('hung PostgreSQL command times out without declaring a successful fence', async () => {
  const f = fakeProcess({ answer: () => null });
  await assert.rejects(f.session.start(), /CONTROL_SESSION_TIMEOUT/); assert.equal(f.session.connected(), false); await f.session.close();
});
test('adapter refuses arbitrary SQL lock key injection', async () => {
  const f = fakeProcess();
  await assert.rejects(f.session.tryLock('1); DROP TABLE x'), /LOCK_KEY/);
  await assert.rejects(f.session.unlock(3), /LOCK_KEY/); assert.equal(f.sql.length, 0);
});

test('root control session binds unique bootUUID application_name plus PID/database/start on its own cluster', async () => {
  const f = fakeProcess();
  await f.session.verifyParticipants([{ bootId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', sessionPid: 321, databaseOid: 12345, backendStartedAt: '2026-10-18T00:00:00.123Z' }]);
  const sql = f.sql.at(-1); assert.match(sql, /count\(\*\)=1/); assert.match(sql, /pid=321/); assert.match(sql, /datid=12345/);
  assert.ok(sql.includes("application_name='phoenix-fence:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'")); assert.ok(sql.includes('datname=current_database()'));
  await assert.rejects(f.session.verifyParticipants([{ bootId: "'; DROP TABLE x;--", sessionPid: 1, databaseOid: 1, backendStartedAt: '2026-10-18T00:00:00.123Z' }]), /PARTICIPANT_DATABASE_IDENTITY/);
  await f.session.close();
});
