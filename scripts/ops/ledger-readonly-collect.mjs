#!/usr/bin/env node
// R4.2d production ledger single-shot read-only collection.
//
// ONE psql session, ONE Repeatable-Read READ ONLY transaction: both ledger
// tables (schema_migrations, migrations) are read from the SAME snapshot, so
// the two inventories evaluated offline describe one consistent database
// state. Scope is exactly two ledger tables plus connection metadata
// (server_version, snapshot id, transaction timestamp) — no business tables,
// no environment variables, no credentials are read or emitted.
//
// Boundaries (defaults, all overridable for isolated verification):
//   lock_timeout      2s   (SET LOCAL — a conflicting lock refuses in 2s)
//   statement_timeout 10s  (SET LOCAL — the server cancels the read in 10s)
//   client timeout    30s  (execFileSync timeout + SIGKILL — the outer bound)
// A server-side timeout terminates the query AND aborts the transaction
// (psql exits non-zero, the connection closes, no locks or transactions
// outlive the command); the client kill bounds any hang beyond that.
//
// Transport (identical to the reviewed production ledger preflight):
//   --db-mode prod  -> `docker compose exec -T db sh -c 'psql …'` on the
//                      deploy host (uses the container's own POSTGRES_USER/
//                      POSTGRES_DB; no credentials are passed or read)
//   --db-mode ci    -> local `psql` with PGHOST/PGPORT/PGUSER/PGPASSWORD/
//                      PGDATABASE from the environment (isolated fixtures)
//
// Output contract: a single JSON document on stdout
//   { schema: 'phoenix.ledger-readonly-collection/v1', db_mode,
//     collected_at, server_version, snapshot, transaction_timestamp,
//     schema_migrations: [...], migrations: [...] }
// Failures print a human `LEDGER_COLLECT_ERROR: <message>` line on stderr
// and exit 1 — a crashed collection never prints a plausible-looking
// document.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizePsqlOutput } from '../ledger-preflight.mjs';

const COLLECTION_SCHEMA = 'phoenix.ledger-readonly-collection/v1';

function parseArgs(argv) {
  const args = {
    dbMode: process.env.MIG_MODE ?? 'prod',
    lockTimeoutMs: 2_000,
    statementTimeoutMs: 10_000,
    clientTimeoutMs: 30_000,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--db-mode') args.dbMode = argv[++i];
    else if (arg === '--lock-timeout-ms') args.lockTimeoutMs = Number(argv[++i]);
    else if (arg === '--statement-timeout-ms') args.statementTimeoutMs = Number(argv[++i]);
    else if (arg === '--client-timeout-ms') args.clientTimeoutMs = Number(argv[++i]);
    else if (arg === '--help') { console.log('Usage: ledger-readonly-collect.mjs [--db-mode ci|prod] [--lock-timeout-ms n] [--statement-timeout-ms n] [--client-timeout-ms n]'); process.exit(0); }
    else throw new Error(`unknown argument: ${arg}`);
  }
  for (const [name, value] of Object.entries(args)) {
    if (name !== 'dbMode' && (!Number.isFinite(value) || value <= 0)) throw new Error(`${name} must be a positive number`);
  }
  if (!['ci', 'prod'].includes(args.dbMode)) throw new Error(`invalid --db-mode: ${args.dbMode}`);
  return args;
}

// the container call is byte-identical to the reviewed preflight's prod
// transport (runPsql): the DB container's own POSTGRES_USER/POSTGRES_DB are
// resolved inside the container — the host never sees credentials.
// stdin stays a pipe (the SQL statement is the input); the client timeout
// SIGKILLs a hung command.
function runPsql(sql, dbMode, clientTimeoutMs) {
  const statement = sql;
  return dbMode === 'prod'
    ? execFileSync('docker', ['compose', 'exec', '-T', 'db', 'sh', '-c', 'psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], { input: statement, encoding: 'utf8', timeout: clientTimeoutMs, killSignal: 'SIGKILL' })
    : execFileSync('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1'], { input: statement, encoding: 'utf8', timeout: clientTimeoutMs, killSignal: 'SIGKILL', env: process.env });
}

// the SINGLE collection statement: one transaction, one snapshot, both
// tables, then metadata. READ ONLY makes any write impossible; REPEATABLE
// READ gives both SELECTs one consistent snapshot.
export function buildCollectionStatement({ lockTimeoutMs, statementTimeoutMs }) {
  return [
    'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;',
    `SET LOCAL lock_timeout='${Math.round(lockTimeoutMs)}ms';`,
    `SET LOCAL statement_timeout='${Math.round(statementTimeoutMs)}ms';`,
    "SELECT COALESCE(json_agg(json_build_object('filename', filename, 'applied_at', applied_at::text)), '[]'::json) FROM schema_migrations;",
    "SELECT COALESCE(json_agg(json_build_object('name', name, 'timestamp', timestamp)), '[]'::json) FROM migrations;",
    "SELECT json_build_object('server_version', current_setting('server_version'), 'snapshot', txid_current_snapshot()::text, 'transaction_timestamp', transaction_timestamp()::text)::text;",
    'COMMIT;',
    '',
  ].join('\n');
}

export function parseCollectionOutput(output) {
  const lines = normalizePsqlOutput(output).split('\n').filter((line) => line.trim());
  if (lines.length !== 3) throw new Error(`expected exactly 3 result rows (schema_migrations, migrations, metadata), got ${lines.length}`);
  const [schemaRow, typeormRow, metaRow] = lines.map((line) => JSON.parse(line));
  if (!Array.isArray(schemaRow)) throw new Error('schema_migrations row is not an array');
  if (!Array.isArray(typeormRow)) throw new Error('migrations row is not an array');
  if (!metaRow || typeof metaRow.server_version !== 'string' || typeof metaRow.snapshot !== 'string' || typeof metaRow.transaction_timestamp !== 'string') throw new Error('metadata row is incomplete');
  return { schemaMigrations: schemaRow, migrations: typeormRow, meta: metaRow };
}

export function collectLedger(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const output = runPsql(buildCollectionStatement(args), args.dbMode, args.clientTimeoutMs);
  const { schemaMigrations, migrations, meta } = parseCollectionOutput(output);
  return {
    schema: COLLECTION_SCHEMA,
    db_mode: args.dbMode,
    collected_at: new Date().toISOString(),
    server_version: meta.server_version,
    snapshot: meta.snapshot,
    transaction_timestamp: meta.transaction_timestamp,
    schema_migrations: schemaMigrations,
    migrations,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(collectLedger(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(`LEDGER_COLLECT_ERROR: ${String(error?.message || error).replace(/\s+/g, ' ').slice(0, 300)}`);
    process.exitCode = 1;
  }
}
