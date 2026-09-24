#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

export function normalizeLegacy(filename) { return String(filename ?? '').replace(/\.sql$/, ''); }
export function normalizePsqlOutput(output) {
  return String(output ?? '')
    .split(/\r?\n/)
    .filter((line) => {
      const token = line.trim();
      return token && token !== 'BEGIN' && token !== 'SET' && token !== 'COMMIT';
    })
    .join('\n')
    .trim();
}
function sample(values) { return values.slice(0, 20); }
function validTimestamp(value) { return /^\d{13}$/.test(String(value ?? '')); }

function normalizeCanonical(entries = [], legacyNames = []) {
  if (entries.length) return entries.map((entry) => ({ effective_name: entry.effective_name ?? entry.name, timestamp: String(entry.timestamp) }));
  return legacyNames.map((name) => ({ effective_name: String(name), timestamp: String(name).match(/(\d{13})$/)?.[1] ?? '' }));
}

export function validateRetiredRegistry(source) {
  if (!Array.isArray(source)) throw new Error('retired registry must be an array');
  const names = new Set(); const timestamps = new Set();
  for (const entry of source) {
    if (!entry?.name || !validTimestamp(entry.timestamp) || !/^[0-9a-f]{40}$/i.test(entry.removal_commit) || entry.classification !== 'KNOWN_RETIRED_APPLIED') throw new Error(`invalid retired registry entry: ${JSON.stringify(entry)}`);
    if (names.has(entry.name) || timestamps.has(String(entry.timestamp))) throw new Error('duplicate retired registry identity');
    names.add(entry.name); timestamps.add(String(entry.timestamp));
  }
  return source.map((entry) => ({ ...entry, timestamp: String(entry.timestamp) }));
}

export function evaluateLedger({ schemaRows = [], typeormRows = [], canonicalLegacy = [], canonicalTypeorm = [], retiredTypeorm = [], canonicalTsNames = [], mode = 'pre-migration' }) {
  const failures = []; const canonical = normalizeCanonical(canonicalTypeorm, canonicalTsNames);
  const canonicalByName = new Map(canonical.map((entry) => [entry.effective_name, entry]));
  const legacyCanonical = canonicalLegacy.length ? canonicalLegacy : schemaRows.map((row) => row.filename).filter(Boolean);
  const legacySet = new Set(legacyCanonical); const retired = new Map(retiredTypeorm.map((entry) => [entry.name, { ...entry, timestamp: String(entry.timestamp) }]));
  const byName = new Map(); const byTimestamp = new Map();
  for (const row of typeormRows) { const names = byName.get(row.name) ?? []; names.push(row); byName.set(row.name, names); const timestamps = byTimestamp.get(String(row.timestamp)) ?? []; timestamps.push(row); byTimestamp.set(String(row.timestamp), timestamps); }
  const duplicateTypeormName = [...byName.entries()].filter(([, rows]) => rows.length > 1).map(([name]) => name);
  const duplicateTypeormTimestamp = [...byTimestamp.entries()].filter(([, rows]) => rows.length > 1).map(([timestamp]) => timestamp);
  const invalidTypeorm = typeormRows.filter((row) => !row.name || !validTimestamp(row.timestamp));
  const schemaByName = new Map(schemaRows.map((row) => [normalizeLegacy(row.filename), row]));
  const canonicalApplied = []; const canonicalPending = []; const knownRetiredApplied = []; const unknownTypeormApplied = []; const retiredTimestampMismatch = []; const canonicalTimestampMismatch = []; const bridgePresent = []; const bridgeTimestampMismatch = [];
  for (const entry of canonical) { const rows = byName.get(entry.effective_name) ?? []; if (!rows.length) canonicalPending.push(entry.effective_name); else if (rows.some((row) => String(row.timestamp) !== String(entry.timestamp))) canonicalTimestampMismatch.push(entry.effective_name); else canonicalApplied.push(entry.effective_name); }
  for (const row of typeormRows) {
    if (canonicalByName.has(row.name)) continue;
    const retiredEntry = retired.get(row.name);
    if (retiredEntry) { if (String(row.timestamp) === String(retiredEntry.timestamp)) knownRetiredApplied.push(row.name); else retiredTimestampMismatch.push(row.name); continue; }
    const legacySource = schemaByName.get(row.name);
    if (legacySource) { bridgePresent.push(row.name); const expected = legacySource.applied_at == null ? null : String(new Date(legacySource.applied_at).getTime()); if (expected === null || expected !== String(row.timestamp)) bridgeTimestampMismatch.push(row.name); continue; }
    unknownTypeormApplied.push(row);
  }
  const legacyApplied = schemaRows.map((row) => row.filename).filter(Boolean); const legacyMissing = legacyCanonical.filter((filename) => !legacyApplied.includes(filename)); const legacyUnexpected = legacyApplied.filter((filename) => !legacySet.has(filename));
  const bridgeMissing = legacyCanonical.filter((filename) => !bridgePresent.includes(normalizeLegacy(filename))); const bridgeExtra = bridgePresent.filter((name) => !new Set(legacyCanonical.map(normalizeLegacy)).has(name));
  if (invalidTypeorm.length) failures.push('invalid_typeorm_row'); if (duplicateTypeormName.length) failures.push('duplicate_typeorm_name'); if (duplicateTypeormTimestamp.length) failures.push('duplicate_typeorm_timestamp'); if (canonicalTimestampMismatch.length) failures.push('canonical_timestamp_mismatch'); if (retiredTimestampMismatch.length) failures.push('retired_timestamp_mismatch'); if (unknownTypeormApplied.length) failures.push('unknown_typeorm_applied'); if (legacyMissing.length) failures.push('legacy_missing'); if (legacyUnexpected.length) failures.push('legacy_unexpected'); if (mode === 'post-migration' && canonicalPending.length) failures.push('canonical_pending');
  return { pass: failures.length === 0, failures, counts: { legacy_total: legacyCanonical.length, legacy_applied_total: legacyApplied.length, canonical_typeorm_total: canonical.length, canonical_typeorm_applied: canonicalApplied.length, canonical_typeorm_pending: canonicalPending.length, known_retired_applied: knownRetiredApplied.length, unknown_typeorm_applied: unknownTypeormApplied.length, bridge_total: legacyCanonical.length, bridge_present: bridgePresent.length, bridge_missing: bridgeMissing.length }, diagnostics: { legacy_missing: sample(legacyMissing), legacy_unexpected: sample(legacyUnexpected), canonical_typeorm_applied: sample(canonicalApplied), canonical_typeorm_pending: sample(canonicalPending), known_retired_applied: sample(knownRetiredApplied), retired_timestamp_mismatch: sample(retiredTimestampMismatch), unknown_typeorm_applied: sample(unknownTypeormApplied), duplicate_typeorm_name: sample(duplicateTypeormName), duplicate_typeorm_timestamp: sample(duplicateTypeormTimestamp), canonical_timestamp_mismatch: sample(canonicalTimestampMismatch), bridge_present: sample(bridgePresent), bridge_missing: sample(bridgeMissing), bridge_extra: sample(bridgeExtra), bridge_timestamp_mismatch: sample(bridgeTimestampMismatch), bridge_state: bridgePresent.length === 0 ? 'ABSENT' : bridgeMissing.length === 0 && !bridgeTimestampMismatch.length ? 'COMPLETE' : 'PARTIAL', bridge_runtime_required: false } };
}

