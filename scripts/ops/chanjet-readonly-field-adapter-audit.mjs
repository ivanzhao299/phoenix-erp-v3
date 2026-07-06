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
const token = getArg('--token', process.env.PHOENIX_ADMIN_TOKEN || '');
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

async function loadReadonlyAdapters() {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
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
  return payload.readonlyFieldAdapters;
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

## Summary

- total_adapters: ${report.summary?.totalAdapters ?? 0}
- ready: ${report.summary?.ready ?? 0}
- partial: ${report.summary?.partial ?? 0}
- waiting_sample: ${report.summary?.waitingSample ?? 0}
- hold: ${report.summary?.hold ?? 0}
- voucher_header_rows: ${report.summary?.voucherHeaderRows ?? 0}
- voucher_line_rows: ${report.summary?.voucherLineRows ?? 0}
- counterparty_rows: ${report.summary?.counterpartyRows ?? 0}

## Adapter Status

${table(['adapter', 'status', 'sampleRows', 'missingCriticalFields', 'nextAction'], summaryRows)}

## Guardrails

${report.guardrails?.rule || 'Readonly only. No Chanjet write, no voucher push, no ERP business overwrite.'}
`;
}

async function main() {
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const report = await loadReadonlyAdapters();
  writeFileSync(outputJson, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(outputMd, buildMarkdown(report));
  console.log(`CHANJET_READONLY_FIELD_ADAPTER_AUDIT ${report.decision}`);
  console.log(`json=${outputJson}`);
  console.log(`md=${outputMd}`);
  console.log(`ready=${report.summary?.ready ?? 0}/${report.summary?.totalAdapters ?? 0}`);
}

main().catch((error) => {
  console.error(`CHANJET_READONLY_FIELD_ADAPTER_AUDIT FAILED: ${error.message}`);
  process.exit(1);
});
