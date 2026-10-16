// R4.2d preflight output classification regressions.
//
// REAL captured samples:
//   - the CRASH sample is the exact deterministic failure that every CI
//     fixture run produced before the invocation fix: the runner invoked
//     `ledger-preflight.mjs --db-mode ci --mode pre-migration` WITHOUT the
//     required --inventory, the preflight crashed before evaluating, and its
//     crash contract printed the human line (the thrown message already
//     carries the 'BLOCK: ' prefix, hence the doubled 'BLOCK: BLOCK: ...')
//     on stderr with exit 1 and empty stdout.
//   - the EVALUATION samples are real `--fixture` runs of the same reviewed
//     preflight (a legacy_missing BLOCK and a clean PASS).
// DYNAMIC samples are produced by spawning the REAL preflight binary inside
// the test (never hand-written JSON), covering the boundary matrix:
// exit-0-with-pass-false, exit-0-with-empty/truncated/illegal output,
// status:null, pass:true-with-nonzero-status, and BLOCK JSON + stderr
// diagnostics (the two streams are parsed independently — the failures list
// must survive stderr noise).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { classifyPreflightOutput } from './ledger-preflight-output-classify.mjs';

const CRASH_STDERR = 'BLOCK: BLOCK: canonical TypeORM inventory is required\n';

const BLOCK_JSON = `{
  "mode": "pre-migration",
  "pass": false,
  "failures": [
    "legacy_missing"
  ],
  "counts": {
    "legacy_total": 169,
    "legacy_applied_total": 168,
    "canonical_typeorm_total": 88,
    "canonical_typeorm_applied": 84,
    "canonical_typeorm_pending": 4,
    "known_retired_applied": 0,
    "unknown_typeorm_applied": 0,
    "bridge_total": 169,
    "bridge_present": 0,
    "bridge_missing": 169
  },
  "diagnostics": {
    "legacy_missing": [
      "20260527_rbac_permission_fix.sql"
    ]
  }
}`;

// a REAL clean evaluation produced by the actual preflight binary (dynamic
// sample below re-produces it); kept here for the exit-status cross-checks
const PASS_JSON = `{
  "mode": "pre-migration",
  "pass": true,
  "failures": [],
  "counts": {
    "legacy_total": 169,
    "canonical_typeorm_total": 88,
    "canonical_typeorm_pending": 0
  }
}`;