function runPsql(sql, mode) { const statement = `BEGIN; SET TRANSACTION READ ONLY; ${sql}; COMMIT;`; const output = mode === 'prod' ? execFileSync('docker', ['compose', 'exec', '-T', 'db', 'sh', '-c', 'psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], { input: statement, encoding: 'utf8' }) : execFileSync('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement], { encoding: 'utf8' }); return normalizePsqlOutput(output); }
function readRows(table, mode) { const sql = table === 'schema_migrations' ? "SELECT COALESCE(json_agg(json_build_object('filename', filename, 'applied_at', applied_at::text)), '[]'::json) FROM schema_migrations" : "SELECT COALESCE(json_agg(json_build_object('name', name, 'timestamp', timestamp)), '[]'::json) FROM migrations"; const value = runPsql(sql, mode); return value ? JSON.parse(value) : []; }
function parseArgs(argv) { const args = { mode: 'pre-migration', dbMode: process.env.MIG_MODE ?? 'prod', inventory: null, retired: path.resolve('scripts/ci/retired-typeorm-migrations.json'), fixture: null }; for (let i = 0; i < argv.length; i += 1) { const arg = argv[i]; if (arg === '--mode') args.mode = argv[++i]; else if (arg === '--db-mode') args.dbMode = argv[++i]; else if (arg === '--inventory') args.inventory = argv[++i]; else if (arg === '--retired') args.retired = argv[++i]; else if (arg === '--fixture') args.fixture = argv[++i]; else if (arg === '--help') { console.log('Usage: ledger-preflight.mjs [--mode pre-migration|post-migration] [--db-mode ci|prod] [--inventory file] [--retired file] [--fixture file]'); process.exit(0); } else throw new Error(`unknown argument: ${arg}`); } return args; }

function main() { const args = parseArgs(process.argv.slice(2)); let payload; if (args.fixture) payload = JSON.parse(fs.readFileSync(args.fixture, 'utf8')); else { if (!args.inventory) throw new Error('BLOCK: canonical TypeORM inventory is required'); const inventoryPayload = JSON.parse(fs.readFileSync(args.inventory, 'utf8')); payload = { schemaRows: readRows('schema_migrations', args.dbMode), typeormRows: readRows('migrations', args.dbMode), canonicalLegacy: inventoryPayload.canonicalLegacy ?? fs.readdirSync(path.resolve(args.inventory, '../../migrations')).filter((name) => /^2026.*\.sql$/.test(name)).sort(), canonicalTypeorm: inventoryPayload.canonicalTypeorm ?? inventoryPayload, retiredTypeorm: inventoryPayload.retiredTypeorm }; } const retired = payload.retiredTypeorm ?? validateRetiredRegistry(JSON.parse(fs.readFileSync(args.retired, 'utf8'))); const result = evaluateLedger({ ...payload, retiredTypeorm: validateRetiredRegistry(retired), mode: args.mode }); console.log(JSON.stringify({ mode: args.mode, ...result }, null, 2)); if (!result.pass) process.exitCode = 1; }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { try { main(); } catch (error) { console.error(`BLOCK: ${error.message}`); process.exitCode = 1; } }
