#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const RUNS_DIR = 'docs/ops/runs';

function usage(code = 1) {
  console.log(`Usage:
  node scripts/ops/bug-agent-result-to-report.mjs \\
    --bug-no BUG-YYYYMMDD-0001 \\
    --task-id BUGTASK-...-01-A4 \\
    --agent A4-Frontend-UAT-Smoke \\
    --result-file docs/ops/runs/<agent-result>.md \\
    [--api-base http://localhost:3100] [--token <jwt>] [--dry-run] [--apply]

Dry-run writes docs/ops/runs/bug-agent-result-writeback-latest.json.
Apply posts to /api/bug-intake/reports/:bugNo/agent-result.`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { dryRun: true };
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg === '--apply') {
      args.apply = true;
      args.dryRun = false;
      continue;
    }
    if (arg.startsWith('--')) {
      args[arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = normalized[i + 1];
      i += 1;
    }
  }
  return args;
}

function resolveFile(file) {
  return path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
}

function readResult(file) {
  const target = resolveFile(file);
  if (!existsSync(target)) throw new Error(`result file not found: ${file}`);
  const raw = readFileSync(target, 'utf8');
  if (file.endsWith('.json')) {
    const json = JSON.parse(raw);
    return { raw, json };
  }
  return { raw, json: null };
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

function parseChangedFiles(text, json) {
  if (Array.isArray(json?.changed_files)) return json.changed_files;
  if (Array.isArray(json?.changedFiles)) return json.changedFiles;
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /修改文件清单|Changed files/i.test(line));
  if (start < 0) return [];
  const files = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s+\S/.test(line) && files.length > 0) break;
    const cleaned = line.replace(/^[-*]\s*/, '').trim();
    if (!cleaned) {
      if (files.length > 0) break;
      continue;
    }
    if (/^(apps|docs|scripts|packages|database|infra|\.github)\//.test(cleaned)) files.push(cleaned);
  }
  return files.slice(0, 50);
}

function parsePayload(args) {
  const { raw, json } = readResult(args.resultFile);
  const conclusion = json?.conclusion || json?.final_conclusion || firstMatch(raw, [
    /当前结论[:：]\s*([A-Z_ ]+)/i,
    /最终结论[:：]\s*([A-Z_ ]+)/i,
    /conclusion[:：]\s*([A-Z_ ]+)/i,
  ]) || 'HOLD';
  const commitHash = json?.commit_hash || json?.commitHash || firstMatch(raw, [
    /commit hash[:：]\s*([0-9a-f]{7,40})/i,
    /commit[:：]\s*([0-9a-f]{7,40})/i,
  ]);
  const summary = json?.summary || firstMatch(raw, [
    /摘要[:：]\s*([\s\S]{1,2000})/i,
    /Summary\s*\n+([\s\S]{1,2000})/i,
  ]) || raw.slice(0, 2000);
  return {
    taskId: args.taskId,
    agent: args.agent,
    conclusion,
    resultFile: args.resultFile,
    commitHash,
    changedFiles: parseChangedFiles(raw, json),
    validationResults: json?.validation_results || json?.validationResults || null,
    summary,
    nextAction: json?.next_action || json?.nextAction || '',
  };
}

function writeJson(file, value) {
  const target = resolveFile(file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

async function postResult(args, payload) {
  if (!args.apiBase) throw new Error('--apply requires --api-base');
  if (!args.token) throw new Error('--apply requires --token');
  const endpoint = `${args.apiBase.replace(/\/$/, '')}/api/bug-intake/reports/${encodeURIComponent(args.bugNo)}/agent-result`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 1000)}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.bugNo || !args.taskId || !args.agent || !args.resultFile) usage(1);
  const payload = parsePayload(args);
  const dryRunOutput = {
    decision: args.apply ? 'BUG_AGENT_RESULT_WRITEBACK_APPLY' : 'BUG_AGENT_RESULT_WRITEBACK_DRY_RUN',
    bugNo: args.bugNo,
    endpoint: args.apiBase ? `${args.apiBase.replace(/\/$/, '')}/api/bug-intake/reports/${args.bugNo}/agent-result` : null,
    payload,
  };
  writeJson(`${RUNS_DIR}/bug-agent-result-writeback-latest.json`, dryRunOutput);
  if (!args.apply) {
    console.log(JSON.stringify(dryRunOutput, null, 2));
    return;
  }
  const response = await postResult(args, payload);
  writeJson(`${RUNS_DIR}/bug-agent-result-writeback-response-latest.json`, response);
  console.log(JSON.stringify({ ...dryRunOutput, response_status: 'posted' }, null, 2));
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
