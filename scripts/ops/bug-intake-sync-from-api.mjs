#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DEFAULT_OUTPUT_DIR = 'docs/ops/runs/bug-intake-inbox';
const DEFAULT_STATUSES = ['OPEN', 'TRIAGED', 'IN_PROGRESS'];
const APPROVED_REPAIR_STATUS = 'AGENT_APPROVED';

function usage(code = 1) {
  console.log(`Usage:
  node scripts/ops/bug-intake-sync-from-api.mjs \\
    --api-base https://erp.eggslao.com \\
    --token-env PHOENIX_ERP_TOKEN \\
    [--dry-run] [--apply-queue] [--limit 100] [--output-dir docs/ops/runs/bug-intake-inbox]

Test with a local fixture:
  node scripts/ops/bug-intake-sync-from-api.mjs --fixture-json /tmp/bug-reports.json --dry-run

Behavior:
  - Pulls production bug reports read-only.
  - Writes a local inbox snapshot under docs/ops/runs/bug-intake-inbox.
  - Only AGENT_APPROVED reports can be applied into docs/ops/agent-queue/tasks.json.
  - Never runs Codex CLI, never modifies business code, never deploys.`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { dryRun: true, limit: 100, outputDir: DEFAULT_OUTPUT_DIR };
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg === '--apply-queue') {
      args.applyQueue = true;
      continue;
    }
    if (arg.startsWith('--')) {
      args[arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = normalized[i + 1];
      i += 1;
    }
  }
  args.limit = Math.max(1, Math.min(500, Number(args.limit) || 100));
  return args;
}

function resolveFile(file) {
  return path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
}

function readJson(file) {
  return JSON.parse(readFileSync(resolveFile(file), 'utf8'));
}

