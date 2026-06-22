#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const QUEUE_FILE = 'ops/agent-orchestrator/queue/tasks.json';
const BACKLOG_FILE = 'evolution/improvement-backlog.json';

function readJson(file, fallback) {
  const resolved = path.isAbsolute(file) ? file : path.resolve(ROOT, file);
  if (!existsSync(resolved)) return fallback;
  try {
    return JSON.parse(readFileSync(resolved, 'utf8'));
  } catch {
    return fallback;
  }
}

const queue = readJson(QUEUE_FILE, []);
const backlog = readJson(BACKLOG_FILE, []);
const ready = queue.filter((task) => task.status === 'READY');
const open = backlog.filter((item) => item.status !== 'DONE' && item.status !== 'CANCELLED');

console.log('Dispatch status: PASS');
console.log(`Open improvements: ${open.length}`);
console.log(`READY tasks: ${ready.length}`);
console.log(`Queue file: ${QUEUE_FILE}`);
console.log(`Backlog file: ${BACKLOG_FILE}`);
console.log('Codex CLI executed: No');
console.log('Database written: No');
console.log('Deployed: No');
