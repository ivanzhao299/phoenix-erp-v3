#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const DEFAULT_OUTPUT_DIR = 'docs/ops/runs/bug-intake-inbox';
const TASKS_FILE = 'docs/ops/agent-queue/tasks.json';
const DEFAULT_STATUSES = ['OPEN', 'TRIAGED', 'IN_PROGRESS'];
const APPROVED_REPAIR_STATUS = 'AGENT_APPROVED';
const ACTIVE_REPORT_STATUSES = new Set(['OPEN', 'TRIAGED', 'IN_PROGRESS']);
const TERMINAL_LOCAL_TASK_STATUSES = new Set([
  'completed',
  'COMPLETED_MERGED',
  'VALIDATION_COMPLETED',
  'SKIPPED_NOT_APPLICABLE',
]);
const NODE_BIN = process.execPath;
const DEFAULT_PATH = '/Users/mac/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
const FETCH_ERRORS = [];

export function isTerminalLocalTask(task) {
  return TERMINAL_LOCAL_TASK_STATUSES.has(String(task?.status || ''));
}

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
  const args = {
    dryRun: true,
    limit: 100,
    outputDir: DEFAULT_OUTPUT_DIR,
    fetchTimeoutMs: 45000,
    fetchConcurrency: 5,
    maxResponseBytes: 8 * 1024 * 1024,
    pruneLegacySnapshots: true,
  };
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
    if (arg === '--no-prune-legacy-snapshots') {
      args.pruneLegacySnapshots = false;
      continue;
    }
    if (arg.startsWith('--')) {
      args[arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = normalized[i + 1];
      i += 1;
    }
  }
  args.limit = Math.max(1, Math.min(500, Number(args.limit) || 100));
  args.fetchTimeoutMs = Math.max(5000, Number(args.fetchTimeoutMs) || 45000);
  args.fetchConcurrency = Math.max(1, Math.min(10, Number(args.fetchConcurrency) || 5));
  args.maxResponseBytes = Math.max(1024 * 1024, Number(args.maxResponseBytes) || 8 * 1024 * 1024);
  return args;
}

export async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
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
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temp, target);
}

function stableHash(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function writeJsonIfChanged(file, value) {
  const target = resolveFile(file);
  const nextFingerprint = stableHash(value);
  if (existsSync(target)) {
    try {
      const current = JSON.parse(readFileSync(target, 'utf8'));
      if (stableHash(current) === nextFingerprint) return false;
    } catch {
      // Malformed snapshots are atomically replaced.
    }
  }
  writeJson(file, value);
  return true;
}

export function pruneLegacySnapshots(outputDir) {
  const target = resolveFile(outputDir);
  if (!existsSync(target)) return { removed: 0, reclaimedBytes: 0 };
  const legacy = readdirSync(target, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{8}-\d{6}$/.test(entry.name));
  let reclaimedBytes = 0;
  let removed = 0;
  const directorySize = (file) => {
    const info = statSync(file);
    if (info.isFile()) return info.size;
    if (!info.isDirectory()) return 0;
    return readdirSync(file).reduce((sum, child) => sum + directorySize(path.join(file, child)), 0);
  };
  for (const entry of legacy) {
    const legacyDir = path.join(target, entry.name);
    reclaimedBytes += directorySize(legacyDir);
    rmSync(legacyDir, { recursive: true, force: true });
    removed += 1;
  }
  return { removed, reclaimedBytes };
}

async function readBoundedText(response, maxBytes) {
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > maxBytes) {
    throw new Error(`response payload exceeds ${maxBytes} bytes (content-length ${contentLength})`);
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`response payload exceeds ${maxBytes} bytes while streaming`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
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
      const text = await readBoundedText(res, args.maxResponseBytes);
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
      const pageItems = items
        .filter((item) => item.bugNo)
        .slice(0, Math.max(0, args.limit - details.length));
      const pageDetails = await mapWithConcurrency(pageItems, args.fetchConcurrency, async (item) => {
        try {
          return await apiGet(args, `/api/bug-intake/reports/${encodeURIComponent(item.bugNo)}`);
        } catch (error) {
          FETCH_ERRORS.push({ bugNo: item.bugNo, endpoint: `/api/bug-intake/reports/${item.bugNo}`, error: error.message });
          return null;
        }
      });
      details.push(...pageDetails.filter(Boolean));
      if (items.length < 50) break;
      page += 1;
    }
  }
  // Open-list endpoints intentionally omit CLOSED/REJECTED reports. Reconcile
  // local active non-success routes individually so a remotely closed report
  // cannot remain as permanent local HOLD debt.
  if (existsSync(resolveFile(TASKS_FILE))) {
    const fetched = new Set(details.map((report) => report?.bugNo).filter(Boolean));
    const unresolvedStatuses = new Set(['pending', 'claimed', 'running', 'HOLD', 'hold', 'failed', 'WAITING_CAPACITY', 'WAITING_RUNNER']);
    const localBugNos = [...new Set(readJson(TASKS_FILE)
      .filter((task) => task.source === 'bug-intake')
      .filter((task) => unresolvedStatuses.has(task.status))
      .map((task) => task.source_bug_no)
      .filter((bugNo) => bugNo && !fetched.has(bugNo)))];
    const localDetails = await mapWithConcurrency(localBugNos, args.fetchConcurrency, async (bugNo) => {
      try {
        return await apiGet(args, `/api/bug-intake/reports/${encodeURIComponent(bugNo)}`);
      } catch (error) {
        FETCH_ERRORS.push({ bugNo, endpoint: `/api/bug-intake/reports/${bugNo}`, error: error.message });
        return null;
      }
    });
    details.push(...localDetails.filter(Boolean));
  }
  return details;
}

