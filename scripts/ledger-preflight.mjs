#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export function normalizeLegacy(filename) {
  return String(filename ?? '').replace(/\.sql$/, '');
}

function sample(values) {
  return values.slice(0, 10);
}

export function evaluateLedger({ schemaRows, typeormRows, canonicalTsNames, mode = 'pre-migration' }) {
  const failures = [];
  const legacyNames = schemaRows.map((row) => normalizeLegacy(row.filename));
  const duplicateLegacy = [...new Set(legacyNames.filter((name, i) => legacyNames.indexOf(name) !== i))];
  const invalidLegacy = schemaRows.filter((row, i) => !row.filename || !legacyNames[i]);
  const invalidTypeorm = typeormRows.filter((row) => !row.name || row.timestamp == null || !/^\d+$/.test(String(row.timestamp)));
  const legacySet = new Set(legacyNames);
  const typeormByName = new Map();
  for (const row of typeormRows) {
    const list = typeormByName.get(row.name) ?? [];
    list.push(row);
    typeormByName.set(row.name, list);
  }
  const legacyMirrorRows = typeormRows.filter((row) => legacySet.has(row.name));
  const mirrorNames = new Set(legacyMirrorRows.map((row) => row.name));
  const legacyOnly = [...legacySet].filter((name) => !mirrorNames.has(name));
  const mirrorOnly = [...new Set(typeormRows.map((row) => row.name))]
    .filter((name) => !legacySet.has(name) && /^\d+/.test(name) && !canonicalTsNames.includes(name));
  const duplicateTypeormLegacy = [...typeormByName.entries()]
    .filter(([name, rows]) => legacySet.has(name) && rows.length > 1)
    .map(([name]) => name);
  const schemaByName = new Map(schemaRows.map((row) => [normalizeLegacy(row.filename), row]));
  const timestampMismatch = legacyMirrorRows
    .filter((row) => {
      const source = schemaByName.get(row.name);
      if (!source || source.applied_at == null || row.timestamp == null) return true;
      const expected = Math.floor(new Date(source.applied_at).getTime());
      return Number(row.timestamp) !== expected;
    })
    .map((row) => row.name);
  const canonicalSet = new Set(canonicalTsNames);
  const unexpectedTypeorm = typeormRows
    .map((row) => row.name)
    .filter((name) => !legacySet.has(name) && !canonicalSet.has(name));
  const pending = canonicalTsNames.filter((name) => !typeormByName.has(name));
  const unexpectedPending = mode === 'post-migration' ? pending : [];

  if (invalidLegacy.length) failures.push('invalid_legacy_identity');
  if (invalidTypeorm.length) failures.push('invalid_typeorm_row');
  if (duplicateLegacy.length) failures.push('duplicate_legacy');
  if (legacyOnly.length) failures.push('legacy_only');
  if (mirrorOnly.length) failures.push('mirror_only');
  if (duplicateTypeormLegacy.length) failures.push('duplicate_typeorm_legacy');
  if (timestampMismatch.length) failures.push('timestamp_mismatch');
  if (unexpectedTypeorm.length) failures.push('unexpected_typeorm');
  if (unexpectedPending.length) failures.push('unexpected_pending');

  return {
    pass: failures.length === 0,
    failures,
    counts: {
      legacy_total: schemaRows.length,
      typeorm_total: typeormRows.length,
      legacy_mirror_total: legacyMirrorRows.length,
      canonical_ts_total: canonicalTsNames.length,
    },
    diagnostics: {
      legacy_only: sample(legacyOnly),
      mirror_only: sample(mirrorOnly),
      duplicate_legacy: sample(duplicateLegacy),
      duplicate_typeorm_legacy: sample(duplicateTypeormLegacy),
      timestamp_mismatch: sample(timestampMismatch),
      unexpected_typeorm: sample([...new Set(unexpectedTypeorm)]),
      unexpected_pending: sample(unexpectedPending),
      pending_ts: sample(pending),
    },
  };
}

function canonicalNames(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts'))
    .map((entry) => entry.name.slice(0, -3))
    .sort();
}

function runPsql(sql, mode) {
  const statement = `BEGIN; SET TRANSACTION READ ONLY; ${sql}; COMMIT;`;
  const args = ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement];
  let output;
  if (mode === 'prod') {
    output = execFileSync('docker', ['compose', 'exec', '-T', 'db', 'sh', '-c', 'psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], { input: statement, encoding: 'utf8' });
  } else {
    output = execFileSync('psql', args, { encoding: 'utf8' });
  }
  return output.split(/\r?\n/).filter((line) => line && line !== 'BEGIN' && line !== 'COMMIT').join('\n').trim();
}

function tableExists(name, mode) {
  return runPsql(`SELECT to_regclass('public.${name}') IS NOT NULL`, mode) === 't';
}

function readRows(table, mode) {
  const sql = table === 'schema_migrations'
    ? "SELECT COALESCE(json_agg(json_build_object('filename', filename, 'applied_at', applied_at::text)), '[]'::json) FROM schema_migrations"
    : "SELECT COALESCE(json_agg(json_build_object('name', name, 'timestamp', timestamp)), '[]'::json) FROM migrations";
  const value = runPsql(sql, mode);
  return value ? JSON.parse(value) : [];
}

function parseArgs(argv) {
  const args = { mode: 'pre-migration', dbMode: process.env.MIG_MODE ?? 'prod', dir: process.env.MIG_DIR ?? 'apps/api', fixture: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--mode') args.mode = argv[++i];
    else if (arg === '--db-mode') args.dbMode = argv[++i];
    else if (arg === '--dir') args.dir = argv[++i];
    else if (arg === '--fixture') args.fixture = argv[++i];
    else if (arg === '--help') {
      console.log('Usage: ledger-preflight.mjs [--mode pre-migration|post-migration] [--db-mode ci|prod] [--dir apps/api] [--fixture file]');
      process.exit(0);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (!['pre-migration', 'post-migration'].includes(args.mode)) throw new Error(`invalid mode: ${args.mode}`);
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let payload;
  if (args.fixture) payload = JSON.parse(fs.readFileSync(args.fixture, 'utf8'));
  else {
    if (!tableExists('schema_migrations', args.dbMode)) throw new Error('BLOCK: schema_migrations table is missing');
    if (!tableExists('migrations', args.dbMode)) throw new Error('BLOCK: migrations table is missing');
    payload = {
      schemaRows: readRows('schema_migrations', args.dbMode),
      typeormRows: readRows('migrations', args.dbMode),
      canonicalTsNames: canonicalNames(path.resolve(args.dir, 'src/database/migrations')),
    };
  }
  if (!Array.isArray(payload.schemaRows)) throw new Error('BLOCK: schema_migrations fixture/table is unavailable');
  if (!Array.isArray(payload.typeormRows)) throw new Error('BLOCK: migrations fixture/table is unavailable');
  if (!Array.isArray(payload.canonicalTsNames)) throw new Error('BLOCK: canonical TypeORM inventory is unavailable');
  const result = evaluateLedger({ ...payload, mode: args.mode });
  console.log(JSON.stringify({ mode: args.mode, ...result }, null, 2));
  if (!result.pass) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    console.error(`BLOCK: ${error.message}`);
    process.exitCode = 1;
  }
}
