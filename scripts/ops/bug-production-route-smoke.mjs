#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const RUNS_DIR = 'docs/ops/runs';

function usage(code = 1) {
  console.log(`Usage:
  node scripts/ops/bug-production-route-smoke.mjs \\
    --base-url https://erp.eggslao.com \\
    --routes /dashboard,/bug-reports \\
    [--token-env PHOENIX_ERP_RUNNER_TOKEN]

This is a read-only post-deploy smoke. It does not deploy, push, write DB, or run migrations.`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { routes: '/dashboard,/bug-reports' };
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === '--help' || arg === '-h') usage(0);
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

async function probe(baseUrl, route, token) {
  const url = `${baseUrl.replace(/\/$/, '')}${route.startsWith('/') ? route : `/${route}`}`;
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const text = await res.text().catch(() => '');
    return {
      route,
      url,
      status: res.status,
      ok: res.status >= 200 && res.status < 400,
      elapsedMs: Date.now() - startedAt,
      excerpt: text.slice(0, 300),
    };
  } catch (error) {
    return {
      route,
      url,
      status: 0,
      ok: false,
      elapsedMs: Date.now() - startedAt,
      error: error.message,
    };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.baseUrl) usage(1);
  const token = args.token || (args.tokenEnv ? process.env[args.tokenEnv] : '');
  const routes = String(args.routes || '').split(',').map((item) => item.trim()).filter(Boolean);
  const results = [];
  for (const route of routes) results.push(await probe(args.baseUrl, route, token));
  const summary = {
    decision: results.every((item) => item.ok) ? 'PRODUCTION_ROUTE_SMOKE_PASS' : 'PRODUCTION_ROUTE_SMOKE_HOLD',
    generated_at: new Date().toISOString(),
    base_url: args.baseUrl,
    routes,
    results,
    safety: {
      readonly: true,
      deployed: false,
      pushed: false,
      database_written: false,
      migration_executed: false,
    },
  };
  writeJson(`${RUNS_DIR}/bug-production-route-smoke-latest.json`, summary);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.decision !== 'PRODUCTION_ROUTE_SMOKE_PASS') process.exit(2);
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
