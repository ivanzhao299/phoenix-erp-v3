#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const STATE_FILE = 'docs/ops/agent-queue/release-state.json';
const EVENTS_FILE = 'docs/ops/agent-queue/release-events.jsonl';
const STATES = [
  'REQUESTED',
  'PLANNED',
  'TASKS_CREATED',
  'CLAIMED',
  'RUNNING',
  'COMPLETED',
  'DIAGNOSED',
  'SECURITY_REVIEW',
  'CI_VALIDATION',
  'MERGE_READY',
  'MERGED',
  'UAT_READY',
  'DEPLOY_READY',
  'PRODUCTION_GO_REQUIRED',
  'PRODUCTION_DEPLOYED',
  'HOLD',
  'FAILED',
  'ROLLBACK_REQUIRED',
];

function usage(exitCode = 1) {
  console.log(`Usage:
  node scripts/ops/agent-release-state-machine.mjs --show
  node scripts/ops/agent-release-state-machine.mjs --request-id <id> --to <state> [--dry-run] [--reason <text>]`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  const values = {};
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === '--show' || arg === '--dry-run') {
      values[arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg.startsWith('--')) {
      values[arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = normalized[i + 1];
      i += 1;
    }
  }
  return values;
}

function ensureFiles() {
  mkdirSync('docs/ops/agent-queue', { recursive: true });
  if (!existsSync(STATE_FILE)) writeFileSync(STATE_FILE, '{}\n');
  if (!existsSync(EVENTS_FILE)) writeFileSync(EVENTS_FILE, '');
}

function readState() {
  ensureFiles();
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
}

function writeState(state) {
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

function event(payload) {
  appendFileSync(EVENTS_FILE, `${JSON.stringify({ at: new Date().toISOString(), ...payload })}\n`);
}

const args = parseArgs(process.argv.slice(2));
ensureFiles();

if (args.show) {
  const state = readState();
  const entries = Object.entries(state);
  if (entries.length === 0) console.log('No release states.');
  for (const [requestId, item] of entries) console.log(`${requestId} | ${item.state} | ${item.reason || ''}`);
  process.exit(0);
}

if (!args.requestId || !args.to || !STATES.includes(args.to)) usage(1);

const current = readState();
const previous = current[args.requestId]?.state || 'REQUESTED';
const payload = {
  request_id: args.requestId,
  previous_state: previous,
  next_state: args.to,
  reason: args.reason || null,
  dry_run: Boolean(args.dryRun),
};

console.log(`Request ID: ${args.requestId}`);
console.log(`Transition: ${previous} -> ${args.to}`);
if (args.dryRun) {
  console.log('Dry run: state file not modified. No deploy, DB write, migration, push, or merge executed.');
  process.exit(0);
}

current[args.requestId] = {
  state: args.to,
  reason: args.reason || null,
  updated_at: new Date().toISOString(),
};
writeState(current);
event(payload);
console.log('State updated.');
console.log('Deploy executed: No');
console.log('Database written: No');
console.log('Migration executed: No');
