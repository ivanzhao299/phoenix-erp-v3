#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DEFAULT_OUTPUT_DIR = 'docs/ops/runs/bug-intake-inbox';
const TASKS_FILE = 'docs/ops/agent-queue/tasks.json';
const DEFAULT_STATUSES = ['OPEN', 'TRIAGED', 'IN_PROGRESS'];
const APPROVED_REPAIR_STATUS = 'AGENT_APPROVED';
const NODE_BIN = process.execPath;
const DEFAULT_PATH = '/Users/mac/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
const FETCH_ERRORS = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function usage(code = 1) {
  console.log(`Usage:
  node scripts/ops/bug-intake-sync-from-api.mjs \\
    --api-base https://erp.eggslao.com \\
    --token-env PHOENIX_ERP_TOKEN \\
    [--dry-run] [--apply-queue] [--limit 100] [--fetch-timeout-ms 45000] [--output-dir docs/ops/runs/bug-intake-inbox]

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
  const args = { dryRun: true, limit: 100, outputDir: DEFAULT_OUTPUT_DIR, fetchTimeoutMs: 45000 };
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
  args.fetchTimeoutMs = Math.max(5000, Number(args.fetchTimeoutMs) || 45000);
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
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), args.fetchTimeoutMs);
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
      const text = await res.text();
      if (!res.ok) {
        const error = new Error(`GET ${endpoint} failed HTTP ${res.status}: ${text.slice(0, 500)}`);
        error.retryable = res.status >= 500 || res.status === 429;
        throw error;
      }
      return text ? JSON.parse(text) : {};
    } catch (error) {
      lastError = error;
      const retryable = error.retryable === true || error.name === 'AbortError' || /fetch failed|timeout|socket|econn/i.test(error.message);
      if (!retryable || attempt >= 3) break;
      await sleep(attempt * 1000);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function apiDownload(args, endpoint) {
  const token = getToken(args);
  if (!args.apiBase) throw new Error('--api-base is required without --fixture-json');
  if (!token) throw new Error('--token or --token-env is required without --fixture-json');
  const url = `${args.apiBase.replace(/\/$/, '')}${endpoint}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.fetchTimeoutMs);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
    .finally(() => clearTimeout(timeout));
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GET ${endpoint} failed HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
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
        try {
          details.push(await apiGet(args, `/api/bug-intake/reports/${encodeURIComponent(item.bugNo)}`));
        } catch (error) {
          FETCH_ERRORS.push({ bugNo: item.bugNo, endpoint: `/api/bug-intake/reports/${item.bugNo}`, error: error.message });
        }
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

async function downloadAttachments(args, report, bugDir) {
  if (args.fixtureJson || args.dryRunNoAttachments) return [];
  const attachments = Array.isArray(report.attachments) ? report.attachments : [];
  const local = [];
  for (const attachment of attachments) {
    const endpoint = attachment?.previewEndpoint || attachment?.preview_endpoint;
    const fileName = attachment?.fileName || attachment?.file_name;
    if (!endpoint || !fileName) continue;
    const safeName = String(fileName).replace(/[^\w.,@()+ -]/g, '_');
    const relativeFile = path.join(bugDir, 'attachments', safeName);
    try {
      const body = await apiDownload(args, endpoint);
      const target = resolveFile(relativeFile);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, body);
      local.push({
        fileName,
        originalName: attachment.originalName || attachment.original_name || '',
        mimeType: attachment.mimeType || attachment.mime_type || '',
        sourceEndpoint: endpoint,
        localPath: relativeFile,
        sizeBytes: body.length,
      });
    } catch (error) {
      local.push({
        fileName,
        sourceEndpoint: endpoint,
        downloadError: error.message,
      });
    }
  }
  return local;
}

