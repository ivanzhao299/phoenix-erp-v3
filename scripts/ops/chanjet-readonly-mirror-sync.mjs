#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

const dryRun = hasArg('--dry-run') || !hasArg('--execute');
const outputDir = getArg('--output-dir', 'docs/ops/runs');
const apiBase = getArg('--api-base', process.env.PHOENIX_API_BASE || process.env.API_BASE || 'http://127.0.0.1:3100').replace(/\/+$/, '');
const token = process.env.PHOENIX_ADMIN_TOKEN || process.env.PHOENIX_AUTH_TOKEN || '';
const scope = getArg('--scope', '').split(',').map((item) => item.trim()).filter(Boolean);
const bookId = getArg('--book-id', '');
const period = getArg('--period', '');
const remoteApiOnly = hasArg('--remote-api-only') || /^https?:\/\/(?!localhost(?::|\/|$)|127\.0\.0\.1(?::|\/|$)|\[?::1\]?(?::|\/|$))/i.test(apiBase);
const includeCoverage = !hasArg('--skip-coverage');

const generatedAt = new Date().toISOString();
const outputJson = join(outputDir, 'chanjet-readonly-mirror-sync-latest.json');
const outputMd = join(outputDir, 'chanjet-readonly-mirror-sync-latest.md');

function loadEnvFiles() {
  const result = {};
  for (const file of ['.env', 'apps/api/.env', '.env.local', 'apps/api/.env.local']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!match) continue;
      if (result[match[1]] === undefined) {
        result[match[1]] = match[2].replace(/^["']|["']$/g, '').replace(/\s+#.*$/, '').trim();
      }
    }
  }
  return result;
}

const fileEnv = loadEnvFiles();
const envValue = (name, fallback = '') => process.env[name] || fileEnv[name] || fallback;

function psqlArgs(sql) {
  return [
    '-v', 'ON_ERROR_STOP=1',
    '-U', envValue('DB_USER', 'mac'),
    '-d', envValue('DB_NAME', 'phoenix_erp'),
    '-h', envValue('DB_HOST', '127.0.0.1'),
    '-p', envValue('DB_PORT', '5432'),
    '-Atc',
    sql,
  ];
}

function runPsql(sql) {
  const env = { ...process.env };
  const password = envValue('DB_PASSWORD', '');
  if (password) env.PGPASSWORD = password;
  const cmd = spawnSync('psql', psqlArgs(sql), {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
  });
  return {
    ok: cmd.status === 0,
    status: cmd.status,
    stdout: (cmd.stdout || '').trim(),
    stderr: (cmd.stderr || '').trim(),
  };
}

async function fetchJson(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { rawText: text.slice(0, 500) };
    }
    return { ok: response.ok, status: response.status, json };
  } finally {
    clearTimeout(timer);
  }
}

function maskPlan(plan) {
  return {
    ...plan,
    tokenPresent: Boolean(token),
    chanjetEnv: Object.fromEntries(
      ['CHANJET_APP_KEY', 'CHANJET_APP_SECRET', 'CHANJET_CERT', 'CHANJET_ACCESS_TOKEN', 'CHANJET_ORG_ID', 'CHANJET_ORG_IDS', 'CHANJET_MSG_SECRET']
        .map((key) => [key, Boolean(envValue(key, ''))]),
    ),
    db: {
      host: envValue('DB_HOST', '127.0.0.1'),
      port: envValue('DB_PORT', '5432'),
      user: envValue('DB_USER', 'mac'),
      name: envValue('DB_NAME', 'phoenix_erp'),
      passwordPresent: Boolean(envValue('DB_PASSWORD', '')),
    },
  };
}

