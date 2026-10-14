#!/usr/bin/env node
// Local mock of the protected alignment first-sync API for the orchestration
// full-chain tests. Sibling process: accepts the reviewed enqueue, writes the
// sync-job row into the SAME isolated PostgreSQL18 (the real alignment flow
// records its durable job there), and reports COMPLETED status.
//
// Usage:
//   node scripts/ci/chanjet-orchestration-alignment-mock.mjs \
//     --pg-url <url> --hits-file <path> [--decision-hold] [--scope-mismatch] \
//     [--approval-id <expected>] [--auth-token <expected>]
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
const expectedApprovalId = getArg('--approval-id') || '';
const authToken = getArg('--auth-token') || '';
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
          approvalId: scopeMismatch ? 'APPROVAL_OTHER' : (expectedApprovalId || body.approvalId || 'APPROVAL_UNSET'),
          bookId: body.bookId,
          period: body.period,
          scope: body.scope,
        }), JSON.stringify({
          state: 'COMPLETED',
          decision: decisionHold ? 'HOLD' : 'EXECUTED',
          erpInbound: { applied: false },
          externalWriteEnabled: false,
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
