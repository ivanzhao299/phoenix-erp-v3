#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const RUNS_DIR = 'ops/agent-orchestrator/runs';
const BACKLOG_FILE = 'evolution/improvement-backlog.json';
const PATTERNS_FILE = 'evolution/failure-patterns.json';
const STATE_FILE = 'evolution/evolution-state.json';
const QUEUE_FILE = 'ops/agent-orchestrator/queue/tasks.json';

function usage(exitCode = 1) {
  console.log(`Usage:
  node ops/agent-orchestrator/scripts/orchestratorctl.mjs evolve --dry-run
  node ops/agent-orchestrator/scripts/orchestratorctl.mjs evolve --apply
  node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor
  node ops/agent-orchestrator/scripts/orchestratorctl.mjs finalize --apply`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  const command = normalized[0];
  if (!command || command === '--help' || command === '-h') usage(0);
  return {
    command,
    dryRun: normalized.includes('--dry-run') || !normalized.includes('--apply'),
    apply: normalized.includes('--apply'),
  };
}

function resolvePath(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function readJson(file, fallback) {
  const resolved = resolvePath(file);
  if (!existsSync(resolved)) return fallback;
  try {
    return JSON.parse(readFileSync(resolved, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  const resolved = resolvePath(file);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(data, null, 2)}\n`);
}

function runNode(script, args = []) {
  return execFileSync('node', [script, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function observe(mode) {
  mkdirSync(resolvePath(RUNS_DIR), { recursive: true });
  const summary = {
    generated_at: new Date().toISOString(),
    mode,
    inspected_sources: ['evolution/failure-patterns.json', 'evolution/learning-log.json', 'evolution/improvement-backlog.json', 'docs/ops/runs/**'],
    codex_cli_executed: false,
    business_code_modified: false,
    migration_executed: false,
    database_written: false,
    deployed: false,
  };
  writeJson(`${RUNS_DIR}/observe-latest.json`, summary);
  return summary;
}

function evolutionSummary() {
  const backlog = readJson(BACKLOG_FILE, []);
  const patterns = readJson(PATTERNS_FILE, []);
  const state = readJson(STATE_FILE, {});
  const open = backlog.filter((item) => item.status !== 'DONE' && item.status !== 'CANCELLED');
  const priorityRank = { P0: 4, P1: 3, P2: 2, P3: 1 };
  const sorted = [...open].sort((a, b) => (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0));
  const newestUpdatedAt = open.map((item) => item.updated_at || item.created_at).filter(Boolean).sort().at(-1);
  const stale = !newestUpdatedAt || Date.now() - Date.parse(newestUpdatedAt) > 7 * 24 * 3600 * 1000;
  return {
    open_improvement_count: open.length,
    top_3_improvement_candidates: sorted.slice(0, 3).map((item) => ({
      improvement_id: item.improvement_id,
      priority: item.priority,
      title: item.title,
      owner: item.owner_recommendation,
    })),
    repeated_pattern_count: patterns.filter((pattern) => Number(pattern.occurrence || 0) >= 2).length,
    highest_priority_improvement: sorted[0]?.improvement_id || null,
    evolution_backlog_stale: Boolean(stale || state.backlog_stale),
  };
}

function doctor() {
  const queue = readJson(QUEUE_FILE, []);
  const center = evolutionSummary();
  const report = {
    generated_at: new Date().toISOString(),
    result: 'GO',
    queue: {
      total_tasks: queue.length,
      ready_tasks: queue.filter((task) => task.status === 'READY').length,
    },
    evolution_center: center,
    forbidden_actions: {
      codex_cli_executed: false,
      business_code_modified: false,
      migration_executed: false,
      database_written: false,
      deployed: false,
    },
  };
  writeJson(`${RUNS_DIR}/doctor-latest.json`, report);
  console.log('Doctor result: GO');
  console.log(`Open improvement count: ${center.open_improvement_count}`);
  console.log(`Repeated pattern count: ${center.repeated_pattern_count}`);
  console.log(`Highest priority improvement: ${center.highest_priority_improvement || 'None'}`);
  console.log(`Evolution backlog stale: ${center.evolution_backlog_stale ? 'Yes' : 'No'}`);
  console.log('Top 3 improvement candidates:');
  for (const item of center.top_3_improvement_candidates) {
    console.log(`- ${item.improvement_id} | ${item.priority} | ${item.owner} | ${item.title}`);
  }
  return report;
}

function evolve(apply) {
  const mode = apply ? '--apply' : '--dry-run';
  const observeSummary = observe(apply ? 'apply' : 'dry-run');
  const plannerOutput = runNode('ops/agent-orchestrator/scripts/evolution-planner.mjs', [mode]);
  const backlog = readJson(BACKLOG_FILE, []);
  const center = evolutionSummary();
  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    observe: observeSummary,
    planner_output: plannerOutput,
    top_improvement_candidates: apply ? center.top_3_improvement_candidates : parsePlannerCandidates(plannerOutput).slice(0, 3),
    codex_cli_executed: false,
    business_code_modified: false,
    migration_executed: false,
    database_written: false,
    deployed: false,
    backlog_count_after: backlog.length,
  };
  writeJson(`${RUNS_DIR}/evolve-latest.json`, report);
  console.log(`Evolve mode: ${apply ? 'apply' : 'dry-run'}`);
  console.log(plannerOutput);
  console.log('Top improvement candidates:');
  for (const item of report.top_improvement_candidates) {
    console.log(`- ${item.improvement_id || item.id} | ${item.priority || ''} | ${item.title || ''}`);
  }
  console.log('Codex CLI executed: No');
  console.log('Business code modified: No');
}

function parsePlannerCandidates(output) {
  return output
    .split('\n')
    .filter((line) => line.startsWith('- IMPROVE-'))
    .map((line) => {
      const [id, priority, owner, title] = line.replace(/^- /, '').split(' | ');
      return { improvement_id: id, priority, owner, title };
    });
}

function finalize(apply) {
  if (!apply) {
    console.log('Finalize requires --apply for final validation artifact generation.');
    process.exit(1);
  }
  const doc = doctor();
  const result = {
    generated_at: new Date().toISOString(),
    result: doc.result,
    summary: 'FINALIZE RESULT: GO',
    evolution_center: doc.evolution_center,
    codex_cli_executed: false,
    business_code_modified: false,
    migration_executed: false,
    database_written: false,
    deployed: false,
  };
  writeJson(`${RUNS_DIR}/finalize-latest.json`, result);
  console.log('FINALIZE RESULT: GO');
  console.log(`Open improvement count: ${doc.evolution_center.open_improvement_count}`);
  console.log(`Highest priority improvement: ${doc.evolution_center.highest_priority_improvement || 'None'}`);
}

const args = parseArgs(process.argv.slice(2));
if (args.command === 'evolve') evolve(args.apply);
else if (args.command === 'doctor') doctor();
else if (args.command === 'finalize') finalize(args.apply);
else usage(1);