function runRealPreflight(fixturePayload) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-classify-'));
  try {
    const fixtureFile = path.join(dir, 'payload.json');
    fs.writeFileSync(fixtureFile, JSON.stringify(fixturePayload));
    try {
      const stdout = execFileSync(process.execPath, ['scripts/ledger-preflight.mjs', '--fixture', fixtureFile, '--retired', 'scripts/ci/retired-typeorm-migrations.json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { status: 0, stdout, stderr: '' };
    } catch (error) {
      return { status: error.status ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function realFixturePayload({ dropLegacyFile = false, complete = false } = {}) {
  const legacy = fs.readdirSync('apps/api/migrations').filter((n) => /^2026.*\.sql$/.test(n)).sort();
  const retired = JSON.parse(fs.readFileSync('scripts/ci/retired-typeorm-migrations.json', 'utf8'));
  const inv = JSON.parse(fs.readFileSync('scripts/ci/typeorm-ledger-rehearsal-historical-inventory.json', 'utf8')).entries;
  const canonicalTypeorm = inv.map((e) => ({ effective_name: e.effective_name, timestamp: String(e.timestamp) }));
  const applied = complete ? canonicalTypeorm : canonicalTypeorm.slice(0, 84);
  return {
    schemaRows: (dropLegacyFile ? legacy.slice(1) : legacy).map((f) => ({ filename: f, applied_at: '2026-01-01 00:00:00' })),
    typeormRows: applied.map((n) => ({ name: n.effective_name, timestamp: String(n.timestamp) })),
    canonicalLegacy: legacy, canonicalTypeorm, retiredTypeorm: retired,
  };
}

// ── real captured samples ──────────────────────────────────────────────────

test('the real CI crash sample classifies as a BLOCK with the crash message, never UNPARSEABLE', () => {
  const verdict = classifyPreflightOutput({ status: 1, stdout: '', stderr: CRASH_STDERR });
  assert.equal(verdict.result, 'BLOCK');
  assert.equal(verdict.kind, 'CRASH'); // no evaluation conclusion was formed
  assert.deepEqual(verdict.reasons, 'PREFLIGHT_CRASH: BLOCK: canonical TypeORM inventory is required');
  assert.equal(verdict.stderr, CRASH_STDERR.trim()); // stderr preserved separately
});

test('a real evaluation BLOCK reports its true failure list even with stderr diagnostics present', () => {
  // the two streams are NEVER concatenated: the failures list survives
  const verdict = classifyPreflightOutput({ status: 1, stdout: BLOCK_JSON, stderr: 'psql: warning: connection option noise\n' });
  assert.equal(verdict.result, 'BLOCK');
  assert.equal(verdict.kind, 'EVALUATION');
  assert.deepEqual(verdict.reasons, ['legacy_missing']);
  assert.equal(verdict.stderr, 'psql: warning: connection option noise');
});

test('a clean evaluation is a PASS only with BOTH pass:true AND exit 0', () => {
  const verdict = classifyPreflightOutput({ status: 0, stdout: PASS_JSON, stderr: '' });
  assert.equal(verdict.result, 'PASS');
  assert.deepEqual(verdict.reasons, []);
});

// ── boundary matrix: abnormal output can never be a PASS ───────────────────

test('exit 0 with EMPTY output is refused, not a PASS', () => {
  for (const sample of [{ status: 0, stdout: '', stderr: '' }, { status: 0, stdout: '\n', stderr: '  \n' }]) {
    const verdict = classifyPreflightOutput(sample);
    assert.equal(verdict.result, 'BLOCK');
    assert.equal(verdict.kind, 'EMPTY');
    assert.equal(verdict.reasons, 'EMPTY_PREFLIGHT_OUTPUT');
  }
});

test('exit 0 with a TRUNCATED evaluation JSON is refused as UNPARSEABLE, not a PASS', () => {
  const verdict = classifyPreflightOutput({ status: 0, stdout: BLOCK_JSON.slice(0, Math.floor(BLOCK_JSON.length / 2)), stderr: '' });
  assert.equal(verdict.result, 'BLOCK');
  assert.equal(verdict.kind, 'UNPARSEABLE');
  assert.equal(verdict.reasons, 'UNPARSEABLE_PREFLIGHT_OUTPUT');
});

test('exit 0 with illegal non-JSON output is refused as UNPARSEABLE, not a PASS', () => {
  const verdict = classifyPreflightOutput({ status: 0, stdout: '\u0000\u0001\u0002 garbage \u007f', stderr: '' });
  assert.equal(verdict.result, 'BLOCK');
  assert.equal(verdict.kind, 'UNPARSEABLE');
});

test('exit 0 with a pass:false evaluation JSON is a BLOCK with the real failures', () => {
  const verdict = classifyPreflightOutput({ status: 0, stdout: BLOCK_JSON, stderr: '' });
  assert.equal(verdict.result, 'BLOCK');
  assert.equal(verdict.kind, 'EVALUATION');
  assert.deepEqual(verdict.reasons, ['legacy_missing']);
});

test('status null is NEVER coerced into a PASS — pass:true JSON without exit 0 is a STATUS_MISMATCH', () => {
  for (const status of [null, undefined]) {
    const verdict = classifyPreflightOutput({ status, stdout: PASS_JSON, stderr: '' });
    assert.equal(verdict.result, 'BLOCK');
    assert.equal(verdict.kind, 'STATUS_MISMATCH');
    assert.match(String(verdict.reasons), /^EXIT_STATUS_MISMATCH: status=(null|undefined), pass=true$/);
  }
});

test('pass:true JSON with a non-zero exit status is a STATUS_MISMATCH, not a PASS', () => {
  const verdict = classifyPreflightOutput({ status: 1, stdout: PASS_JSON, stderr: '' });
  assert.equal(verdict.result, 'BLOCK');
  assert.equal(verdict.kind, 'STATUS_MISMATCH');
  assert.match(String(verdict.reasons), /^EXIT_STATUS_MISMATCH: status=1, pass=true$/);
});

test('a signal-killed run (status null) with only a crash line stays CRASH', () => {
  const verdict = classifyPreflightOutput({ status: null, stdout: '', stderr: CRASH_STDERR });
  assert.equal(verdict.result, 'BLOCK');
  assert.equal(verdict.kind, 'CRASH');
});

test('stdout JSON polluted by stderr noise still surfaces the real crash line when stdout is not a conclusion', () => {
  // a real partial stdout always ends with the console.log newline, so the
  // crash line arrives on its own line — exactly how the two streams
  // concatenate in the caller's capture
  const verdict = classifyPreflightOutput({ status: 1, stdout: '{"partial":\n', stderr: CRASH_STDERR });
  assert.equal(verdict.result, 'BLOCK');
  assert.equal(verdict.kind, 'CRASH');
  assert.match(String(verdict.reasons), /^PREFLIGHT_CRASH: BLOCK: canonical/);
});

// ── dynamic regressions: the REAL preflight binary produces the samples ────

test('dynamic: the real preflight binary producing a clean evaluation classifies PASS', () => {
  const run = runRealPreflight(realFixturePayload({ complete: true }));
  assert.equal(run.status, 0);
  const verdict = classifyPreflightOutput(run);
  assert.equal(verdict.result, 'PASS');
  assert.equal(verdict.kind, 'EVALUATION');
  const doc = JSON.parse(run.stdout);
  assert.equal(doc.pass, true);
});

test('dynamic: the real preflight binary producing a legacy_missing BLOCK classifies EVALUATION with the true failure', () => {
  const run = runRealPreflight(realFixturePayload({ dropLegacyFile: true }));
  assert.equal(run.status, 1);
  const verdict = classifyPreflightOutput(run);
  assert.equal(verdict.result, 'BLOCK');
  assert.equal(verdict.kind, 'EVALUATION');
  assert.deepEqual(verdict.reasons, ['legacy_missing']);
  // stderr alone can never corrupt the evaluation parse
  assert.deepEqual(classifyPreflightOutput({ ...run, stderr: 'extra diagnostics line\n' }).reasons, ['legacy_missing']);
});

test('dynamic: the real preflight binary crashing on a missing inventory classifies CRASH (the historical defect)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-classify-crash-'));
  try {
    let run;
    try {
      const stdout = execFileSync(process.execPath, ['scripts/ledger-preflight.mjs', '--db-mode', 'ci', '--mode', 'pre-migration'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, MIG_MODE: 'ci' } });
      run = { status: 0, stdout, stderr: '' };
    } catch (error) {
      run = { status: error.status ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
    }
    assert.notEqual(run.status, 0);
    const verdict = classifyPreflightOutput(run);
    assert.equal(verdict.result, 'BLOCK');
    assert.equal(verdict.kind, 'CRASH');
    assert.match(String(verdict.reasons), /^PREFLIGHT_CRASH: BLOCK: canonical TypeORM inventory is required$/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
