#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const getArg = (name, fallback = '') => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) return args[index + 1];
  return fallback;
};
const hasArg = (name) => args.includes(name);

const ROOT = process.cwd();
const outputDir = getArg('--output-dir', 'docs/ops/runs');
const matrixPath = getArg('--matrix', 'docs/ops/ROLE_BUSINESS_SMOKE_MATRIX.json');
const credentialsPath = getArg('--credentials', '');
const baseUrl = getArg('--base-url', process.env.BASE_URL || 'https://erp.eggslao.com').replace(/\/+$/, '');
const apiUrl = getArg('--api-url', process.env.API_URL || baseUrl).replace(/\/+$/, '');
const timeoutMs = Number(getArg('--timeout-ms', process.env.SMOKE_TIMEOUT_MS || '12000'));
const strict = hasArg('--strict');
const selectedProfile = getArg('--profile', '');

const FAIL_TEXT = [
  /inconsistent types deduced for parameter/i,
  /Unhandled/i,
  /stack_trace/i,
  /SQLSTATE/i,
  /column .* does not exist/i,
];

function check(status, name, detail = {}) {
  return { status, name, ...detail };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(resolve(ROOT, filePath), 'utf8'));
}

function readCredentials() {
  if (credentialsPath) {
    const abs = resolve(ROOT, credentialsPath);
    if (!existsSync(abs)) {
      return { ok: false, reason: `credentials file not found: ${credentialsPath}` };
    }
    return { ok: true, data: JSON.parse(readFileSync(abs, 'utf8')) };
  }
  if (process.env.ROLE_SMOKE_CREDENTIALS_JSON) {
    return { ok: true, data: JSON.parse(process.env.ROLE_SMOKE_CREDENTIALS_JSON) };
  }
  return { ok: false, reason: 'ROLE_SMOKE_CREDENTIALS_JSON or --credentials is not provided' };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'PhoenixERP-RoleBusinessSmoke/1.0',
        Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    return { ok: true, status: response.status, text: text.slice(0, 100000) };
  } catch (error) {
    return { ok: false, status: 0, text: '', error: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

async function login(credential) {
  const result = await fetchWithTimeout(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: credential.username, password: credential.password }),
  });
  if (!result.ok) return { ok: false, check: check('FAIL', `${credential.profile}:auth:login`, { error: result.error || 'request failed' }) };
  let data = null;
  try {
    data = JSON.parse(result.text || '{}');
  } catch {
    return { ok: false, check: check('FAIL', `${credential.profile}:auth:login`, { http_status: result.status, reason: 'non-json response' }) };
  }
  const token = data?.token;
  if (result.status !== 200 || !token) {
    return {
      ok: false,
      check: check('FAIL', `${credential.profile}:auth:login`, {
        http_status: result.status,
        reason: data?.msg || data?.message || 'missing token',
      }),
    };
  }
  return {
    ok: true,
    token,
    userInfo: data?.user_info || {},
    check: check('PASS', `${credential.profile}:auth:login`, {
      http_status: result.status,
      username: credential.username,
      role: data?.user_info?.role || '',
      permissions_count: Array.isArray(data?.user_info?.permissions) ? data.user_info.permissions.length : 0,
    }),
  };
}

function permissionMap(permissions) {
  const map = new Map();
  const list = Array.isArray(permissions) ? permissions : [];
  if (list.includes('*')) map.set('*', new Set(['*']));
  for (const item of list) {
    const [menu, codes = ''] = String(item).split(':');
    if (!menu) continue;
    map.set(menu, new Set(codes.split(',').map((x) => x.trim()).filter(Boolean)));
  }
  return map;
}

function hasMenu(perms, menu) {
  if (perms.has('*')) return true;
  return perms.has(menu);
}

function validateMenus(profile, userInfo) {
  const perms = permissionMap(userInfo?.permissions);
  const checks = [];
  for (const menu of profile.required_menus ?? []) {
    checks.push(check(hasMenu(perms, menu) ? 'PASS' : 'FAIL', `${profile.profile}:menu:required:${menu}`));
  }
  for (const menu of profile.forbidden_menus ?? []) {
    checks.push(check(hasMenu(perms, menu) ? 'FAIL' : 'PASS', `${profile.profile}:menu:forbidden:${menu}`));
  }
  return checks;
}

