#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const getArg = (name, fallback = '') => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) return args[index + 1];
  return fallback;
};
const hasArg = (name) => args.includes(name);

const outputDir = getArg('--output-dir', 'docs/ops/runs');
const baseUrl = getArg('--base-url', process.env.BASE_URL || 'https://erp.eggslao.com').replace(/\/+$/, '');
const token = getArg('--token', process.env.PHOENIX_SMOKE_TOKEN || process.env.SMOKE_TOKEN || '');
const strict = hasArg('--strict');
const timeoutMs = Number(getArg('--timeout-ms', process.env.SMOKE_TIMEOUT_MS || '12000'));
const generatedAt = new Date().toISOString();

function read(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

function check(status, name, detail = {}) {
  return { status, name, ...detail };
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'PhoenixERP-AlertHumanReachabilitySmoke/1.0',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch {}
    return { ok: true, status: response.status, text, body };
  } catch (error) {
    return { ok: false, status: 0, error: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

function staticChecks() {
  const service = read('apps/api/src/modules/system-monitor/services/sys-alerts.service.ts');
  const controller = read('apps/api/src/modules/system-monitor/controllers/sys-alerts.controller.ts');
  const checks = [];
  const required = [
    ['notify watchers hook', 'notifySystemMonitorWatchers'],
    ['station notification type', 'SYSTEM_ALERT'],
    ['notification table write', 'sys_notifications'],
    ['monitor menu recipient query', 'MENU_SYS_MONITOR'],
    ['view permission recipient filter', "'V' = ANY"],
    ['delivery health service', 'getDeliveryHealth'],
  ];
  for (const [name, signal] of required) {
    checks.push(check(service.includes(signal) ? 'PASS' : 'FAIL', `static:${name}`, { signal }));
  }
  checks.push(check(controller.includes("@Get('delivery-health')") ? 'PASS' : 'FAIL', 'static:delivery health endpoint'));
  checks.push(check(controller.includes("RequireMenu('MENU_SYS_MONITOR', 'V')") ? 'PASS' : 'FAIL', 'static:delivery health RBAC'));
  return checks;
}

async function runtimeCheck() {
  if (!token) {
    return [check(strict ? 'FAIL' : 'WARN', 'runtime:delivery-health', {
      reason: 'missing PHOENIX_SMOKE_TOKEN/SMOKE_TOKEN; static reachability checked only',
    })];
  }
  const result = await fetchWithTimeout(`${baseUrl}/api/system/alerts/delivery-health`);
  if (!result.ok) return [check('FAIL', 'runtime:delivery-health', { error: result.error })];
  if (result.status === 401 || result.status === 403) {
    return [check('FAIL', 'runtime:delivery-health', { http_status: result.status, reason: 'token cannot access delivery health' })];
  }
  if (result.status >= 500) return [check('FAIL', 'runtime:delivery-health', { http_status: result.status, reason: '5xx' })];
  const recipients = Number(result.body?.monitorRecipients ?? 0);
  const mode = String(result.body?.deliveryMode ?? '');
  const failClosed = Boolean(result.body?.failClosed);
  if (recipients <= 0 || !failClosed) {
    return [check('FAIL', 'runtime:delivery-health', {
      http_status: result.status,
      monitor_recipients: recipients,
      delivery_mode: mode,
      fail_closed: failClosed,
      reason: 'no active human recipients with MENU_SYS_MONITOR:V',
    })];
  }
  return [check('PASS', 'runtime:delivery-health', {
    http_status: result.status,
    monitor_recipients: recipients,
    delivery_mode: mode,
    fail_closed: failClosed,
    alert_notifications_last_24h: Number(result.body?.alertNotificationsLast24h ?? 0),
  })];
}

function summarize(checks) {
  const counts = checks.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const fail = counts.FAIL || 0;
  const warn = counts.WARN || 0;
  return {
    pass: counts.PASS || 0,
    warn,
    fail,
    decision: fail ? 'FAIL' : warn ? 'GO_WITH_WARNINGS' : 'GO',
  };
}

function writeReports(result) {
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = join(outputDir, 'alert-human-reachability-latest.json');
  const mdPath = join(outputDir, 'alert-human-reachability-latest.md');
  writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
  const lines = [
    '# Alert Human Reachability Smoke',
    '',
    `Generated at: ${result.generated_at}`,
    `Base URL: ${result.base_url}`,
    `Decision: ${result.summary.decision}`,
    '',
    '## Summary',
    '',
    `- PASS: ${result.summary.pass}`,
    `- WARN: ${result.summary.warn}`,
    `- FAIL: ${result.summary.fail}`,
    '',
    '## Checks',
    '',
    '| status | check | detail |',
    '|---|---|---|',
  ];
  for (const item of result.checks) {
    const detail = Object.entries(item)
      .filter(([key]) => !['status', 'name'].includes(key))
      .map(([key, value]) => `${key}=${String(value)}`)
      .join('; ');
    lines.push(`| ${item.status} | ${item.name} | ${detail || '-'} |`);
  }
  lines.push('', '## Safety', '', '- DB write executed: No.', '- Migration executed: No.', '- Deployment executed: No.', '- Push executed: No.');
  writeFileSync(mdPath, `${lines.join('\n')}\n`);
  return { jsonPath, mdPath };
}

const checks = [
  ...staticChecks(),
  ...await runtimeCheck(),
];
const result = {
  generated_at: generatedAt,
  base_url: baseUrl,
  strict,
  token_provided: Boolean(token),
  summary: summarize(checks),
  checks,
  writes_executed: false,
  migration_executed: false,
  deploy_executed: false,
  push_executed: false,
};
const paths = writeReports(result);

console.log(`alert-human-reachability: ${result.summary.decision}`);
console.log(`pass: ${result.summary.pass}`);
console.log(`warn: ${result.summary.warn}`);
console.log(`fail: ${result.summary.fail}`);
console.log(`json: ${paths.jsonPath}`);
console.log(`md: ${paths.mdPath}`);

if (result.summary.fail > 0) process.exitCode = 1;
