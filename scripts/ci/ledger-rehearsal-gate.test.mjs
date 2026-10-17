// R4.2d rehearsal preflight-gate dynamic regressions: the rehearsal ASSERTS
// the expected preflight verdict — a clean fixture passes, and an injected
// fault (one dropped legacy row, right before the preflight) must make the
// gate actually FAIL the rehearsal (non-zero exit, the BLOCK reason and the
// EXPECTED_PREFLIGHT_VERDICT_UNMET marker visible). The gate is proven live,
// not decorative.
import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const fixtureUrl = process.env.LEDGER_REHEARSAL_GATE_URL;
const gate = fixtureUrl ? describe : describe.skip;
if (process.env.LEDGER_REHEARSAL_GATE_REQUIRED === 'true' && !fixtureUrl) throw Error('LEDGER_REHEARSAL_GATE_URL_REQUIRED');

const repoRoot = path.resolve(process.cwd());
const runner = path.join(repoRoot, 'scripts/ci/run-typeorm-ledger-runtime-compatibility-fixture.mjs');
const parsed = fixtureUrl ? new URL(fixtureUrl) : null;
const pgEnv = fixtureUrl ? {
  PGHOST: parsed.hostname, PGPORT: parsed.port || '5432',
  PGUSER: decodeURIComponent(parsed.username || 'postgres'),
  PGPASSWORD: decodeURIComponent(parsed.password || ''),
  PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)),
} : null;
const container = process.env.LEDGER_REHEARSAL_GATE_DB_CONTAINER || '';

function runRehearsal(env = {}) {
  const shimBin = fs.mkdtempSync(path.join(os.tmpdir(), 'rehearsal-gate-shim-'));
  try {
    if (container) {
      // a thin real-psql shim (docker exec into the fixture container),
      // database chosen by PGDATABASE per invocation
      fs.writeFileSync(path.join(shimBin, 'psql'), `#!/bin/sh\nexec docker exec -i ${container} psql -X -At -v ON_ERROR_STOP=1 -U '${pgEnv.PGUSER}' -d "\${PGDATABASE:-${pgEnv.PGDATABASE}}" "$@"\n`, { mode: 0o755 });
    }
    const run = spawnSync(process.execPath, [runner], {
      cwd: repoRoot, encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, ...pgEnv, ...(container ? { PATH: `${shimBin}:${process.env.PATH}` } : {}), ...env },
    });
    return { status: run.status ?? 1, stdout: run.stdout ?? '', stderr: run.stderr ?? '' };
  } finally {
    fs.rmSync(shimBin, { recursive: true, force: true });
  }
}

gate('rehearsal preflight gate (real runner, real fixture)', () => {
  before(() => {
    assert.ok(['127.0.0.1', 'localhost'].includes(parsed.hostname), 'isolated loopback fixture required');
    assert.match(pgEnv.PGDATABASE, /^(phoenix_ledger_rehearsal|ledger_collect_)/, 'dedicated rehearsal database required');
    assert.ok(container || process.env.CI, 'the fixture container (or the CI psql client) is required');
  });
  after(() => {
    // scoped cleanup: this suite creates NO database (the job's service
    // provisioned it and the runner resets it per run) — nothing is dropped
  });

  test('clean fixture: the rehearsal passes and asserts the preflight PASS verdict', () => {
    const run = runRehearsal();
    assert.equal(run.status, 0, `clean rehearsal failed:\n${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout, /CURRENT_LEDGER_PREFLIGHT_RESULT=PASS/);
    assert.match(run.stdout, /LEDGER_PREFLIGHT_RUNTIME_SEMANTICS=AGREE/);
    assert.match(run.stdout, /LEDGER_RUNTIME_COMPATIBILITY=PASS/);
  }, 300_000);

  test('injected fault: one dropped legacy row makes the gate FAIL the rehearsal', () => {
    const run = runRehearsal({ LEDGER_REHEARSAL_FAULT: 'drop-legacy-row' });
    assert.notEqual(run.status, 0, 'the corrupted fixture must fail the rehearsal — the gate is live');
    assert.match(run.stdout, /LEDGER_REHEARSAL_FAULT=drop-legacy-row/);
    assert.match(run.stdout, /CURRENT_LEDGER_PREFLIGHT_RESULT=BLOCK/);
    assert.match(run.stdout, /"legacy_missing"/);
    assert.match(run.stderr, /EXPECTED_PREFLIGHT_VERDICT_UNMET/);
  }, 300_000);
});
