#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { atomicWriteJson, computeRunnerMetrics, runnerHealthDecision } from './bug-runner-platform.mjs';

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
const report = {
  generated_at: new Date().toISOString(),
  decision: runnerHealthDecision(metrics),
  metrics,
  last_cycle: latest ? {
    decision: latest.decision,
    generated_at: latest.generatedAt,
    head_sha: latest.headSha,
    worker_count: latest.workerRuns?.length || 0,
    blocked_count: latest.blockedTasks?.length || 0,
    ci: latest.ci?.conclusion || latest.ci?.reason || 'unknown',
    production_smoke: latest.productionSmoke?.status === 0 ? 'PASS' : latest.productionSmoke?.reason || 'unknown',
    outbox_pending: latest.outboxRecovery?.pending || 0,
  } : null,
  slo: {
    queue_wait_p95_target_ms: 15 * 60 * 1000,
    lead_time_p95_target_ms: 4 * 60 * 60 * 1000,
    false_complete_target: 0,
    terminal_evidence_coverage_target: 1,
  },
};
atomicWriteJson(outputJson, report);
const formatMs = (value) => value == null ? '-' : `${Math.round(value / 1000)}s`;
const md = `# Bug Runner Platform Dashboard\n\n- Decision: **${report.decision}**\n- Generated: ${report.generated_at}\n- Queue total / active: ${metrics.total} / ${metrics.active}\n- Queue wait P50 / P95: ${formatMs(metrics.queue_wait_p50_ms)} / ${formatMs(metrics.queue_wait_p95_ms)}\n- Lead time P50 / P95: ${formatMs(metrics.lead_time_p50_ms)} / ${formatMs(metrics.lead_time_p95_ms)}\n- False completion: ${metrics.false_complete_count}\n- Raw terminal evidence coverage: ${(metrics.raw_terminal_evidence_coverage * 100).toFixed(1)}%\n- Governed evidence coverage: ${(metrics.terminal_evidence_coverage * 100).toFixed(1)}%\n- Legacy evidence exemptions: ${metrics.legacy_evidence_exemption_count}\n- Last cycle CI: ${report.last_cycle?.ci || '-'}\n- Last cycle smoke: ${report.last_cycle?.production_smoke || '-'}\n\n## Status Counts\n\n${Object.entries(metrics.status_counts).map(([status, count]) => `- ${status}: ${count}`).join('\n')}\n`;
await import('node:fs').then(({ mkdirSync, writeFileSync }) => {
  mkdirSync(path.dirname(outputMd), { recursive: true });
  writeFileSync(outputMd, md);
});
console.log(JSON.stringify({ decision: report.decision, output_json: outputJson, output_md: outputMd, metrics }, null, 2));
