// R4.2d preflight output classification regressions.
//
// Samples are REAL preflight outputs, captured verbatim:
//   - the CRASH sample is the exact deterministic failure that every CI
//     fixture run produced before the fix: the runner invoked
//     `ledger-preflight.mjs --db-mode ci --mode pre-migration` WITHOUT the
//     required --inventory, the preflight crashed before evaluating, and its
//     crash contract printed the human line (the thrown message already
//     carries the 'BLOCK: ' prefix, hence the doubled 'BLOCK: BLOCK: ...')
//     on stderr with exit 1 and empty stdout — which the runner's old
//     JSON-parse-then-fallback classified as UNPARSEABLE_PREFLIGHT_OUTPUT.
//   - the EVALUATION samples are real `--fixture` runs of the same reviewed
//     preflight (a legacy_missing BLOCK and a clean PASS).
import test from 'node:test';
import assert from 'node:assert/strict';
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

test('the real CI crash sample classifies as a BLOCK with the crash message, never UNPARSEABLE', () => {
  const verdict = classifyPreflightOutput({ status: 1, stdout: '', stderr: CRASH_STDERR });
  assert.equal(verdict.result, 'BLOCK'); // business semantics preserved: exit 1 stays a BLOCK
  assert.equal(verdict.kind, 'CRASH');
  assert.deepEqual(verdict.reasons, 'PREFLIGHT_CRASH: BLOCK: canonical TypeORM inventory is required');
});

test('a real evaluation BLOCK reports its true failure list', () => {
  const verdict = classifyPreflightOutput({ status: 1, stdout: BLOCK_JSON, stderr: '' });
  assert.equal(verdict.result, 'BLOCK');
  assert.equal(verdict.kind, 'EVALUATION');
  assert.deepEqual(verdict.reasons, ['legacy_missing']);
});

test('a clean evaluation (exit 0) is a PASS regardless of output text', () => {
  const verdict = classifyPreflightOutput({ status: 0, stdout: PASS_JSON, stderr: '' });
  assert.equal(verdict.result, 'PASS');
  assert.deepEqual(verdict.reasons, []);
});

test('empty output on failure is refused as EMPTY, not silently swallowed', () => {
  for (const sample of [{ status: 1, stdout: '', stderr: '' }, { status: 1, stdout: '\n', stderr: '  \n' }]) {
    const verdict = classifyPreflightOutput(sample);
    assert.equal(verdict.result, 'BLOCK');
    assert.equal(verdict.kind, 'EMPTY');
    assert.equal(verdict.reasons, 'EMPTY_PREFLIGHT_OUTPUT');
  }
});

test('a truncated evaluation JSON is refused as UNPARSEABLE', () => {
  const verdict = classifyPreflightOutput({ status: 1, stdout: BLOCK_JSON.slice(0, Math.floor(BLOCK_JSON.length / 2)), stderr: '' });
  assert.equal(verdict.result, 'BLOCK');
  assert.equal(verdict.kind, 'UNPARSEABLE');
  assert.equal(verdict.reasons, 'UNPARSEABLE_PREFLIGHT_OUTPUT');
});

test('illegal non-JSON output with no crash line is refused as UNPARSEABLE', () => {
  const verdict = classifyPreflightOutput({ status: 1, stdout: '\u0000\u0001\u0002 garbage \u007f', stderr: 'panic: aborted' });
  assert.equal(verdict.result, 'BLOCK');
  assert.equal(verdict.kind, 'UNPARSEABLE');
  assert.equal(verdict.reasons, 'UNPARSEABLE_PREFLIGHT_OUTPUT');
});

test('stdout JSON polluted by stderr noise still surfaces the real crash line', () => {
  // a real partial stdout always ends with the console.log newline, so the
  // crash line arrives on its own line — exactly how the two streams
  // concatenate in the runner
  const verdict = classifyPreflightOutput({ status: 1, stdout: '{"partial":\n', stderr: CRASH_STDERR });
  assert.equal(verdict.result, 'BLOCK');
  assert.equal(verdict.kind, 'CRASH');
  assert.match(String(verdict.reasons), /^PREFLIGHT_CRASH: BLOCK: canonical/);
});