async function runProbe(profileName, probe, token) {
  const result = await fetchWithTimeout(`${apiUrl}${probe.path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!result.ok) return check('FAIL', `${profileName}:${probe.name}`, { path: probe.path, error: result.error });
  const failText = FAIL_TEXT.find((pattern) => pattern.test(result.text));
  if (result.status >= 500 || failText) {
    return check('FAIL', `${profileName}:${probe.name}`, {
      path: probe.path,
      http_status: result.status,
      reason: failText ? String(failText) : '5xx',
    });
  }
  const allowed = probe.allowed_status ?? [200, 403];
  if (!allowed.includes(result.status)) {
    return check('FAIL', `${profileName}:${probe.name}`, {
      path: probe.path,
      http_status: result.status,
      expected: allowed.join(','),
    });
  }
  return check('PASS', `${profileName}:${probe.name}`, {
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
  return {
    pass: counts.PASS || 0,
    warn: counts.WARN || 0,
    fail: counts.FAIL || 0,
    skip: counts.SKIP || 0,
    decision: decisionOverride || ((counts.FAIL || 0) > 0 ? 'FAIL' : 'GO'),
  };
}

function writeReports(result) {
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = join(outputDir, 'role-business-smoke-latest.json');
  const mdPath = join(outputDir, 'role-business-smoke-latest.md');
  writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
  const lines = [
    '# Role Business Smoke',
    '',
    `Generated at: ${result.generated_at}`,
    `Matrix: ${result.matrix_id}`,
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

const matrix = readJson(matrixPath);
let profiles = matrix.profiles ?? [];
if (selectedProfile) profiles = profiles.filter((profile) => profile.profile === selectedProfile);

const credentials = readCredentials();
let checks = [];
let decisionOverride = '';

if (!profiles.length) {
  checks.push(check('FAIL', 'matrix:profiles', { reason: selectedProfile ? `profile not found: ${selectedProfile}` : 'no profiles configured' }));
  decisionOverride = 'FAIL';
} else if (!credentials.ok) {
  checks.push(check('SKIP', 'credentials', { reason: credentials.reason }));
  for (const profile of profiles) {
    checks.push(check('SKIP', `${profile.profile}:profile`, { reason: 'missing credentials' }));
  }
  decisionOverride = strict ? 'FAIL' : 'SKIP_CREDENTIALS';
} else {
  const credByProfile = new Map((credentials.data?.profiles ?? []).map((item) => [item.profile, item]));
  for (const profile of profiles) {
    const credential = credByProfile.get(profile.profile);
    if (!credential?.username || !credential?.password) {
      checks.push(check(strict ? 'FAIL' : 'SKIP', `${profile.profile}:credentials`, { reason: 'profile credentials missing' }));
      continue;
    }
    const loginResult = await login(credential);
    checks.push(loginResult.check);
    if (!loginResult.ok) continue;
    checks.push(...validateMenus(profile, loginResult.userInfo));
    for (const probe of profile.probes ?? []) {
      checks.push(await runProbe(profile.profile, probe, loginResult.token));
    }
  }
}

const result = {
  generated_at: new Date().toISOString(),
  matrix_id: matrix.matrix_id,
  base_url: baseUrl,
  api_url: apiUrl,
  selected_profile: selectedProfile || null,
  strict,
  summary: summarize(checks, decisionOverride),
  checks,
  writes_executed: false,
  migration_executed: false,
  deploy_executed: false,
  push_executed: false,
};
const paths = writeReports(result);

console.log(`role-business-smoke: ${result.summary.decision}`);
console.log(`pass: ${result.summary.pass}`);
console.log(`warn: ${result.summary.warn}`);
console.log(`fail: ${result.summary.fail}`);
console.log(`skip: ${result.summary.skip}`);
console.log(`json: ${paths.jsonPath}`);
console.log(`md: ${paths.mdPath}`);

if (result.summary.fail > 0) process.exitCode = 1;
