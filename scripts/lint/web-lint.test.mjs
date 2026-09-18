import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inventory, regressions, changedRegressions, updateBaselineFile, updateBaselineFromScan, changedFiles, parseDiff, selectBase } from './web-lint.mjs';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const entry = (count = 2, file = 'apps/web/a.ts', ruleId = 'rule-a', severity = 2) => ({ file, ruleId, severity, count });
const data = (...entries) => ({ schemaVersion: 1, entries });
for (const [name, baseline, current, expected] of [
  ['identical', data(entry()), data(entry()), 0],
  ['decrease', data(entry()), data(entry(1)), 0],
  ['increase', data(entry()), data(entry(3)), 1],
  ['new rule despite total decrease', data(entry()), data(entry(1, 'apps/web/a.ts', 'rule-b')), 1],
  ['new file/rule pair', data(entry()), data(entry(), entry(1, 'apps/web/b.ts')), 1],
  ['deleted error file', data(entry()), data(), 0],
  ['moved error', data(entry()), data(entry(2, 'apps/web/b.ts')), 1],
  ['warnings nonblocking', data(), data(entry(10, 'apps/web/a.ts', 'warning', 1)), 0],
  ['warning becomes error', data(entry(2, 'apps/web/a.ts', 'rule-a', 1)), data(entry()), 1],
]) test(name, () => assert.equal(regressions(baseline, current).length, expected));

test('inventory is deterministic and relative', () => {
  const a = { filePath: '/repo/apps/web/a.ts', messages: [{ severity: 2, ruleId: 'a' }, { severity: 1, ruleId: 'b' }] };
  const b = { filePath: '/repo/apps/web/b.ts', messages: [{ severity: 2, ruleId: 'a' }] };
  assert.deepEqual(inventory([a, b], '/repo'), inventory([b, a], '/repo'));
  assert.equal(inventory([a, b], '/repo').summary.totalErrors, 2);
  assert.ok(!JSON.stringify(inventory([a], '/repo')).includes('/repo'));
});
test('parse failure cannot enter the baseline', () => assert.throws(() => inventory([{ filePath: '/repo/apps/web/a.ts', messages: [{ fatal: true }] }], '/repo')));
test('spaces, deleted files, rename destinations and untracked files', () => {
  assert.deepEqual(changedFiles('apps/web/new name.tsx\0apps/web/deleted.ts\0apps/api/a.ts\0', 'apps/web/new name.tsx\0apps/web/new.js\0', f => !f.includes('deleted')), ['apps/web/new name.tsx', 'apps/web/new.js']);
});
test('explicit base takes priority', () => {
  const calls = [];
  assert.equal(selectBase('feature', args => { calls.push(args); return 'abc\n'; }), 'abc');
  assert.deepEqual(calls, [['rev-parse', '--verify', 'feature^{commit}']]);
});
test('merge-base default and HEAD~1 fallback', () => {
  assert.equal(selectBase(undefined, () => 'merge\n'), 'merge');
  assert.equal(selectBase(undefined, (args, optional) => optional ? null : 'parent\n'), 'parent');
});
test('malformed baselines fail closed', () => assert.throws(() => regressions(data({ ...entry(), count: -1 }), data())));

test('changed legacy files compare against committed debt', () => {
  const file = 'apps/web/a.ts';
  assert.equal(changedRegressions(data(entry(5, file)), data(entry(5, file)), [file]).length, 0);
  assert.equal(changedRegressions(data(entry(5, file)), data(entry(4, file)), [file]).length, 0);
  assert.equal(changedRegressions(data(entry(5, file)), data(entry(6, file)), [file]).length, 1);
  assert.equal(changedRegressions(data(entry(5, file, 'rule-a')), data(entry(4, file, 'rule-a'), entry(1, file, 'rule-b')), [file]).length, 1);
  assert.equal(changedRegressions(data(entry(5, file)), data(entry(5, file)), [file]).length, 0);
});

