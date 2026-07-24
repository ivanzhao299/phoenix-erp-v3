import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  evaluateExistingTaskCommit,
  findExistingTaskCommit,
} from './bug-intake-existing-commit.mjs';

const task = {
  task_id: 'BUGTASK-20260723-0004-A3',
  source_bug_no: 'BUG-20260723-0004',
  source_repair_task_no: 'BUGTASK-20260723-0004',
  agent: 'A3-Backend-Critical-Path',
  allowed_paths: ['apps/api/**', 'docs/ops/**'],
};

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function write(root, file, value) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}

test('existing commit gate requires owned business change, task report, identity, and allowed paths', () => {
  const result = evaluateExistingTaskCommit(task, {
    commitHash: '1234567',
    parentHash: '0123456',
    subject: 'fix(api): repair BUG-20260723-0004',
    changedFiles: [
      'apps/api/src/modules/bff/bff.controller.ts',
      'docs/ops/BUGTASK-20260723-0004-a3-backend-report.md',
    ],
    inUnintegratedRange: true,
    integrated: false,
  });
  assert.equal(result.passed, true);
  assert.deepEqual(result.businessFiles, ['apps/api/src/modules/bff/bff.controller.ts']);
  assert.deepEqual(result.reportFiles, ['docs/ops/BUGTASK-20260723-0004-a3-backend-report.md']);
});

test('existing commit gate rejects unrelated, reportless, or forbidden commits', () => {
  assert.equal(evaluateExistingTaskCommit(task, {
    commitHash: '1234567',
    subject: 'fix(api): unrelated repair',
    changedFiles: ['apps/api/src/x.ts', 'docs/ops/OTHER.md'],
    inUnintegratedRange: true,
  }).passed, false);
  assert.equal(evaluateExistingTaskCommit(task, {
    commitHash: '1234567',
    subject: 'fix(api): repair BUG-20260723-0004',
    changedFiles: ['apps/api/src/x.ts'],
    inUnintegratedRange: true,
  }).passed, false);
  assert.equal(evaluateExistingTaskCommit(task, {
    commitHash: '1234567',
    subject: 'fix(api): repair BUG-20260723-0004',
    changedFiles: [
      'apps/api/src/x.ts',
      'apps/api/src/database/migrations/Unsafe.ts',
      'docs/ops/BUGTASK-20260723-0004-report.md',
    ],
    inUnintegratedRange: true,
  }).passed, false);
});

test('finder recovers the matching unintegrated task commit behind a later unrelated commit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bug-existing-commit-'));
  try {
    git(root, ['init']);
    git(root, ['config', 'user.email', 'runner@example.test']);
    git(root, ['config', 'user.name', 'Bug Runner Test']);
    write(root, 'README.md', 'base\n');
    git(root, ['add', 'README.md']);
    git(root, ['commit', '-m', 'base']);
    const base = git(root, ['rev-parse', 'HEAD']);

    write(root, 'apps/api/src/fix.ts', 'export const fixed = true;\n');
    write(root, 'docs/ops/BUGTASK-20260723-0004-a3-backend-report.md', '# PASS WITH CONDITIONS\n');
    git(root, ['add', 'apps/api/src/fix.ts', 'docs/ops/BUGTASK-20260723-0004-a3-backend-report.md']);
    git(root, ['commit', '-m', 'fix(api): repair BUG-20260723-0004']);
    const expected = git(root, ['rev-parse', 'HEAD']);

    write(root, 'docs/ops/UNRELATED.md', 'later\n');
    git(root, ['add', 'docs/ops/UNRELATED.md']);
    git(root, ['commit', '-m', 'docs: unrelated']);

    const found = findExistingTaskCommit(task, { cwd: root, mainRef: base });
    assert.equal(found.candidate?.commitHash, expected);
    assert.equal(found.accepted.length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
