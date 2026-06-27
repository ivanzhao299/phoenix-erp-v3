#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';

const BOARD = 'docs/ops/AGENT_TASK_BOARD.md';

const AGENT_CONFIG = {
  'Codex-Orchestrator': {
    worktree: '/Users/mac/phoenix-erp-worktrees/codex-orchestrator',
    prompt: 'docs/ops/prompts/CODEX_ORCHESTRATOR_SYSTEM_PROMPT.md',
  },
  'A1-CI-Runtime-Gate': {
    worktree: '/Users/mac/phoenix-erp-worktrees/a1-ci-runtime-gate',
    prompt: 'docs/ops/prompts/A1_CI_RUNTIME_GATE_PROMPT.md',
  },
  'A2-Security-Regression-Gate': {
    worktree: '/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate',
    prompt: 'docs/ops/prompts/A2_SECURITY_REVIEW_PROMPT.md',
  },
  'A3-Backend-Critical-Path': {
    worktree: '/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path',
    prompt: 'docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md',
  },
  'A4-Frontend-UAT-Smoke': {
    worktree: '/Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke',
    prompt: 'docs/ops/prompts/A4_FRONTEND_TASK_PROMPT.md',
  },
  'A5-Data-Readiness': {
    worktree: '/Users/mac/phoenix-erp-worktrees/a5-data-readiness',
    prompt: 'docs/ops/prompts/A5_DATA_READINESS_PROMPT.md',
  },
  'A6-Staging-Deploy-Runbook': {
    worktree: '/Users/mac/phoenix-erp-worktrees/a6-staging-deploy-runbook',
    prompt: 'docs/ops/prompts/A6_DEPLOY_RUNBOOK_PROMPT.md',
  },
  'A7-Final-QA-Gate': {
    worktree: '/Users/mac/phoenix-erp-worktrees/a7-final-qa-gate',
    prompt: 'docs/ops/prompts/A7_FINAL_QA_GATE_PROMPT.md',
  },
};

const READY_STATUSES = new Set(['ready', 'ready-next', 'pending-review']);

function cleanCell(cell) {
  return cell.trim().replace(/^`|`$/g, '');
}

function parseRows(markdown) {
  return markdown
    .split('\n')
    .filter((line) => line.startsWith('|') && !line.includes('---'))
    .map((line) => line.split('|').slice(1, -1).map(cleanCell));
}

const boardPath = path.resolve(process.cwd(), BOARD);
const board = readFileSync(boardPath, 'utf8');
const rows = parseRows(board);
const boardRows = rows.filter((row) => row.length >= 10 && row[0] !== 'Task ID');
const worktreeRows = rows.filter((row) => row.length === 5 && row[0] !== 'Agent' && AGENT_CONFIG[row[0]]);

const candidates = boardRows
  .map((row) => ({
    taskId: row[0],
    agent: row[1],
    branch: row[2],
    status: row[3],
    risk: row[5],
    blocker: row[8],
    nextStep: row[9],
  }))
  .filter((row) => READY_STATUSES.has(row.status));

const worktreeCandidates = worktreeRows
  .map((row) => ({
    taskId: `WORKTREE-${row[0]}`,
    agent: row[0],
    branch: row[2],
    status: row[3],
    risk: 'N/A',
    blocker: 'None listed in worktree matrix',
    nextStep: row[4],
  }))
  .filter((row) => READY_STATUSES.has(row.status));

const allCandidates = [...candidates, ...worktreeCandidates];

if (allCandidates.length === 0) {
  console.log('No ready / ready-next / pending-review task found.');
  process.exit(0);
}

const next = allCandidates[0];
const config = AGENT_CONFIG[next.agent] ?? {
  worktree: 'UNKNOWN',
  prompt: 'UNKNOWN',
};

console.log('Suggested next Agent task:');
console.log(`Task ID: ${next.taskId}`);
console.log(`Agent: ${next.agent}`);
console.log(`Branch: ${next.branch}`);
console.log(`Status: ${next.status}`);
console.log(`Risk: ${next.risk}`);
console.log(`Worktree: ${config.worktree}`);
console.log(`Prompt: ${config.prompt}`);
console.log(`Blockers: ${next.blocker}`);
console.log(`Next step: ${next.nextStep}`);
console.log('No command executed. No task board changes made.');