test('new files must be clean while warnings do not block', () => {
  const file = 'apps/web/new.ts';
  assert.equal(changedRegressions(data(), data(), [file]).length, 0);
  assert.equal(changedRegressions(data(), data(entry(1, file)), [file]).length, 1);
  assert.equal(changedRegressions(data(), data(entry(10, file, 'warning', 1)), [file]).length, 0);
});

test('renames map the old baseline path to the new path', () => {
  const oldPath = 'apps/web/old.ts';
  const newPath = 'apps/web/new.ts';
  const baseline = data(entry(5, oldPath));
  assert.equal(changedRegressions(baseline, data(entry(5, newPath)), [newPath], [{ oldPath, newPath }]).length, 0);
  assert.equal(changedRegressions(baseline, data(entry(6, newPath)), [newPath], [{ oldPath, newPath }]).length, 1);
  assert.equal(changedRegressions(baseline, data(), [], [{ oldPath, newPath }]).length, 0);
});

test('changed comparator fails closed on malformed baseline', () => assert.throws(() => changedRegressions(data({ ...entry(), count: -1 }), data(), ['apps/web/a.ts'])));

test('baseline update is monotonic and preserves the file on rejection', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'web-lint-'));
  const target = path.join(dir, 'baseline.json');
  const baseline = { ...data(entry(5)), summary: { totalErrors: 5 } };
  const same = { ...data(entry(5)), summary: { totalErrors: 5 } };
  const reduced = { ...data(entry(4)), summary: { totalErrors: 4 } };
  const increased = { ...data(entry(6)), summary: { totalErrors: 6 } };
  updateBaselineFile(baseline, same, target);
  const before = readFileSync(target, 'utf8');
  assert.equal(updateBaselineFile(baseline, increased, target).updated, false);
  assert.equal(readFileSync(target, 'utf8'), before);
  assert.equal(updateBaselineFile(baseline, reduced, target).updated, true);
  rmSync(dir, { recursive: true, force: true });
});

test('new pairs, mixed rule changes, deleted entries and warning growth follow monotonic policy', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'web-lint-'));
  const target = path.join(dir, 'baseline.json');
  const baseline = { ...data(entry(5, 'apps/web/a.ts', 'rule-a')), summary: { totalErrors: 5 } };
  const mixed = { ...data(entry(4, 'apps/web/a.ts', 'rule-a'), entry(1, 'apps/web/a.ts', 'rule-b')), summary: { totalErrors: 5 } };
  assert.equal(updateBaselineFile(baseline, mixed, target).updated, false);
  const deleted = { ...data(), summary: { totalErrors: 0 } };
  assert.equal(updateBaselineFile(baseline, deleted, target).updated, true);
  const warnings = { ...data(entry(5, 'apps/web/a.ts', 'rule-a'), entry(10, 'apps/web/a.ts', 'warning', 1)), summary: { totalErrors: 5 } };
  assert.equal(updateBaselineFile(baseline, warnings, target).updated, true);
  rmSync(dir, { recursive: true, force: true });
});

test('explicit regression acceptance updates and malformed or failed scans do not write', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'web-lint-'));
  const target = path.join(dir, 'baseline.json');
  const baseline = { ...data(entry(5)), summary: { totalErrors: 5 } };
  const increased = { ...data(entry(6)), summary: { totalErrors: 6 } };
  const malformed = { schemaVersion: 1, entries: [{ ...entry(), count: 0 }], summary: { totalErrors: 0 } };
  assert.throws(() => updateBaselineFile(baseline, malformed, target));
  updateBaselineFile(baseline, baseline, target);
  const beforeFailedScan = readFileSync(target, 'utf8');
  assert.throws(() => updateBaselineFromScan(() => { throw new Error('ESLint failed'); }, baseline, target));
  assert.equal(readFileSync(target, 'utf8'), beforeFailedScan);
  assert.equal(updateBaselineFile(baseline, increased, target, true).updated, true);
  assert.deepEqual(JSON.parse(readFileSync(target, 'utf8')), increased);
  rmSync(dir, { recursive: true, force: true });
});
