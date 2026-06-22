#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const EVOLUTION_DIR = 'evolution';
const RUN_DIRS = ['ops/agent-orchestrator/runs', 'docs/ops/runs'];
const PATTERNS_FILE = `${EVOLUTION_DIR}/failure-patterns.json`;
const LEARNING_LOG_FILE = `${EVOLUTION_DIR}/learning-log.json`;
const BACKLOG_FILE = `${EVOLUTION_DIR}/improvement-backlog.json`;
const STATE_FILE = `${EVOLUTION_DIR}/evolution-state.json`;
const DOCTOR_FILE = 'ops/agent-orchestrator/runs/doctor-latest.json';

const SEVERITY_SCORE = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  INFO: 1,
};

function usage(exitCode = 1) {
  console.log(`Usage:
  node ops/agent-orchestrator/scripts/evolution-planner.mjs --dry-run
  node ops/agent-orchestrator/scripts/evolution-planner.mjs --apply`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  const args = { dryRun: true, apply: false };
  for (const arg of normalized) {
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--dry-run') {
      args.dryRun = true;
      args.apply = false;
    } else if (arg === '--apply') {
      args.apply = true;
      args.dryRun = false;
    }
  }
  return args;
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

function walk(dir) {
  const resolved = resolvePath(dir);
  if (!existsSync(resolved)) return [];
  const files = [];
  for (const entry of readdirSync(resolved)) {
    const full = path.join(resolved, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) files.push(...walk(path.relative(ROOT, full)));
    else files.push(path.relative(ROOT, full));
  }
  return files;
}

function readRecentRunSignals(limit = 80) {
  const files = RUN_DIRS.flatMap((dir) => walk(dir))
    .filter((file) => /\.(json|md|jsonl)$/.test(file))
    .map((file) => ({ file, mtimeMs: statSync(resolvePath(file)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit);
  const signals = [];
  for (const { file } of files) {
    const text = readFileSync(resolvePath(file), 'utf8').slice(0, 120000);
    if (/agent-run-plan\.md|runtime dirty|dirty runtime/i.test(text)) signals.push({ pattern_id: 'PATTERN-001', file });
    if (/completed event missing|result exists|missing completed/i.test(text)) signals.push({ pattern_id: 'PATTERN-002', file });
    if (/missing_fields|recommend_next_agent|verification_results/i.test(text)) signals.push({ pattern_id: 'PATTERN-003', file });
    if (/behind main|needs rebase|worktree.*behind/i.test(text)) signals.push({ pattern_id: 'PATTERN-004', file });
    if (/queue.*conflict|tasks\.json conflict|events\.jsonl conflict|bookkeeping conflict/i.test(text)) signals.push({ pattern_id: 'PATTERN-005', file });
  }
  return signals;
}

function candidateForPattern(pattern, occurrenceBoost = 0) {
  const base = {
    source_pattern_id: pattern.pattern_id,
    root_cause: pattern.root_cause,
    risk: pattern.severity === 'LOW' ? 'LOW' : 'MEDIUM',
    allowed_paths: ['ops/agent-orchestrator/**', 'evolution/**', 'docs/ops/**'],
    forbidden_paths: ['apps/**', 'packages/**', 'database/**', 'infra/**', '.github/**', 'Docker', 'deploy', 'auth'],
    validation_commands: [
      'node --check ops/agent-orchestrator/scripts/evolution-planner.mjs',
      'node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor',
      'node ops/agent-orchestrator/scripts/check-dispatch-status.mjs',
      'git diff --check',
    ],
    acceptance_criteria: [
      'Improvement is represented as a backlog candidate with source pattern traceability.',
      'No business code, migration, DB write, deploy, seed, reset, or cleanup is performed.',
      'Doctor reports Evolution Center summary without HOLD.',
    ],
    auto_fix_allowed: false,
    requires_approval: true,
  };

  if (pattern.pattern_id === 'PATTERN-001') {
    return {
      ...base,
      improvement_id: 'IMPROVE-RUNTIME-PLAN-ARTIFACT',
      title: 'Make agent-run-plan.md an ephemeral runtime artifact',
      proposed_solution: 'Move agent-run-plan.md to an ignored runtime location or let self-repair safely restore it when it is the only dirty artifact.',
      priority: priorityFor(pattern, occurrenceBoost, 0.7),
      owner_recommendation: 'agent-5',
      risk: 'LOW/MEDIUM',
      auto_fix_allowed: true,
      acceptance_criteria: [
        ...base.acceptance_criteria,
        'Finalize/integration no longer blocks when only agent-run-plan.md is dirty.',
        'Self-repair records the restoration action in learning-log.',
      ],
    };
  }
  if (pattern.pattern_id === 'PATTERN-002') {
    return {
      ...base,
      improvement_id: 'IMPROVE-COMPLETED-EVENT-BACKFILL',
      title: 'Backfill completed events from existing result artifacts',
      proposed_solution: 'Teach complete/reconcile to detect result artifacts and append missing completed events before queue status readers run.',
      priority: priorityFor(pattern, occurrenceBoost, 0.8),
      owner_recommendation: 'agent-5 or agent-3',
      risk: 'MEDIUM',
      acceptance_criteria: [
        ...base.acceptance_criteria,
        'A task with result artifact but missing completed event is reconciled to completed.',
        'Backfill is idempotent and event-first readers stay stable.',
      ],
    };
  }
  if (pattern.pattern_id === 'PATTERN-005') {
    return {
      ...base,
      improvement_id: 'IMPROVE-QUEUE-CONFLICT-REDUCTION',
      title: 'Reduce queue JSON conflicts with event-first read model',
      proposed_solution: 'Keep mutable task snapshots minimal and derive status from append-only events to reduce integration queue bookkeeping conflicts.',
      priority: priorityFor(pattern, occurrenceBoost, 0.85),
      owner_recommendation: 'agent-5',
      risk: 'MEDIUM',
      acceptance_criteria: [
        ...base.acceptance_criteria,
        'Queue readers can derive status from events when tasks.json conflicts.',
        'Integration conflict rate for queue bookkeeping is reduced.',
      ],
    };
  }
  return {
    ...base,
    improvement_id: `IMPROVE-${pattern.pattern_id.replace(/^PATTERN-/, '')}`,
    title: `Improve ${pattern.title}`,
    proposed_solution: pattern.description,
    priority: priorityFor(pattern, occurrenceBoost, 0.5),
    owner_recommendation: pattern.suggested_owner || 'agent-5',
  };
}

function priorityFor(pattern, occurrenceBoost, impactWeight) {
  const severity = SEVERITY_SCORE[pattern.severity] || 1;
  const occurrence = Number(pattern.occurrence || 0) + occurrenceBoost;
  const score = severity * 10 + occurrence * 2 + impactWeight * 10;
  if (score >= 48) return 'P0';
  if (score >= 35) return 'P1';
  if (score >= 24) return 'P2';
  return 'P3';
}

function uniqueById(items) {
  const map = new Map();
  for (const item of items) map.set(item.improvement_id, item);
  return [...map.values()];
}

function buildPlan() {
  const patterns = readJson(PATTERNS_FILE, []);
  const learningLog = readJson(LEARNING_LOG_FILE, []);
  const backlog = readJson(BACKLOG_FILE, []);
  const state = readJson(STATE_FILE, {});
  const doctor = readJson(DOCTOR_FILE, {});
  const signals = readRecentRunSignals();
  const signalCounts = signals.reduce((acc, signal) => {
    acc[signal.pattern_id] = (acc[signal.pattern_id] || 0) + 1;
    return acc;
  }, {});

  const candidates = patterns
    .filter((pattern) => ['PATTERN-001', 'PATTERN-002', 'PATTERN-005'].includes(pattern.pattern_id) || signalCounts[pattern.pattern_id] >= 2)
    .map((pattern) => candidateForPattern(pattern, signalCounts[pattern.pattern_id] || 0))
    .sort((a, b) => {
      const priorityRank = { P0: 4, P1: 3, P2: 2, P3: 1 };
      if (priorityRank[b.priority] !== priorityRank[a.priority]) return priorityRank[b.priority] - priorityRank[a.priority];
      const ap = patterns.find((pattern) => pattern.pattern_id === a.source_pattern_id) || {};
      const bp = patterns.find((pattern) => pattern.pattern_id === b.source_pattern_id) || {};
      return (Number(bp.occurrence || 0) + (signalCounts[b.source_pattern_id] || 0)) - (Number(ap.occurrence || 0) + (signalCounts[a.source_pattern_id] || 0));
    });

  return {
    generated_at: new Date().toISOString(),
    inputs: {
      patterns: PATTERNS_FILE,
      learning_log: LEARNING_LOG_FILE,
      backlog: BACKLOG_FILE,
      state: STATE_FILE,
      doctor: existsSync(resolvePath(DOCTOR_FILE)) ? DOCTOR_FILE : null,
      recent_run_dirs: RUN_DIRS,
    },
    repeated_pattern_count: patterns.filter((pattern) => Number(pattern.occurrence || 0) >= 2).length,
    signal_counts: signalCounts,
    doctor_summary: doctor.summary || doctor.evolution_center || null,
    existing_backlog_count: backlog.length,
    learning_log_count: learningLog.length,
    state,
    candidates: uniqueById(candidates),
  };
}

function applyPlan(plan) {
  const existing = readJson(BACKLOG_FILE, []);
  const byId = new Map(existing.map((item) => [item.improvement_id, item]));
  for (const candidate of plan.candidates) {
    byId.set(candidate.improvement_id, {
      ...byId.get(candidate.improvement_id),
      ...candidate,
      status: byId.get(candidate.improvement_id)?.status || 'OPEN',
      updated_at: plan.generated_at,
      created_at: byId.get(candidate.improvement_id)?.created_at || plan.generated_at,
    });
  }
  const backlog = [...byId.values()].sort((a, b) => String(a.improvement_id).localeCompare(String(b.improvement_id)));
  writeJson(BACKLOG_FILE, backlog);

  const learningLog = readJson(LEARNING_LOG_FILE, []);
  learningLog.push({
    at: plan.generated_at,
    event: 'evolution_planner_apply',
    summary: `Generated ${plan.candidates.length} improvement candidate(s).`,
    improvement_ids: plan.candidates.map((candidate) => candidate.improvement_id),
  });
  writeJson(LEARNING_LOG_FILE, learningLog);

  const open = backlog.filter((item) => item.status !== 'DONE' && item.status !== 'CANCELLED');
  writeJson(STATE_FILE, {
    version: 'V3-E',
    last_planner_run_at: plan.generated_at,
    last_apply_at: plan.generated_at,
    open_improvement_count: open.length,
    repeated_pattern_count: plan.repeated_pattern_count,
    highest_priority_improvement: open.find((item) => item.priority === 'P0')?.improvement_id || open[0]?.improvement_id || null,
    backlog_stale: false,
  });
}

function printPlan(plan, mode) {
  console.log(`Evolution Planner mode: ${mode}`);
  console.log(`Repeated patterns: ${plan.repeated_pattern_count}`);
  console.log(`Existing backlog: ${plan.existing_backlog_count}`);
  console.log(`Candidates: ${plan.candidates.length}`);
  for (const candidate of plan.candidates) {
    console.log(`- ${candidate.improvement_id} | ${candidate.priority} | ${candidate.owner_recommendation} | ${candidate.title}`);
  }
}

const args = parseArgs(process.argv.slice(2));
const plan = buildPlan();
printPlan(plan, args.apply ? 'apply' : 'dry-run');
if (args.apply) {
  applyPlan(plan);
  console.log(`Applied improvement backlog: ${BACKLOG_FILE}`);
  console.log(`Updated learning log: ${LEARNING_LOG_FILE}`);
} else {
  console.log('Dry-run only: no files written.');
}
