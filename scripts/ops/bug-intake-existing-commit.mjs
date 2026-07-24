#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const BUSINESS_PREFIXES = new Map([
  ['A3-Backend-Critical-Path', 'apps/api/'],
  ['A4-Frontend-UAT-Smoke', 'apps/web/'],
]);

const HARD_FORBIDDEN = [
  'apps/api/src/database/migrations/',
  'apps/api/migrations/',
  'migrations/',
  'deploy/',
  '.github/workflows/',
];

function unique(values) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function taskTokens(task) {
  return unique([
    task?.source_bug_no,
    task?.task_id,
    task?.source_repair_task_no,
    task?.request_id,
  ]).map((value) => value.toLowerCase());
}

function matchesAllowedPath(file, rules = []) {
  return rules.some((rule) => {
    const normalized = String(rule || '').split(/\s+unless\b/i)[0].trim().replace(/^\.\//, '');
    if (!normalized) return false;
    if (normalized.endsWith('/**')) {
      const root = normalized.slice(0, -3);
      return file === root || file.startsWith(`${root}/`);
    }
    if (!normalized.includes('*')) return file === normalized || file.startsWith(`${normalized}/`);
    const escaped = normalized
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*');
    return new RegExp(`^${escaped}$`).test(file);
  });
}

function isTaskReport(task, file) {
  const lower = String(file || '').toLowerCase();
  return lower.startsWith('docs/ops/')
    && !lower.startsWith('docs/ops/runs/')
    && taskTokens(task).some((token) => lower.includes(token));
}

export function evaluateExistingTaskCommit(task, commit = {}) {
  const changedFiles = unique(commit.changedFiles);
  const businessPrefix = BUSINESS_PREFIXES.get(task?.agent) || '';
  const businessFiles = businessPrefix
    ? changedFiles.filter((file) => file.startsWith(businessPrefix))
    : [];
  const reportFiles = changedFiles.filter((file) => isTaskReport(task, file));
  const identity = `${commit.subject || ''}\n${commit.body || ''}`.toLowerCase();
  const identityMatched = taskTokens(task).some((token) => identity.includes(token));
  const outsideAllowed = changedFiles.filter((file) => !matchesAllowedPath(file, task?.allowed_paths || []));
  const forbiddenFiles = changedFiles.filter((file) => (
    HARD_FORBIDDEN.some((prefix) => file.startsWith(prefix))
    || file.endsWith('.entity.ts')
    || file.includes('/entities/')
  ));
  const reasons = [];
  if (!/^[0-9a-f]{7,40}$/i.test(String(commit.commitHash || ''))) reasons.push('invalid commit hash');
  if (commit.inUnintegratedRange !== true) reasons.push('commit is not in the unintegrated worktree range');
  if (commit.integrated === true) reasons.push('commit is already integrated');
  if (!identityMatched) reasons.push('commit message does not identify this bug/task');
  if (businessFiles.length === 0) reasons.push(`no ${businessPrefix || 'owned'} business file`);
  if (reportFiles.length === 0) reasons.push('task-specific report is missing');
  if (outsideAllowed.length > 0) reasons.push(`outside allowed paths: ${outsideAllowed.join(', ')}`);
  if (forbiddenFiles.length > 0) reasons.push(`forbidden paths: ${forbiddenFiles.join(', ')}`);
  return {
    passed: reasons.length === 0,
    commitHash: String(commit.commitHash || ''),
    parentHash: String(commit.parentHash || ''),
    changedFiles,
    businessFiles,
    reportFiles,
    identityMatched,
    outsideAllowed,
    forbiddenFiles,
    reasons,
  };
}

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 8 * 1024 * 1024,
  }).trim();
}

export function findExistingTaskCommit(task, options = {}) {
  const cwd = options.cwd || task?.worktree;
  const mainRef = options.mainRef || 'origin/main';
  if (!cwd) return { candidate: null, rejected: [], reason: 'task worktree is missing' };
  let commits;
  try {
    commits = git(cwd, ['rev-list', '--reverse', `${mainRef}..HEAD`])
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean);
  } catch (error) {
    return { candidate: null, rejected: [], reason: error.stderr?.toString() || error.message };
  }
  const rejected = [];
  const accepted = [];
  for (const commitHash of commits) {
    try {
      const subject = git(cwd, ['show', '-s', '--format=%s', commitHash]);
      const body = git(cwd, ['show', '-s', '--format=%b', commitHash]);
      const parentHash = git(cwd, ['rev-parse', `${commitHash}^`]);
      const changedFiles = git(cwd, ['show', '--format=', '--name-only', commitHash])
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean);
      const evaluation = evaluateExistingTaskCommit(task, {
        commitHash,
        parentHash,
        subject,
        body,
        changedFiles,
        inUnintegratedRange: true,
        integrated: false,
      });
      if (evaluation.passed) accepted.push(evaluation);
      else rejected.push(evaluation);
    } catch (error) {
      rejected.push({
        passed: false,
        commitHash,
        reasons: [error.stderr?.toString() || error.message],
      });
    }
  }
  return {
    candidate: accepted.at(-1) || null,
    accepted,
    rejected,
    reason: accepted.length > 0 ? '' : 'no task-specific unintegrated implementation commit passed the recovery gate',
  };
}