function hasAgentApproval(report) {
  return report?.repairTaskPayload?.agentExecutionApproval?.approved === true;
}

function isQueueCandidate(report) {
  return report?.repairTaskStatus === APPROVED_REPAIR_STATUS && hasAgentApproval(report);
}

export function shouldPreserveLocalRoute(report, isLatestRoute) {
  if (!isLatestRoute || !hasAgentApproval(report)) return false;
  if (!ACTIVE_REPORT_STATUSES.has(String(report?.status || ''))) return false;
  return ['AGENT_APPROVED', 'AGENT_RUNNING', 'AGENT_EXECUTION_FINISHED', 'HOLD']
    .includes(String(report?.repairTaskStatus || ''));
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
      const target = resolveFile(relativeFile);
      if (existsSync(target)) {
        local.push({
          fileName,
          originalName: attachment.originalName || attachment.original_name || '',
          mimeType: attachment.mimeType || attachment.mime_type || '',
          sourceEndpoint: endpoint,
          localPath: relativeFile,
          sizeBytes: statSync(target).size,
          cached: true,
        });
        continue;
      }
      const body = await apiDownload(args, endpoint);
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

async function writeInboxReports(args, reports, currentDir) {
  const files = [];
  const enrichedReports = [];
  let changedReports = 0;
  for (const report of reports) {
    const bugDir = path.join(currentDir, safeBugFileName(report.bugNo));
    const attachmentCacheDir = path.join(args.outputDir, 'attachments', safeBugFileName(report.bugNo));
    const localAttachments = isQueueCandidate(report)
      ? await downloadAttachments(args, report, attachmentCacheDir)
      : [];
    const enriched = withLocalEvidence(report, localAttachments);
    const file = path.join(bugDir, 'report.json');
    if (writeJsonIfChanged(file, enriched)) changedReports += 1;
    files.push(file);
    enrichedReports.push(enriched);
  }
  writeJson(path.join(args.outputDir, 'latest-index.json'), {
    generated_at: new Date().toISOString(),
    snapshot_dir: currentDir,
    files,
  });
  return { files, reports: enrichedReports, changedReports };
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
    .map((report) => [report.bugNo, report]));
  if (notReadyByBug.size === 0) return [];
  const tasks = readJson(TASKS_FILE);
  const deactivated = [];
  let changed = false;
  const latestRedispatchByBug = new Map();
  for (const task of tasks) {
    if (task.source !== 'bug-intake' || !task.source_bug_no) continue;
    latestRedispatchByBug.set(
      task.source_bug_no,
      Math.max(latestRedispatchByBug.get(task.source_bug_no) ?? -1, Number(task.redispatch_count || 0)),
    );
  }
  for (const task of tasks) {
    const report = notReadyByBug.get(task.source_bug_no);
    if (!report || task.source !== 'bug-intake') continue;
    const remoteStatus = report.repairTaskStatus || 'NOT_READY';
    // A remote report can remain HOLD while its verified implementation has
    // already been integrated locally. Never downgrade immutable local
    // completion evidence during subsequent inbox sync cycles.
    if (isTerminalLocalTask(task)) continue;
    const latestRedispatch = latestRedispatchByBug.get(task.source_bug_no) ?? 0;
    const isLatestRoute = Number(task.redispatch_count || 0) === latestRedispatch;
    const preserveLocalRoute = shouldPreserveLocalRoute(report, isLatestRoute);

    if (preserveLocalRoute) {
      task.remote_repair_status = remoteStatus;
      changed = true;
      if (task.route_active === false && /^remote bug is not executable:/.test(task.route_superseded_reason || '')) {
        task.route_active = true;
        delete task.route_superseded_reason;
        if (task.status === 'archived' && !task.result_file && !task.evidence_gate) {
          task.status = 'pending';
          task.completed_at = null;
        }
      }
      continue;
    }
    if (task.route_active === false) {
      if (['pending', 'claimed', 'running', 'HOLD', 'hold', 'failed', 'WAITING_CAPACITY', 'WAITING_RUNNER'].includes(task.status)) {
        task.status = 'archived';
        task.completed_at = task.completed_at || new Date().toISOString();
        changed = true;
      }
      continue;
    }
    task.route_active = false;
    changed = true;
    task.remote_repair_status = remoteStatus;
    task.route_superseded_reason = `remote bug is not executable: ${remoteStatus}`;
    // Once the remote report is terminal or otherwise no longer executable,
    // every unfinished local route is historical evidence rather than active
    // debt. Keep its quarantine/result metadata, but remove HOLD/failed/running
    // labels from the live queue so dashboards cannot report a false blocker.
    if (['pending', 'claimed', 'running', 'HOLD', 'hold', 'failed', 'WAITING_CAPACITY', 'WAITING_RUNNER'].includes(task.status)) {
      task.status = 'archived';
      task.completed_at = task.completed_at || new Date().toISOString();
    }
    deactivated.push({ task_id: task.task_id, bugNo: task.source_bug_no, remoteStatus });
  }
  if (changed) writeJson(TASKS_FILE, tasks);
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
  const currentDir = path.join(args.outputDir, 'current');
  mkdirSync(resolveFile(currentDir), { recursive: true });
  const inbox = await writeInboxReports(args, reports, currentDir);
  const cachePrune = args.pruneLegacySnapshots
    ? pruneLegacySnapshots(args.outputDir)
    : { removed: 0, reclaimedBytes: 0, skipped: true };
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
    output_dir: currentDir,
    reports_fetched: reports.length,
    reports_changed: inbox.changedReports,
    cache_prune: cachePrune,
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

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  });
}