function withLocalEvidence(report, localAttachments) {
  if (!localAttachments.length) return report;
  const evidence = {
    localAttachments,
    localAttachmentPaths: localAttachments.map((item) => item.localPath).filter(Boolean),
  };
  const next = {
    ...report,
    localEvidence: evidence,
  };
  if (next.repairTaskPayload && typeof next.repairTaskPayload === 'object') {
    next.repairTaskPayload = {
      ...next.repairTaskPayload,
      context: {
        ...(next.repairTaskPayload.context || {}),
        localEvidence: evidence,
      },
    };
  }
  return next;
}

async function writeInboxReports(args, reports, batchDir) {
  const files = [];
  const enrichedReports = [];
  for (const report of reports) {
    const bugDir = path.join(batchDir, safeBugFileName(report.bugNo));
    const localAttachments = await downloadAttachments(args, report, bugDir);
    const enriched = withLocalEvidence(report, localAttachments);
    const file = path.join(bugDir, 'report.json');
    writeJson(file, enriched);
    files.push(file);
    enrichedReports.push(enriched);
  }
  writeJson(path.join(args.outputDir, 'latest-index.json'), {
    generated_at: new Date().toISOString(),
    batch_dir: batchDir,
    files,
  });
  return { files, reports: enrichedReports };
}

function queueHandoff(file, apply) {
  const command = [
    NODE_BIN,
    'scripts/ops/bug-task-to-agent-queue.mjs',
    '--repair-task-json',
    file,
    apply ? '--apply' : '--dry-run',
  ];
  const result = spawnSync(command[0], command.slice(1), {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, PATH: process.env.PATH || DEFAULT_PATH },
    timeout: 120000,
  });
  return {
    command: command.join(' '),
    status: result.status ?? 1,
    signal: result.signal || null,
    timedOut: result.error?.code === 'ETIMEDOUT',
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function deactivateNotReadyQueueTasks(reports, apply) {
  if (!apply || !existsSync(resolveFile(TASKS_FILE))) return [];
  const notReadyByBug = new Map(reports
    .filter((report) => !isQueueCandidate(report) && report?.bugNo)
    .map((report) => [report.bugNo, report.repairTaskStatus || 'NOT_READY']));
  if (notReadyByBug.size === 0) return [];
  const tasks = readJson(TASKS_FILE);
  const deactivated = [];
  for (const task of tasks) {
    const remoteStatus = notReadyByBug.get(task.source_bug_no);
    if (!remoteStatus || task.source !== 'bug-intake' || task.route_active === false) continue;
    task.route_active = false;
    task.remote_repair_status = remoteStatus;
    task.route_superseded_reason = `remote bug is not executable: ${remoteStatus}`;
    if (['pending', 'claimed'].includes(task.status)) {
      task.status = 'archived';
      task.completed_at = task.completed_at || new Date().toISOString();
    }
    deactivated.push({ task_id: task.task_id, bugNo: task.source_bug_no, remoteStatus });
  }
  if (deactivated.length > 0) writeJson(TASKS_FILE, tasks);
  return deactivated;
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
    '',
    '## Fetch Errors',
    '',
    ...(summary.fetch_errors.length
      ? summary.fetch_errors.map((item) => `- ${item.bugNo || item.endpoint}: ${item.error}`)
      : ['- None']),
  ];
  writeFileSync(resolveFile(file), `${lines.join('\n')}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const reports = await fetchReports(args);
  const batchDir = path.join(args.outputDir, stamp());
  mkdirSync(resolveFile(batchDir), { recursive: true });
  const inbox = await writeInboxReports(args, reports, batchDir);
  const files = inbox.files;
  const enrichedReports = inbox.reports;
  const fileByBugNo = new Map(files.map((file, index) => [enrichedReports[index]?.bugNo, file]));
  const queueCandidates = enrichedReports.filter(isQueueCandidate);
  const notReady = enrichedReports
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
  const deactivatedNotReadyTasks = deactivateNotReadyQueueTasks(enrichedReports, Boolean(args.applyQueue));

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
      localAttachmentPaths: report.localEvidence?.localAttachmentPaths || [],
    })),
    not_ready: notReady,
    queue_results: queueResults,
    deactivated_not_ready_tasks: deactivatedNotReadyTasks,
    fetch_errors: FETCH_ERRORS,
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
