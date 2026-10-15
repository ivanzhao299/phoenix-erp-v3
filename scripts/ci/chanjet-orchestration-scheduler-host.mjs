#!/usr/bin/env node
// Real scheduler host for the combined CLI+scheduler integration test: runs
// the REVIEWED ChanjetReadonlySyncScheduler (real lease, real durable job
// rows, real execution-bound worker scope and durable gateway) in its own
// process behind the protected alignment API contract. The ERP-mirror
// internals are stubbed at the integration-service boundary; the worker's
// provider HTTP is the real auth service through the ambient execution
// scope, bounded by the same cumulative cap and DB-owned deadline.
//
// Usage:
//   node scripts/ci/chanjet-orchestration-scheduler-host.mjs \
//     --pg-url <url> --provider-base <http://127.0.0.1:port> --auth-token <t> \
//     --sync-policy READONLY_VERIFY --readonly-approval <json-file>
// Prints "PORT <port>" once listening.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
// repo root resolved from THIS file (cwd-independent): scripts/ci/ -> ../..
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : undefined;
};
const pgUrl = getArg('--pg-url');
const providerBase = getArg('--provider-base');
const authToken = getArg('--auth-token') || '';
const syncPolicy = getArg('--sync-policy') || 'READONLY_VERIFY';
const approvalFile = getArg('--readonly-approval');
if (!pgUrl || !providerBase || !approvalFile) { console.error('PG_URL_PROVIDER_BASE_APPROVAL_REQUIRED'); process.exit(2); }
process.env.CHANJET_SYNC_POLICY = syncPolicy;
process.env.CHANJET_READONLY_APPROVAL = fs.readFileSync(approvalFile, 'utf8');
process.env.CHANJET_PROVIDER_BASE_URL = providerBase.replace(/\/+$/, '');
process.env.CHANJET_ERP_INBOUND_SYNC_ENABLED = 'false';

require(path.join(repoRoot, 'apps/api/node_modules/reflect-metadata'));
const { ChanjetReadonlySyncScheduler } = await import(pathToFileURL(path.join(repoRoot, 'apps/api/dist/modules/chanjet/chanjet-readonly-sync.scheduler.js')).href);
const { ChanjetAuthService } = await import(pathToFileURL(path.join(repoRoot, 'apps/api/dist/modules/chanjet/chanjet-auth.service.js')));
const { DataSource } = require(path.join(repoRoot, 'apps/api/node_modules/typeorm'));

const dataSource = new DataSource({ type: 'postgres', url: pgUrl, logging: false });
await dataSource.initialize();

const auth = new ChanjetAuthService(
  { get: (key, fallback) => process.env[key] ?? fallback },
  { findOneBy: async () => ({ key: 'singleton', appTicket: 'SYNTHETIC_TICKET', certificate: null, tokens: null }), save: async (e) => e },
  { ok: async () => {}, fail: async () => {} },
);
Object.assign(auth, {
  appKey: process.env.CHANJET_APP_KEY || 'SYNTHETIC_KEY',
  appSecret: process.env.CHANJET_APP_SECRET || 'SYNTHETIC_SECRET',
  orgId: process.env.CHANJET_ORG_ID || 'SYNTHETIC_ORG',
  cert: process.env.CHANJET_CERT || 'SYNTHETIC_CERT',
  appTicket: 'SYNTHETIC_TICKET',
});

// the ERP-mirror internals are stubbed at the service boundary; the worker's
// provider exchange runs through the ambient execution scope for real
const integration = {
  runReadonlyAlignmentCycle: async (requestedBy, scope, bookId, period) => {
    await auth.callApi(`/accounting/gl/statistics/receive/${bookId}`, { method: 'GET', query: { period }, kind: 'READ' });
    return {
      decision: 'GO',
      mirror: { results: [{ key: 'RECEIVABLE_STATISTICS', bookId }], attempts: 1, unresolvedFailures: [] },
      exactMappings: null,
      reconciliation: { created: 0, autoResolved: 0 },
      readiness: process.env.CHANJET_SYNC_POLICY === 'READONLY_VERIFY' ? null : { decision: 'GO' },
      stoppedAt: null,
    };
  },
};

const scheduler = new ChanjetReadonlySyncScheduler(integration, { ok: async () => {}, fail: async () => {} }, dataSource, {});

const server = http.createServer(async (req, res) => {
  const url = req.url || '';
  if ((req.headers.authorization || '') !== `Bearer ${authToken}`) {
    res.statusCode = 401;
    res.end(JSON.stringify({ success: false }));
    return;
  }
  if (url.endsWith('/alignment/enqueue') && req.method === 'POST') {
    let body = {};
    for await (const chunk of req) { try { body = JSON.parse(chunk); } catch { /* ignore */ } }
    const result = await scheduler.enqueueManualSync('user:ROOT_OPERATOR', {
      scope: body.scope, bookId: body.bookId, period: body.period, maxAttempts: body.maxAttempts,
      execution: body.execution,
    }, { authPrincipal: 'ROOT_OPERATOR' });
    res.end(JSON.stringify({ success: true, ...result }));
    return;
  }
  if (url.endsWith('/alignment/status')) {
    const run = await scheduler.getRunState();
    res.end(JSON.stringify({ success: true, run }));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ success: false }));
});
server.listen(Number(getArg('--port') || 0), '127.0.0.1', () => {
  console.log(`PORT ${server.address().port}`);
});
setInterval(() => {}, 1e6);
