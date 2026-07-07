#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const getArg = (name, fallback = '') => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) return args[index + 1];
  return fallback;
};

const apiBase = getArg('--api-base', process.env.PHOENIX_API_BASE_URL || 'http://127.0.0.1:3100/api');
const explicitToken = getArg('--token', process.env.PHOENIX_ADMIN_TOKEN || process.env.PHOENIX_AUTH_TOKEN || '');
const loginUserEnv = getArg('--login-user-env', 'PHOENIX_ERP_RUNNER_USER');
const loginPasswordEnv = getArg('--login-password-env', 'PHOENIX_ERP_RUNNER_PASS');
const outputDir = getArg('--output-dir', 'docs/ops/runs');
const outputJson = join(outputDir, 'chanjet-readonly-field-adapter-audit-latest.json');
const outputMd = join(outputDir, 'chanjet-readonly-field-adapter-audit-latest.md');
const endpoint = `${apiBase.replace(/\/$/, '')}/chanjet/integration/readonly-field-adapters`;

function table(headers, rows) {
  if (!rows.length) return '_none_';
  return [
    `|${headers.join('|')}|`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((row) => `|${headers.map((header) => String(row[header] ?? '').replace(/\|/g, '\\|')).join('|')}|`),
  ].join('\n');
}

function failureReport(error) {
  return {
    decision: 'HOLD',
    generatedAt: new Date().toISOString(),
    sourceEndpoint: endpoint,
    summary: {
      totalAdapters: 0,
      ready: 0,
      partial: 0,
      waitingSample: 0,
      hold: 1,
      voucherHeaderRows: 0,
      voucherLineRows: 0,
      counterpartyRows: 0,
      fieldCoverage: 0,
    },
    adapters: [],
    blockers: [
      {
        code: 'CHANJET_READONLY_ADAPTER_AUDIT_UNAVAILABLE',
        message: error.message,
      },
    ],
    guardrails: {
      rule: 'Readonly audit failed closed. No Chanjet write, no voucher push, no ERP business overwrite.',
      chanjetWrite: false,
      voucherPush: false,
      erpBusinessWrite: false,
    },
    nextActions: [
      'Provide PHOENIX_ADMIN_TOKEN / PHOENIX_AUTH_TOKEN, or PHOENIX_ERP_RUNNER_USER + PHOENIX_ERP_RUNNER_PASS for readonly audit.',
      'Re-run this audit against the production API before wiring ordinary finance pages.',
    ],
  };
}

async function loginToken() {
  if (explicitToken) return { token: explicitToken, source: 'token' };
  const username = process.env[loginUserEnv];
  const password = process.env[loginPasswordEnv];
  if (!username || !password) return { token: '', source: 'none' };

  const response = await fetch(`${apiBase.replace(/\/$/, '')}/auth/login`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Login returned non-JSON response: ${text.slice(0, 300)}`);
  }
  if (!response.ok) {
    throw new Error(`Login failed HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`);
  }
  const token = payload?.token || payload?.accessToken || payload?.access_token;
  if (!token) throw new Error('Login response did not include token/accessToken.');
  return { token, source: `${loginUserEnv}/${loginPasswordEnv}` };
}

async function loadReadonlyAdapters() {
  const auth = await loginToken();
  const headers = { Accept: 'application/json' };
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  const response = await fetch(endpoint, { headers });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${endpoint}: ${text.slice(0, 300)}`);
  }
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || `HTTP ${response.status} from ${endpoint}`);
  }
  return {
    ...payload.readonlyFieldAdapters,
    auditContext: {
      ...(payload.readonlyFieldAdapters?.auditContext || {}),
      authSource: auth.source,
      apiBase,
    },
  };
}

function buildMarkdown(report) {
  const adapters = report.adapters || [];
  const summaryRows = adapters.map((adapter) => ({
    adapter: adapter.adapterKey,
    status: adapter.status,
    sampleRows: adapter.sampleRows,
    missingCriticalFields: (adapter.missingCriticalFields || []).join(', ') || 'none',
    nextAction: adapter.nextAction,
  }));
  return `# Chanjet Readonly Field Adapter Audit

- generated_at: ${new Date().toISOString()}
- source_endpoint: ${endpoint}
- decision: ${report.decision}
- next_gate: ${report.summary?.nextGate || '—'}
- chanjet_write: false
- voucher_push: false
- auth_source: ${report.auditContext?.authSource || 'none'}

## Summary

- total_adapters: ${report.summary?.totalAdapters ?? 0}
- ready: ${report.summary?.ready ?? 0}
- partial: ${report.summary?.partial ?? 0}
- waiting_sample: ${report.summary?.waitingSample ?? 0}
- hold: ${report.summary?.hold ?? 0}
- voucher_header_rows: ${report.summary?.voucherHeaderRows ?? 0}
- voucher_line_rows: ${report.summary?.voucherLineRows ?? 0}
- counterparty_rows: ${report.summary?.counterpartyRows ?? 0}
- field_coverage: ${Math.round((report.summary?.fieldCoverage ?? 0) * 1000) / 10}%

## Adapter Status

${table(['adapter', 'status', 'sampleRows', 'missingCriticalFields', 'nextAction'], summaryRows)}

## Blockers

${table(['code', 'message'], (report.blockers || []).map((blocker) => ({
  code: blocker.code || 'BLOCKER',
  message: blocker.message || blocker,
})))}

## Guardrails

${report.guardrails?.rule || 'Readonly only. No Chanjet write, no voucher push, no ERP business overwrite.'}
`;
}

async function main() {
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  let report;
  try {
    report = await loadReadonlyAdapters();
  } catch (error) {
    report = failureReport(error);
  }
  writeFileSync(outputJson, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(outputMd, buildMarkdown(report));
  console.log(`CHANJET_READONLY_FIELD_ADAPTER_AUDIT ${report.decision}`);
  console.log(`json=${outputJson}`);
  console.log(`md=${outputMd}`);
  console.log(`ready=${report.summary?.ready ?? 0}/${report.summary?.totalAdapters ?? 0}`);
  if (report.decision === 'HOLD' || report.decision === 'FAIL') process.exitCode = 2;
}

main().catch((error) => {
  console.error(`CHANJET_READONLY_FIELD_ADAPTER_AUDIT FAILED: ${error.message}`);
  process.exit(1);
});
