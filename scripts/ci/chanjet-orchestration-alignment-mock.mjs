#!/usr/bin/env node
// Local mock of the protected alignment first-sync API for the orchestration
// contract tests. Sibling process: accepts the reviewed enqueue (including
// the execution name binding), writes the sync-job row into the SAME isolated
// PostgreSQL18 in the shape the REAL scheduler persists (request_scope.execution
// + result_summary with explicit inbound/external-write flags and worker send
// count), and reports COMPLETED status. Contract tests only — the REAL
// scheduler/worker wiring is proven by chanjet-execution-worker.integration.spec.ts.
//
// Usage:
//   node scripts/ci/chanjet-orchestration-alignment-mock.mjs \
//     --pg-url <url> --hits-file <path> --approval-id <id> --auth-token <t> \
//     --floor-sha <40hex> --deadline-at <iso> [--lease-id <lease>] \
//     [--decision-hold] [--scope-mismatch] [--omit-inbound] [--lease-mismatch] [--sends-mismatch]
// Prints "PORT <port>" once listening.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : undefined;
};
const pgUrl = getArg('--pg-url');
const hitsFile = getArg('--hits-file');
const decisionHold = args.includes('--decision-hold');
const scopeMismatch = args.includes('--scope-mismatch');
const omitInbound = args.includes('--omit-inbound');
const leaseMismatch = args.includes('--lease-mismatch');
const sendsMismatch = args.includes('--sends-mismatch');
const expectedApprovalId = getArg('--approval-id') || '';
const authToken = getArg('--auth-token') || '';
const floorSha = getArg('--floor-sha') || 'f'.repeat(40);
const deadlineAt = getArg('--deadline-at') || new Date().toISOString();
const leaseId = getArg('--lease-id') || '';
if (!pgUrl || !hitsFile) { console.error('PG_URL_AND_HITS_FILE_REQUIRED'); process.exit(2); }
fs.writeFileSync(hitsFile, '');

const { DataSource } = require(path.join(process.cwd(), 'apps/api/node_modules/typeorm/index.js'));
const dataSource = new DataSource({ type: 'postgres', url: pgUrl, logging: false });
await dataSource.initialize();

const server = http.createServer(async (req, res) => {
  const url = req.url || '';
  fs.appendFileSync(hitsFile, `${JSON.stringify({ url, at: Date.now() })}\n`);
  if (authToken && (req.headers.authorization || '') !== `Bearer ${authToken}`) {
    res.statusCode = 401;
    res.end(JSON.stringify({ success: false }));
    return;
  }
  if (url.endsWith('/alignment/enqueue') && req.method === 'POST') {
    let body = {};
    for await (const chunk of req) { try { body = JSON.parse(chunk); } catch { /* ignore */ } }
    const runId = `SYNTHETIC_RUN_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    try {
      await dataSource.query(
        `INSERT INTO chanjet_sync_jobs (orchestration_run_id, status, request_scope, result_summary)
         VALUES ($1,'SUCCESS',$2,$3)`,
        [runId, JSON.stringify({
          orchestrationRunId: runId,
          approvalId: scopeMismatch ? 'APPROVAL_OTHER' : (expectedApprovalId || 'APPROVAL_UNSET'),
          bookId: body.bookId,
          period: body.period,
          scope: body.scope,
          // the REAL scheduler persists this binding read back from the
          // admission row; the mock mirrors that persisted shape
          execution: {
            executionId: body.execution?.executionId || 'EXEC_UNSET',
            leaseId: leaseMismatch ? 'LEASE_OTHER' : (body.execution?.leaseId || 'LEASE_UNSET'),
            phase: 'SYNCING',
            approvalId: scopeMismatch ? 'APPROVAL_OTHER' : (expectedApprovalId || 'APPROVAL_UNSET'),
            floorSha,
            deadlineAt,
          },
        }), JSON.stringify({
          state: 'COMPLETED',
          decision: decisionHold ? 'HOLD' : 'EXECUTED',
          ...(omitInbound ? {} : { erpInbound: { enabled: false, applied: false } }),
          externalWriteEnabled: false,
          // the mock topology's "worker" exchange is the caller's counted
          // rehearsal receipt under the SYNCING lease
          executionSends: sendsMismatch ? 2 : 1,
        })],
      );
      res.end(JSON.stringify({ accepted: true, run: { runId } }));
      globalThis.lastRunId = runId;
    } catch (error) {
      res.statusCode = 500;
      res.end(JSON.stringify({ success: false }));
    }
    return;
  }
  if (url.endsWith('/alignment/status')) {
    res.end(JSON.stringify({ run: { runId: globalThis.lastRunId || 'SYNTHETIC_RUN_NONE', state: 'COMPLETED', decision: decisionHold ? 'HOLD' : 'EXECUTED' } }));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ success: false }));
});
await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => {
    console.log(`PORT ${server.address().port}`);
    resolve();
  });
});
setInterval(() => {}, 1e6);