function writeJson(file, value) {
  const target = resolveFile(file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function stamp() {
  const d = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function getToken(args) {
  if (args.token) return args.token;
  if (args.tokenEnv) return process.env[args.tokenEnv] || '';
  return process.env.PHOENIX_ERP_TOKEN || '';
}

async function apiGet(args, endpoint) {
  const token = getToken(args);
  if (!args.apiBase) throw new Error('--api-base is required without --fixture-json');
  if (!token) throw new Error('--token or --token-env is required without --fixture-json');
  const url = `${args.apiBase.replace(/\/$/, '')}${endpoint}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${endpoint} failed HTTP ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

async function fetchReports(args) {
  if (args.fixtureJson) {
    const fixture = readJson(args.fixtureJson);
    return Array.isArray(fixture) ? fixture : (fixture.items || fixture.reports || []);
  }
  const statuses = args.statuses ? String(args.statuses).split(',').map((item) => item.trim()).filter(Boolean) : DEFAULT_STATUSES;
  const details = [];
  for (const status of statuses) {
    let page = 1;
    while (details.length < args.limit) {
      const list = await apiGet(args, `/api/bug-intake/reports?page=${page}&limit=50&status=${encodeURIComponent(status)}`);
      const items = Array.isArray(list.items) ? list.items : [];
      if (items.length === 0) break;
      for (const item of items) {
        if (!item.bugNo || details.length >= args.limit) continue;
        details.push(await apiGet(args, `/api/bug-intake/reports/${encodeURIComponent(item.bugNo)}`));
      }
      if (items.length < 50) break;
      page += 1;
    }
  }
  return details;
}

function hasAgentApproval(report) {
  return report?.repairTaskPayload?.agentExecutionApproval?.approved === true;
}

function isQueueCandidate(report) {
  return report?.repairTaskStatus === APPROVED_REPAIR_STATUS && hasAgentApproval(report);
}

function safeBugFileName(bugNo) {
  return String(bugNo || 'BUG-UNKNOWN').replace(/[^\w.-]/g, '_');
}

function writeInboxReports(args, reports, batchDir) {
  const files = [];
  for (const report of reports) {
    const file = path.join(batchDir, `${safeBugFileName(report.bugNo)}.json`);
    writeJson(file, report);
    files.push(file);
  }
  writeJson(path.join(args.outputDir, 'latest-index.json'), {
    generated_at: new Date().toISOString(),
    batch_dir: batchDir,
    files,
  });
  return files;
}

function queueHandoff(file, apply) {
  const command = [
    'node',
    'scripts/ops/bug-task-to-agent-queue.mjs',
    '--repair-task-json',
    file,
    apply ? '--apply' : '--dry-run',
  ];
  const result = spawnSync(command[0], command.slice(1), { cwd: process.cwd(), encoding: 'utf8' });
  return {
    command: command.join(' '),
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function writeMarkdownSummary(file, summary) {
  const lines = [
    '# Bug Intake Local Inbox Sync',
    '',
    `Generated at: ${summary.generated_at}`,
    `Decision: ${summary.decision}`,
    `Reports fetched: ${summary.reports_fetched}`,
    `Queue candidates: ${summary.queue_candidates.length}`,
    `Queue apply: ${summary.apply_queue ? 'Yes' : 'No'}`,
    '',
    '## Queue Candidates',
    '',
    ...(summary.queue_candidates.length
      ? summary.queue_candidates.map((item) => `- ${item.bugNo} / ${item.repairTaskNo} / ${item.title}`)
      : ['- None']),
    '',
    '## Held / Not Ready',
    '',
    ...(summary.not_ready.length
      ? summary.not_ready.map((item) => `- ${item.bugNo}: ${item.reason}`)
      : ['- None']),
  ];
  writeFileSync(resolveFile(file), `${lines.join('\n')}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const reports = await fetchReports(args);
  const batchDir = path.join(args.outputDir, stamp());
  mkdirSync(resolveFile(batchDir), { recursive: true });
  const files = writeInboxReports(args, reports, batchDir);
  const fileByBugNo = new Map(files.map((file, index) => [reports[index]?.bugNo, file]));
  const queueCandidates = reports.filter(isQueueCandidate);
  const notReady = reports
    .filter((report) => !isQueueCandidate(report))
    .map((report) => ({
      bugNo: report.bugNo,
      repairTaskStatus: report.repairTaskStatus || '',
      reason: !report.repairTaskNo
        ? 'missing repair task'
        : !report.repairTaskPayload?.agentPlan
          ? 'missing agent plan'
          : !hasAgentApproval(report)
            ? 'missing agent execution approval'
            : `repairTaskStatus is ${report.repairTaskStatus || 'empty'}`,
    }));

  const queueResults = [];
  for (const report of queueCandidates) {
    const file = fileByBugNo.get(report.bugNo);
    if (!file) continue;
    const result = queueHandoff(file, Boolean(args.applyQueue));
    queueResults.push({
      bugNo: report.bugNo,
      repairTaskNo: report.repairTaskNo,
      command: result.command,
      status: result.status,
      stdout_excerpt: result.stdout.slice(0, 2000),
      stderr_excerpt: result.stderr.slice(0, 2000),
    });
    if (result.status !== 0) {
      throw new Error(`queue handoff failed for ${report.bugNo}: ${result.stderr || result.stdout}`);
    }
  }

  const summary = {
    decision: args.applyQueue ? 'BUG_INTAKE_QUEUE_APPLIED' : 'BUG_INTAKE_SYNC_DRY_RUN',
    generated_at: new Date().toISOString(),
    api_base: args.fixtureJson ? 'fixture' : args.apiBase,
    output_dir: batchDir,
    reports_fetched: reports.length,
    apply_queue: Boolean(args.applyQueue),
    queue_candidates: queueCandidates.map((report) => ({
      bugNo: report.bugNo,
      title: report.title,
      repairTaskNo: report.repairTaskNo,
      repairTaskStatus: report.repairTaskStatus,
    })),
    not_ready: notReady,
    queue_results: queueResults,
    safety: {
      codex_cli_executed: false,
      business_code_modified: false,
      database_written: false,
      deployed: false,
      pushed: false,
    },
  };

  writeJson(path.join(args.outputDir, 'latest-summary.json'), summary);
  writeMarkdownSummary(path.join(args.outputDir, 'latest-summary.md'), summary);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
