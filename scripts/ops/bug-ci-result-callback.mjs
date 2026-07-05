#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const RUNS_DIR = 'docs/ops/runs';

function usage(code = 1) {
  console.log(`Usage:
  node scripts/ops/bug-ci-result-callback.mjs \\
    --bug-no BUG-YYYYMMDD-0001 \\
    --api-base https://erp.eggslao.com \\
    --token-env PHOENIX_ERP_RUNNER_TOKEN \\
    --commit <sha> \\
    --run-url <github-actions-url> \\
    --conclusion success|failure|cancelled \\
    [--dry-run] [--apply]

Purpose:
  Write CI/CD deployment status back to a bug report as a BugIntakeCICD result.
  This script does not deploy, does not push, does not run migration, and does not write business data.`);
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

function writeJson(file, value) {
  const target = resolveFile(file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeConclusion(value) {
  const text = String(value || '').toLowerCase();
  if (text === 'success' || text === 'pass' || text === 'passed') return 'PASS';
  if (text === 'cancelled' || text === 'canceled') return 'HOLD';
  return 'FAIL';
}

function buildPayload(args) {
  const conclusion = normalizeConclusion(args.conclusion);
  return {
    taskId: `CICD-${String(args.commit || 'UNKNOWN').slice(0, 12)}`,
    agent: 'BugIntakeCICD',
    conclusion,
    resultFile: String(args.runUrl || ''),
    commitHash: String(args.commit || ''),
    changedFiles: [],
    validationResults: {
      githubRunUrl: args.runUrl || '',
      githubRunId: args.runId || '',
      deployEnvironment: args.environment || 'production',
      deployMode: args.deployMode || '',
      conclusion: args.conclusion || '',
      deployed: conclusion === 'PASS',
    },
    summary: [
      `CI/CD result: ${args.conclusion || 'unknown'}`,
      `Commit: ${args.commit || 'unknown'}`,
      `Run: ${args.runUrl || 'unknown'}`,
      `Environment: ${args.environment || 'production'}`,
    ].join('\n'),
    nextAction: conclusion === 'PASS' ? 'Business owner validates the production fix.' : 'Investigate CI/CD failure before closing bug.',
  };
}

async function postResult(args, payload) {
  if (!args.apiBase) throw new Error('--api-base is required for --apply');
  const token = args.token || (args.tokenEnv ? process.env[args.tokenEnv] : '');
  if (!token) throw new Error('--token or --token-env is required for --apply');
  const endpoint = `${args.apiBase.replace(/\/$/, '')}/api/bug-intake/reports/${encodeURIComponent(args.bugNo)}/agent-result`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
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
  if (!args.bugNo || !args.conclusion) usage(1);
  const payload = buildPayload(args);
  const output = {
    decision: args.apply ? 'BUG_CI_RESULT_CALLBACK_APPLY' : 'BUG_CI_RESULT_CALLBACK_DRY_RUN',
    bugNo: args.bugNo,
    payload,
    safety: {
      deployed_by_this_script: false,
      pushed_by_this_script: false,
      database_written_by_this_script: false,
      migration_executed_by_this_script: false,
    },
  };
  writeJson(`${RUNS_DIR}/bug-ci-result-callback-latest.json`, output);
  if (!args.apply) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  const response = await postResult(args, payload);
  writeJson(`${RUNS_DIR}/bug-ci-result-callback-response-latest.json`, response);
  console.log(JSON.stringify({ ...output, response_status: 'posted' }, null, 2));
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
