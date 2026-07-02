#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
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
const apiUrl = getArg('--api-url', process.env.API_URL || baseUrl).replace(/\/+$/, '');
const username = getArg('--username', process.env.SMOKE_USER || process.env.PHOENIX_SMOKE_USER || '');
const password = getArg('--password', process.env.SMOKE_PASS || process.env.PHOENIX_SMOKE_PASS || '');
const profileName = getArg('--profile', process.env.SMOKE_PROFILE || 'generic-authenticated-user');
const timeoutMs = Number(getArg('--timeout-ms', process.env.SMOKE_TIMEOUT_MS || '12000'));
const strict = hasArg('--strict');

const generatedAt = new Date().toISOString();
const FAIL_TEXT = [
  /inconsistent types deduced for parameter/i,
  /Unhandled/i,
  /stack_trace/i,
  /SQLSTATE/i,
  /column .* does not exist/i,
];

const READ_PROBES = [
  { name: 'auth:me', path: '/api/auth/me', expect: [200], required: true },
  { name: 'workflow:my-tasks', path: '/api/workflow/my-tasks', expect: [200, 403] },
  { name: 'system:alerts', path: '/api/system/alerts?limit=1', expect: [200, 403] },
  { name: 'system:health', path: '/api/system/monitor/health', expect: [200, 403] },
  { name: 'uat:readiness', path: '/api/uat/readiness', expect: [200, 403] },
  { name: 'iot:all-summary', path: '/api/v3/iot/devices/all-summary', expect: [200, 403] },
  { name: 'procurement:payments', path: '/api/v2/procurement/payments?limit=1', expect: [200, 403] },
  { name: 'procurement:orders', path: '/api/v2/procurement/orders?limit=1', expect: [200, 403] },
  { name: 'finance:dashboard', path: '/api/v2/finance/dashboard', expect: [200, 403] },
  { name: 'finance:shareholder-summary', path: '/api/v2/finance/shareholder/contributions/summary', expect: [200, 403, 404] },
  { name: 'store-payment:accounts', path: '/api/store-payment/accounts', expect: [200, 403, 404] },
  { name: 'store-payment:records', path: '/api/store-payment/records', expect: [200, 403, 404] },
];

function check(status, name, detail = {}) {
  return { status, name, ...detail };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'PhoenixERP-AuthenticatedBusinessSmoke/1.0',
        Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    return { ok: true, status: response.status, text: text.slice(0, 80000) };
  } catch (error) {
    return { ok: false, status: 0, text: '', error: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

async function login() {
  const result = await fetchWithTimeout(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!result.ok) return { ok: false, check: check('FAIL', 'auth:login', { error: result.error || 'request failed' }) };
  let data = null;
  try {
    data = JSON.parse(result.text || '{}');
  } catch {
    return { ok: false, check: check('FAIL', 'auth:login', { http_status: result.status, reason: 'non-json response' }) };
  }
  const token = data?.token;
  if (result.status !== 200 || !token) {
    return {
      ok: false,
      check: check('FAIL', 'auth:login', {
        http_status: result.status,
        reason: data?.msg || data?.message || 'missing token',
      }),
    };
  }
  return {
    ok: true,
    token,
    user: data?.user_info || null,
    check: check('PASS', 'auth:login', {
      http_status: result.status,
      username,
      role: data?.user_info?.role || '',
      permissions_count: Array.isArray(data?.user_info?.permissions) ? data.user_info.permissions.length : 0,
    }),
  };
}

async function runProbe(probe, token) {
  const url = `${apiUrl}${probe.path}`;
  const result = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!result.ok) return check(strict || probe.required ? 'FAIL' : 'WARN', probe.name, { path: probe.path, error: result.error });
  const failText = FAIL_TEXT.find((pattern) => pattern.test(result.text));
  if (result.status >= 500 || failText) {
    return check('FAIL', probe.name, {
      path: probe.path,
      http_status: result.status,
      reason: failText ? String(failText) : '5xx',
    });
  }
  if (!probe.expect.includes(result.status)) {
    return check(probe.required ? 'FAIL' : 'WARN', probe.name, {
      path: probe.path,
      http_status: result.status,
      expected: probe.expect.join(','),
    });
  }
  return check(result.status === 403 ? 'PASS' : 'PASS', probe.name, {
    path: probe.path,
    http_status: result.status,
    access: result.status === 403 ? 'fail-closed' : 'read-ok',
  });
}

function summarize(checks, decisionOverride = '') {
  const counts = checks.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const fail = counts.FAIL || 0;
  const warn = counts.WARN || 0;
  const skip = counts.SKIP || 0;
  return {
    pass: counts.PASS || 0,
    warn,
    fail,
    skip,
    decision: decisionOverride || (fail ? 'FAIL' : warn ? 'GO_WITH_WARNINGS' : 'GO'),
  };
}

function writeReports(result) {
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = join(outputDir, 'authenticated-business-smoke-latest.json');
  const mdPath = join(outputDir, 'authenticated-business-smoke-latest.md');
  writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
  const lines = [
    '# Authenticated Business Smoke',
    '',
    `Generated at: ${result.generated_at}`,
    `Profile: ${result.profile}`,
    `Base URL: ${result.base_url}`,
    `API URL: ${result.api_url}`,
    `Decision: ${result.summary.decision}`,
    '',
    '## Summary',
    '',
    `- PASS: ${result.summary.pass}`,
    `- WARN: ${result.summary.warn}`,
    `- FAIL: ${result.summary.fail}`,
    `- SKIP: ${result.summary.skip}`,
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

let checks = [];
let decisionOverride = '';
let user = null;

if (!username || !password) {
  checks = [
    check('SKIP', 'credentials', {
      reason: 'SMOKE_USER/SMOKE_PASS or PHOENIX_SMOKE_USER/PHOENIX_SMOKE_PASS not provided',
    }),
  ];
  decisionOverride = strict ? 'FAIL' : 'SKIP_CREDENTIALS';
} else {
  const loginResult = await login();
  checks.push(loginResult.check);
  if (!loginResult.ok) {
    decisionOverride = 'FAIL';
  } else {
    user = loginResult.user;
    for (const probe of READ_PROBES) {
      checks.push(await runProbe(probe, loginResult.token));
    }
  }
}

const result = {
  generated_at: generatedAt,
  profile: profileName,
  base_url: baseUrl,
  api_url: apiUrl,
  username: username ? username : null,
  user_role: user?.role || null,
  strict,
  summary: summarize(checks, decisionOverride),
  checks,
  writes_executed: false,
  migration_executed: false,
  deploy_executed: false,
  push_executed: false,
};
const paths = writeReports(result);

console.log(`authenticated-business-smoke: ${result.summary.decision}`);
console.log(`pass: ${result.summary.pass}`);
console.log(`warn: ${result.summary.warn}`);
console.log(`fail: ${result.summary.fail}`);
console.log(`skip: ${result.summary.skip}`);
console.log(`json: ${paths.jsonPath}`);
console.log(`md: ${paths.mdPath}`);

if (result.summary.fail > 0) process.exitCode = 1;
