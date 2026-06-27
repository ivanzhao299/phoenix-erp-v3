#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const EVOLUTION_DIR = 'docs/ops/evolution';
const RUNS_DIR = 'docs/ops/runs';
const PATTERNS_FILE = `${EVOLUTION_DIR}/failure-patterns.json`;
const LEARNING_LOG_FILE = `${EVOLUTION_DIR}/learning-log.json`;
const BACKLOG_FILE = `${EVOLUTION_DIR}/improvement-backlog.json`;
const STATE_FILE = `${EVOLUTION_DIR}/evolution-state.json`;
const OBSERVER_FINDINGS_REPORT = 'docs/ops/OBSERVER_FINDINGS_REPORT.md';
const OBSERVER_EVOLUTION_TASKS = 'docs/ops/OBSERVER_EVOLUTION_TASKS.md';
const PLAN_JSON = 'docs/ops/runs/evolution-plan-latest.json';
const PLAN_MD = 'docs/ops/runs/evolution-plan-latest.md';

const PRIORITY_RANK = { P0: 4, P1: 3, P2: 2, P3: 1 };
const SEVERITY_SCORE = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 };

function usage(exitCode = 1) {
  console.log(`Usage:
  node scripts/ops/agent-evolution-planner.mjs --dry-run
  node scripts/ops/agent-evolution-planner.mjs --apply`);
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
    }
    if (arg === '--apply') {
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

function readText(file) {
  const resolved = resolvePath(file);
  return existsSync(resolved) ? readFileSync(resolved, 'utf8') : '';
}

function writeJson(file, data) {
  const resolved = resolvePath(file);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(data, null, 2)}\n`);
}

function writeText(file, text) {
  const resolved = resolvePath(file);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, text);
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

function scanSignals(limit = 160) {
  const files = walk(RUNS_DIR)
    .filter((file) => /\.(json|md|jsonl)$/.test(file))
    .map((file) => ({ file, mtimeMs: statSync(resolvePath(file)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit);
  const texts = [
    { file: OBSERVER_FINDINGS_REPORT, text: readText(OBSERVER_FINDINGS_REPORT) },
    { file: OBSERVER_EVOLUTION_TASKS, text: readText(OBSERVER_EVOLUTION_TASKS) },
    ...files.map(({ file }) => ({ file, text: readText(file).slice(0, 100000) })),
  ];
  const signals = [];
  for (const { file, text } of texts) {
    if (/agent-run-plan\.md|runtime dirty|finalize.*dirty/i.test(text)) signals.push({ pattern_id: 'PATTERN-001', file });
    if (/completed event missing|result exists|missing completed/i.test(text)) signals.push({ pattern_id: 'PATTERN-002', file });
    if (/missing_fields|missing commit_hash|missing verification_results|recommend_next_agent|report schema/i.test(text)) signals.push({ pattern_id: 'PATTERN-003', file });
    if (/routing|route.*missing|漏派|漏选|protected attachment|protected preview|protected download|菜单码|角色授权/i.test(text)) signals.push({ pattern_id: 'PATTERN-004', file });
    if (/queue.*conflict|tasks\.json conflict|events\.jsonl conflict|bookkeeping conflict/i.test(text)) signals.push({ pattern_id: 'PATTERN-005', file });
    if (/A5|Data-Readiness|data readiness|readiness|主数据|门店|公司|账户|角色映射|数据准备/i.test(text)) signals.push({ pattern_id: 'PATTERN-PHX-001', file });
    if (/manual rebase|手工.*rebase|manual merge|手工.*merge|docs\/ops\/runs.*cleanup|清.*docs\/ops\/runs|baseline autopilot/i.test(text)) {
      signals.push({ pattern_id: 'PATTERN-PHX-002', file });
    }
  }
  return signals;
}

function priorityFor(pattern, signalCount, weight = 0.7) {
  const severity = SEVERITY_SCORE[pattern.severity] || 1;
  const occurrence = Number(pattern.occurrence || 0) + signalCount;
  const score = severity * 10 + occurrence * 1.5 + weight * 10;
  if (score >= 50) return 'P0';
  if (score >= 36) return 'P1';
  if (score >= 25) return 'P2';
  return 'P3';
}

function baseCandidate(pattern, signalCount) {
  return {
    improvement_id: `IMPROVE-${pattern.pattern_id.replace(/^PATTERN-/, '').replace(/^PHX-/, 'PHX-')}`,
    source_pattern_id: pattern.pattern_id,
    title: `Improve ${pattern.title}`,
    root_cause: pattern.root_cause,
    proposed_solution: pattern.description,
    risk: pattern.severity === 'LOW' ? 'LOW' : 'LOW/MEDIUM',
    priority: priorityFor(pattern, signalCount),
    owner_recommendation: pattern.suggested_owner || 'Codex-Orchestrator',
    allowed_paths: ['scripts/ops/**', 'docs/ops/**', 'docs/ops/evolution/**', 'docs/ops/runs/**', 'docs/ops/agent-queue/**'],
    forbidden_paths: ['apps/api/**', 'apps/web/**', 'apps/api/src/database/migrations/**', 'database/**', 'infra/**', '.github/**', 'Docker', 'deploy/**', 'auth/**', 'schema/entity/table/column'],
    validation_commands: [
      'node --check scripts/ops/agent-evolution-planner.mjs',
      'node --check scripts/ops/agent-goal-to-queue.mjs',
      'node scripts/ops/agent-doctor.mjs',
      'node scripts/ops/agent-finalize.mjs --apply',
      'git diff --check',
      'node scripts/ci/check-w5-closeout-gate.mjs',
    ],
    acceptance_criteria: [
      'Improvement candidate contains source pattern traceability.',
      'No business code, migration, DB write, deploy, seed, reset, cleanup, or push is performed.',
      'Doctor and Finalize expose Evolution Center state.',
    ],
    auto_fix_allowed: false,
    requires_approval: true,
    occurrence: Number(pattern.occurrence || 0) + signalCount,
    severity: pattern.severity,
  };
}

function candidateFor(pattern, signalCount) {
  const base = baseCandidate(pattern, signalCount);
  const overrides = {
    'PATTERN-PHX-001': {
      improvement_id: 'IMPROVE-ROUTER-A5-READINESS',
      title: 'Harden A5 data readiness routing',
      proposed_solution: 'Keep data readiness, readiness, master data, store/company/account/role mapping as mandatory A5 Router triggers with regression fixtures.',
      risk: 'LOW/MEDIUM',
      owner_recommendation: 'Codex-Orchestrator',
      auto_fix_allowed: true,
      acceptance_criteria: [...base.acceptance_criteria, 'A5 is selected whenever readiness or data preparation signals appear with relevant context.'],
    },
    'PATTERN-004': {
      improvement_id: 'IMPROVE-ROUTER-A2-A3-PROTECTED-ATTACHMENT',
      title: 'Harden A2/A3 routing for authorization and protected attachment',
      proposed_solution: 'Add Router regression coverage for menu code, role authorization, protected preview/download, attachment ACL, and backend boundary signals.',
      risk: 'LOW/MEDIUM',
      owner_recommendation: 'Codex-Orchestrator',
      auto_fix_allowed: true,
      acceptance_criteria: [...base.acceptance_criteria, 'Protected attachment and authorization requests select both A2 and A3.'],
    },
    'PATTERN-PHX-002': {
      improvement_id: 'IMPROVE-BASELINE-AUTOPILOT-LIFECYCLE',
      title: 'Attach baseline autopilot to every Agent lifecycle path',
      proposed_solution: 'Ensure Agent execution, merge, observer, planner, and queue paths never require user manual rebase, merge, or docs/ops/runs cleanup.',
      risk: 'LOW',
      owner_recommendation: 'Codex-Orchestrator',
      auto_fix_allowed: true,
      acceptance_criteria: [...base.acceptance_criteria, 'User-facing instructions no longer require manual sync, rebase, merge, or runs cleanup.'],
    },
    'PATTERN-003': {
      improvement_id: 'IMPROVE-REPORT-SCHEMA-COMPLIANCE',
      title: 'Enforce Agent report schema compliance before decision',
      proposed_solution: 'Normalize and validate required report fields before parse, diagnose, decision, and task board updates.',
      risk: 'LOW/MEDIUM',
      owner_recommendation: 'A1-CI-Runtime-Gate or Codex-Orchestrator',
      auto_fix_allowed: true,
      acceptance_criteria: [...base.acceptance_criteria, 'Missing report fields are detected and normalized before next-Agent decision.'],
    },
    'PATTERN-005': {
      improvement_id: 'IMPROVE-QUEUE-CONFLICT-REDUCTION',
      title: 'Reduce queue JSON conflicts',
      proposed_solution: 'Move toward an event-first read model and minimize mutable queue JSON writes.',
      risk: 'MEDIUM',
      owner_recommendation: 'Codex-Orchestrator',
      acceptance_criteria: [...base.acceptance_criteria, 'Queue readers can tolerate task snapshot conflicts by deriving status from events.'],
    },
  };
  return { ...base, ...(overrides[pattern.pattern_id] || {}) };
}

function buildPlan() {
  const patterns = readJson(PATTERNS_FILE, []);
  const learningLog = readJson(LEARNING_LOG_FILE, []);
  const backlog = readJson(BACKLOG_FILE, []);
  const state = readJson(STATE_FILE, {});
  const signals = scanSignals();
  const signalCounts = signals.reduce((acc, signal) => {
    acc[signal.pattern_id] = (acc[signal.pattern_id] || 0) + 1;
    return acc;
  }, {});
  const required = ['PATTERN-PHX-001', 'PATTERN-004', 'PATTERN-PHX-002', 'PATTERN-003', 'PATTERN-005'];
  const candidates = patterns
    .filter((pattern) => required.includes(pattern.pattern_id) || signalCounts[pattern.pattern_id] >= 2)
    .map((pattern) => candidateFor(pattern, signalCounts[pattern.pattern_id] || 0))
    .sort((a, b) => {
      if (PRIORITY_RANK[b.priority] !== PRIORITY_RANK[a.priority]) return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
      if (b.occurrence !== a.occurrence) return b.occurrence - a.occurrence;
      return (SEVERITY_SCORE[b.severity] || 0) - (SEVERITY_SCORE[a.severity] || 0);
    });
  const unique = [...new Map(candidates.map((candidate) => [candidate.improvement_id, candidate])).values()];
  return {
    generated_at: new Date().toISOString(),
    inputs: {
      failure_patterns: PATTERNS_FILE,
      learning_log: LEARNING_LOG_FILE,
      improvement_backlog: BACKLOG_FILE,
      evolution_state: STATE_FILE,
      runs: RUNS_DIR,
      observer_findings_report: OBSERVER_FINDINGS_REPORT,
      observer_evolution_tasks: OBSERVER_EVOLUTION_TASKS,
    },
    repeated_pattern_count: patterns.filter((pattern) => Number(pattern.occurrence || 0) >= 2).length,
    signal_counts: signalCounts,
    existing_backlog_count: backlog.length,
    learning_log_count: learningLog.length,
    previous_state: state,
    candidates: unique,
  };
}

function markdown(plan) {
  return `# Evolution Plan Latest

| Field | Value |
| --- | --- |
| Generated at | ${plan.generated_at} |
| Repeated patterns | ${plan.repeated_pattern_count} |
| Existing backlog | ${plan.existing_backlog_count} |
| Candidates | ${plan.candidates.length} |

## Top Candidates

${plan.candidates.map((candidate) => `- ${candidate.improvement_id} / ${candidate.priority} / ${candidate.owner_recommendation}: ${candidate.title}`).join('\n')}
`;
}

function applyPlan(plan) {
  const existing = readJson(BACKLOG_FILE, []);
  const byId = new Map(existing.map((item) => [item.improvement_id, item]));
  for (const candidate of plan.candidates) {
    byId.set(candidate.improvement_id, {
      ...byId.get(candidate.improvement_id),
      ...candidate,
      status: byId.get(candidate.improvement_id)?.status || 'OPEN',
      created_at: byId.get(candidate.improvement_id)?.created_at || plan.generated_at,
      updated_at: plan.generated_at,
    });
  }
  const backlog = [...byId.values()].sort((a, b) => {
    if (PRIORITY_RANK[b.priority] !== PRIORITY_RANK[a.priority]) return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    return a.improvement_id.localeCompare(b.improvement_id);
  });
  writeJson(BACKLOG_FILE, backlog);

  const learningLog = readJson(LEARNING_LOG_FILE, []);
  learningLog.push({
    at: plan.generated_at,
    event: 'phoenix_evolution_planner_apply',
    summary: `Generated ${plan.candidates.length} Phoenix improvement candidate(s).`,
    improvement_ids: plan.candidates.map((candidate) => candidate.improvement_id),
  });
  writeJson(LEARNING_LOG_FILE, learningLog);

  const open = backlog.filter((item) => item.status !== 'DONE' && item.status !== 'CANCELLED');
  writeJson(STATE_FILE, {
    version: 'PHOENIX-V3E',
    last_planner_run_at: plan.generated_at,
    last_apply_at: plan.generated_at,
    open_improvement_count: open.length,
    repeated_pattern_count: plan.repeated_pattern_count,
    highest_priority_improvement: open[0]?.improvement_id || null,
    backlog_stale: false,
  });

  writeJson(PLAN_JSON, plan);
  writeText(PLAN_MD, markdown(plan));
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
  console.log(`Applied: ${BACKLOG_FILE}`);
  console.log(`Plan JSON: ${PLAN_JSON}`);
  console.log(`Plan MD: ${PLAN_MD}`);
} else {
  console.log('Dry-run only: no backlog or plan files written.');
}
