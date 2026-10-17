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
import { requireChanjetBackgroundFixture, createChanjetBackgroundFixture } from './chanjet-background-fixture.mjs';
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
const backgroundProof = requireChanjetBackgroundFixture({ pgUrl, providerBase, approval: JSON.parse(process.env.CHANJET_READONLY_APPROVAL),
  container: process.env.CHANJET_STOP_DB_CONTAINER, owner: process.env.CHANJET_FIXTURE_OWNER });
process.env.CHANJET_PROVIDER_BASE_URL = providerBase.replace(/\/+$/, '');
process.env.CHANJET_ERP_INBOUND_SYNC_ENABLED = 'false';

require(path.join(repoRoot, 'apps/api/node_modules/reflect-metadata'));
const { ChanjetReadonlySyncScheduler } = await import(pathToFileURL(path.join(repoRoot, 'apps/api/dist/modules/chanjet/chanjet-readonly-sync.scheduler.js')).href);
const { ChanjetAuthService } = await import(pathToFileURL(path.join(repoRoot, 'apps/api/dist/modules/chanjet/chanjet-auth.service.js')));
const { CronMonitorService } = await import(pathToFileURL(path.join(repoRoot, 'apps/api/dist/modules/system-monitor/services/cron-monitor.service.js')).href);
const { DataSource } = require(path.join(repoRoot, 'apps/api/node_modules/typeorm'));

const dataSource = new DataSource({ type: 'postgres', url: pgUrl, logging: false });
await dataSource.initialize();
const background = await createChanjetBackgroundFixture(backgroundProof, dataSource);

// the REAL monitor records: sys_cron_heartbeat (production shape) + the
// real CronMonitorService — the scheduler's ok()/fail() reports land in the
// database, not in a stub. The alerts side stays a stub (its own coverage is
// separate); CRITICAL alert records are therefore NOT part of the evidence.
await dataSource.query(`CREATE TABLE IF NOT EXISTS sys_cron_heartbeat (
  job_name varchar(128) PRIMARY KEY, last_run_at timestamptz, last_status varchar(16),
  last_detail text, last_success_at timestamptz, success_count integer DEFAULT 0,
  last_failure_at timestamptz, fail_count integer DEFAULT 0, updated_at timestamptz DEFAULT now())`);
const cronMonitor = new CronMonitorService(dataSource, { createAlert: async () => ({ success: true }) });

const auth = new ChanjetAuthService(
  { get: (key, fallback) => process.env[key] ?? fallback },
  { findOneBy: async () => ({ key: 'singleton', appTicket: 'SYNTHETIC_TICKET', certificate: null, tokens: null }), save: async (e) => e },
  { ok: async () => {}, fail: async () => {} },
  background,
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

const scheduler = new ChanjetReadonlySyncScheduler(integration, cronMonitor, dataSource, {}, background);

const server = http.createServer(async (req, res) => {
  const url = req.url || '';
  if ((req.headers.authorization || '') !== `Bearer ${authToken}`) {
    res.statusCode = 401;
    res.end(JSON.stringify({ success: false }));
    return;
  }
  if (url.endsWith('/alignment/enqueue') && req.method === 'POST') {
    try {
      let body = {};
      for await (const chunk of req) { try { body = JSON.parse(chunk); } catch { /* ignore */ } }
      const result = await scheduler.enqueueManualSync('user:ROOT_OPERATOR', {
        scope: body.scope, bookId: body.bookId, period: body.period, maxAttempts: body.maxAttempts,
        execution: body.execution,
      }, { authPrincipal: 'ROOT_OPERATOR' });
      res.end(JSON.stringify({ success: true, ...result }));
    } catch (error) {
      res.statusCode = 500;
      res.end(JSON.stringify({ success: false, error: String(error?.message || error).slice(0, 300) }));
    }
    return;
  }
  if (url.endsWith('/alignment/status')) {
    try {
      const run = await scheduler.getRunState();
      res.end(JSON.stringify({ success: true, run }));
    } catch (error) {
      res.statusCode = 500;
      res.end(JSON.stringify({ success: false, error: String(error?.message || error).slice(0, 300) }));
    }
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ success: false }));
});
server.listen(Number(getArg('--port') || 0), '127.0.0.1', () => {
  console.log(`PORT ${server.address().port}`);
});
let shutdown;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  if (shutdown) return;
  shutdown = (async () => {
    server.close();
    await background.shutdown();
    await scheduler.onModuleDestroy();
    await dataSource.destroy();
  })();
  void shutdown.then(() => process.exit(0), () => { console.error('CHANJET_FIXTURE_DRAIN=HOLD'); process.exit(4); });
});
