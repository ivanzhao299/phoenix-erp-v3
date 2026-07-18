#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { computeRunnerMetrics, runnerHealthDecision, writeJsonIfMateriallyChanged } from './bug-runner-platform.mjs';

const argv = process.argv.slice(2).map((arg) => arg.replace(/^–+/, '--'));
const readArg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
};
const root = process.cwd();
const tasksFile = path.resolve(root, readArg('--tasks', 'docs/ops/agent-queue/tasks.json'));
const runnerSummaryFile = path.resolve(root, readArg('--runner-summary', 'docs/ops/runs/bug-intake-local-runner/latest-summary.json'));
const outputJson = path.resolve(root, readArg('--output-json', 'docs/ops/runs/bug-runner-dashboard-latest.json'));
const outputMd = path.resolve(root, readArg('--output-md', 'docs/ops/runs/bug-runner-dashboard-latest.md'));
const readJson = (file, fallback) => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
const tasksPayload = readJson(tasksFile, []);
const tasks = Array.isArray(tasksPayload) ? tasksPayload : tasksPayload.tasks || [];
const latest = readJson(runnerSummaryFile, null);
const metrics = computeRunnerMetrics(tasks);
const { generated_at: _metricsGeneratedAt, ...stableMetrics } = metrics;
const report = {
  decision: runnerHealthDecision(metrics),
  metrics: stableMetrics,
  current_activity: latest ? {
    worker_count: latest.workerRuns?.length || 0,
    blocked_count: latest.blockedTasks?.length || 0,
  } : { worker_count: 0, blocked_count: 0 },
};
const dashboardChanged = writeJsonIfMateriallyChanged(outputJson, report);
const md = `# Bug Runner Platform Dashboard\n\n- Decision: **${report.decision}**\n- Queue total / active: ${metrics.total} / ${metrics.active}\n- False completion: ${metrics.false_complete_count}\n- Raw terminal evidence coverage: ${(metrics.raw_terminal_evidence_coverage * 100).toFixed(1)}%\n- Governed evidence coverage: ${(metrics.terminal_evidence_coverage * 100).toFixed(1)}%\n- Legacy evidence exemptions: ${metrics.legacy_evidence_exemption_count}\n- Current cycle workers / blocked: ${report.current_activity.worker_count} / ${report.current_activity.blocked_count}\n`;
await import('node:fs').then(({ mkdirSync, writeFileSync }) => {
  mkdirSync(path.dirname(outputMd), { recursive: true });
  writeFileSync(outputMd, md);
});
console.log(JSON.stringify({ decision: report.decision, changed: dashboardChanged, output_json: outputJson, output_md: outputMd, metrics }, null, 2));