function writeReports(result) {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputJson, JSON.stringify(result, null, 2));
  const lines = [
    '# Chanjet Readonly Mirror Sync Gate',
    '',
    `Generated at: ${generatedAt}`,
    `Decision: ${result.decision}`,
    '',
    '## Scope',
    '',
    `- API base: ${apiBase}`,
    `- Dry run: ${dryRun ? 'yes' : 'no'}`,
    `- Requested scope: ${result.plan.requestedScope.length ? result.plan.requestedScope.join(', ') : 'default mirror scope'}`,
    `- Book ID: ${result.plan.bookId || 'enabled books'}`,
    `- Period: ${result.plan.period || 'endpoint/default current period'}`,
    '',
    '## Preconditions',
    '',
    `- Remote API only: ${result.plan.remoteApiOnly ? 'yes' : 'no'}`,
    `- DB reachable: ${result.prechecks.dbReachable.status}`,
    `- Mirror tables present: ${result.prechecks.mirrorTables.status}`,
    `- API health: ${result.prechecks.apiHealth.status}`,
    `- Auth token present: ${result.prechecks.authToken.status}`,
    `- Chanjet env present: ${result.prechecks.chanjetEnv.status}`,
    `- Finance coverage endpoint: ${result.prechecks.financeCoverage.status}`,
    '',
    '## Execution',
    '',
    `- Mirror sync executed: ${result.execution.executed ? 'yes' : 'no'}`,
    `- Write Chanjet: no`,
    `- Delete Chanjet data: no`,
    `- Modify Chanjet data: no`,
    `- Voucher push: no`,
    `- ERP middle-layer write: ${result.execution.executed ? 'yes' : 'no'}`,
    '',
    '## Blocking Reasons',
    '',
    ...(result.blockers.length ? result.blockers.map((item) => `- ${item}`) : ['- none']),
    '',
    '## Result Summary',
    '',
    '```json',
    JSON.stringify(result.execution.summary, null, 2),
    '```',
    '',
    '## Finance Coverage',
    '',
    '```json',
    JSON.stringify(result.coverage?.summary || {}, null, 2),
    '```',
    '',
  ];
  writeFileSync(outputMd, lines.join('\n'));
}

async function main() {
  const plan = maskPlan({
    requestedScope: scope,
    bookId,
    period,
    apiBase,
    remoteApiOnly,
  });

  const dbIdentity = remoteApiOnly
    ? { ok: true, status: 0, stdout: 'remote-api-only', stderr: '' }
    : runPsql('select current_database() || \'|\' || current_user;');
  const tableCheck = remoteApiOnly
    ? { ok: true, status: 0, stdout: 'remote-api-protected-endpoint', stderr: '' }
    : runPsql(`
      select concat_ws('|',
        coalesce(to_regclass('public.chanjet_read_snapshots')::text, ''),
        coalesce(to_regclass('public.chanjet_entity_snapshots')::text, ''),
        coalesce(to_regclass('public.chanjet_erp_field_mapping')::text, '')
      );
    `);

  const tables = tableCheck.ok ? tableCheck.stdout.split('|').filter(Boolean) : [];
  const mirrorTablesReady = remoteApiOnly || tables.includes('chanjet_read_snapshots')
    && tables.includes('chanjet_entity_snapshots')
    && tables.includes('chanjet_erp_field_mapping');

  let apiHealth = { ok: false, status: 0, json: null };
  try {
    apiHealth = await fetchJson('/api/health');
  } catch (error) {
    apiHealth = { ok: false, status: 0, json: { error: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error) } };
  }

  const chanjetEnvRequired = ['CHANJET_APP_KEY', 'CHANJET_APP_SECRET'];
  const chanjetEnvOk = chanjetEnvRequired.every((key) => Boolean(envValue(key, '')))
    || remoteApiOnly && Boolean(token);

  let financeCoverage = { ok: false, status: 0, json: null };
  if (includeCoverage && token) {
    try {
      financeCoverage = await fetchJson('/api/chanjet/integration/finance-coverage');
    } catch (error) {
      financeCoverage = { ok: false, status: 0, json: { error: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error) } };
    }
  }

  const blockers = [];
  if (!dbIdentity.ok) blockers.push(`DB precheck failed: ${dbIdentity.stderr || dbIdentity.stdout || 'unknown error'}`);
  if (!mirrorTablesReady) blockers.push('ERP middle-layer mirror tables are missing; run reviewed migration 1782742000000-CreateChanjetReadonlyMirror first.');
  if (!apiHealth.ok) blockers.push(`API health is not OK at ${apiBase}/api/health (status=${apiHealth.status}).`);
  if (!token) blockers.push('No PHOENIX_ADMIN_TOKEN / PHOENIX_AUTH_TOKEN provided for protected mirror API.');
  if (!chanjetEnvOk) blockers.push('Chanjet configuration/token chain is not visible to this runner.');
  if (includeCoverage && token && !financeCoverage.ok) {
    blockers.push(`Finance coverage endpoint is not accessible (status=${financeCoverage.status}).`);
  }

  const result = {
    generatedAt,
    decision: blockers.length ? 'HOLD' : dryRun ? 'PLAN_READY' : 'GO_WITH_CONDITIONS',
    plan,
    prechecks: {
      dbReachable: {
        status: dbIdentity.ok ? 'PASS' : 'FAIL',
        identity: dbIdentity.ok ? dbIdentity.stdout : '',
      },
      mirrorTables: {
        status: mirrorTablesReady ? 'PASS' : 'HOLD',
        presentTables: tables,
        checkedBy: remoteApiOnly ? 'remote protected API' : 'local psql',
      },
      apiHealth: {
        status: apiHealth.ok ? 'PASS' : 'HOLD',
        httpStatus: apiHealth.status,
      },
      authToken: {
        status: token ? 'PASS' : 'HOLD',
      },
      chanjetEnv: {
        status: chanjetEnvOk ? 'PASS' : 'HOLD',
        envPresence: plan.chanjetEnv,
      },
      financeCoverage: {
        status: !includeCoverage ? 'SKIP' : financeCoverage.ok ? 'PASS' : token ? 'HOLD' : 'SKIP',
        httpStatus: financeCoverage.status,
      },
    },
    blockers,
    coverage: financeCoverage.json?.coverage || null,
    execution: {
      executed: false,
      summary: dryRun ? { dryRun: true, message: 'dry-run only; no mirror sync executed' } : {},
    },
    boundaries: {
      writeChanjet: false,
      deleteChanjet: false,
      modifyChanjet: false,
      voucherPush: false,
      deploy: false,
      push: false,
    },
    outputs: { outputJson, outputMd },
  };

  if (!dryRun && blockers.length === 0) {
    const body = {
      ...(scope.length ? { scope } : {}),
      ...(bookId ? { bookId } : {}),
      ...(period ? { period } : {}),
    };
    const sync = await fetchJson('/api/chanjet/integration/mirror/sync', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    result.execution.executed = sync.ok;
    result.execution.summary = { httpStatus: sync.status, response: sync.json };
    result.decision = sync.ok && sync.json?.success !== false ? 'GO_WITH_CONDITIONS' : 'HOLD';
    if (!sync.ok || sync.json?.success === false) {
      result.blockers.push(`mirror sync API failed: status=${sync.status} error=${sync.json?.error || 'unknown'}`);
    }
    if (includeCoverage) {
      try {
        const afterCoverage = await fetchJson('/api/chanjet/integration/finance-coverage');
        result.prechecks.financeCoverage = {
          status: afterCoverage.ok ? 'PASS' : 'HOLD',
          httpStatus: afterCoverage.status,
        };
        result.coverage = afterCoverage.json?.coverage || result.coverage;
      } catch (error) {
        result.prechecks.financeCoverage = {
          status: 'HOLD',
          httpStatus: 0,
          error: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error),
        };
      }
    }
  }

  writeReports(result);
  console.log(JSON.stringify({
    decision: result.decision,
    blockers: result.blockers,
    executed: result.execution.executed,
    outputJson,
    outputMd,
  }, null, 2));

  if (result.decision === 'HOLD') process.exitCode = 2;
}

main().catch((error) => {
  mkdirSync(outputDir, { recursive: true });
  const result = {
    generatedAt,
    decision: 'FAIL',
    error: error?.stack || String(error),
    boundaries: {
      writeChanjet: false,
      deleteChanjet: false,
      modifyChanjet: false,
      voucherPush: false,
      deploy: false,
      push: false,
    },
  };
  writeFileSync(outputJson, JSON.stringify(result, null, 2));
  writeFileSync(outputMd, `# Chanjet Readonly Mirror Sync Gate\n\nDecision: FAIL\n\n\`\`\`\n${result.error}\n\`\`\`\n`);
  console.error(result.error);
  process.exit(1);
});
