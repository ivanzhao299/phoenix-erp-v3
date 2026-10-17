#!/usr/bin/env node
// R4.2d offline dual-inventory evaluation adapter — the DOCUMENTED offline
// path for a collected ledger document. Raw `ledger-preflight --fixture
// <collection> --inventory <file>` is NOT the path: in --fixture mode the
// preflight takes the whole payload from the fixture file and IGNORES
// --inventory, and the collection document's field names (schema_migrations
// / migrations) are not the evaluation payload's (schemaRows / typeormRows)
// — feeding it raw yields a vacuous PASS with zero counts. This adapter is
// the formal mapping:
//   collection.schema_migrations -> payload.schemaRows
//   collection.migrations        -> payload.typeormRows
//   --inventory                  -> payload.canonicalTypeorm (FULL file:
//                                   {source_ref, canonicalTypeorm} or a
//                                   bare entry array — both accepted)
//   --legacy-dir                 -> payload.canonicalLegacy (real 169-file
//                                   baseline, enumerated from the directory)
//   --retired                    -> payload.retiredTypeorm (FULL registry,
//                                   validated by the reviewed validator)
// SINGLE-SOURCE VALIDATION CONTRACT: every input's validation lives HERE —
// validateCollectionDocument / validateInventory / validateLegacyDir /
// validateRetiredRegistry (the retired registry's deep validation stays in
// the reviewed preflight's validateRetiredRegistry, re-exported) — and the
// staging suite plus any future consumer import these same functions.
//
// Exit contract of the CLI:
//   0  evaluation completed and PASSED
//   1  evaluation completed and BLOCKED (LEDGER_OFFLINE_EVALUATION=BLOCK)
//   2  input refusal (MISSING_INPUT / INVALID_INPUT) — never an evaluation
// ALL inputs are REQUIRED; a missing, unreadable or wrong-shaped input is a
// refusal (exit 2) before any evaluation. The evaluation itself is the
// reviewed evaluateLedger — semantics untouched.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluateLedger, validateRetiredRegistry } from '../ledger-preflight.mjs';

const COLLECTION_SCHEMA = 'phoenix.ledger-readonly-collection/v1';

function parseArgs(argv) {
  const args = { mode: 'pre-migration' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--collection') args.collection = argv[++i];
    else if (arg === '--inventory') args.inventory = argv[++i];
    else if (arg === '--legacy-dir') args.legacyDir = argv[++i];
    else if (arg === '--retired') args.retired = argv[++i];
    else if (arg === '--mode') args.mode = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else throw new InputRefusal(`MISSING_INPUT: unknown argument: ${arg}`);
  }
  for (const key of ['collection', 'inventory', 'legacyDir', 'retired']) {
    if (!args[key]) throw new InputRefusal(`MISSING_INPUT: --${key === 'legacyDir' ? 'legacy-dir' : key} is required`);
  }
  if (!['pre-migration', 'post-migration'].includes(args.mode)) throw new InputRefusal(`INVALID_INPUT: invalid --mode: ${args.mode}`);
  return args;
}

export class InputRefusal extends Error {}

function readJson(file, label) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (error) {
    throw new InputRefusal(`MISSING_INPUT: cannot read ${label} (${file}): ${error.message}`);
  }
  try { return JSON.parse(raw); } catch (error) {
    throw new InputRefusal(`INVALID_INPUT: ${label} (${file}) is not valid JSON: ${error.message}`);
  }
}

// ── the single-source validators (exported contract) ───────────────────────
export function validateCollectionDocument(doc) {
  if (doc?.schema !== COLLECTION_SCHEMA) throw new InputRefusal(`INVALID_INPUT: collection schema mismatch, expected ${COLLECTION_SCHEMA}, got ${doc?.schema ?? String(doc?.schema)}`);
  if (!Array.isArray(doc.schema_migrations) || !Array.isArray(doc.migrations)) throw new InputRefusal('INVALID_INPUT: collection document lacks the two ledger row arrays');
  const legacyNames = new Set();
  for (const row of doc.schema_migrations) {
    if (!row?.filename) throw new InputRefusal(`INVALID_INPUT: schema_migrations row without filename: ${JSON.stringify(row)}`);
    // duplicate legacy rows would double-count applied history — refused
    if (legacyNames.has(row.filename)) throw new InputRefusal(`INVALID_INPUT: duplicate schema_migrations filename: ${row.filename}`);
    legacyNames.add(row.filename);
    // applied_at is a timestamp; a non-date is a forged/damaged row
    if (row.applied_at !== undefined && Number.isNaN(Date.parse(row.applied_at))) {
      throw new InputRefusal(`INVALID_INPUT: schema_migrations row has an invalid applied_at: ${JSON.stringify(row.applied_at)} (filename ${row.filename})`);
    }
  }
  const typeormNames = new Set();
  for (const row of doc.migrations) {
    if (!row?.name || !/^\d{13}$/.test(String(row.timestamp))) throw new InputRefusal(`INVALID_INPUT: migrations row malformed: ${JSON.stringify(row)}`);
    if (typeormNames.has(row.name)) throw new InputRefusal(`INVALID_INPUT: duplicate migrations name: ${row.name}`);
    typeormNames.add(row.name);
    // a migration's identity is its name-trailing 13-digit timestamp — a row
    // whose embedded timestamp disagrees with its timestamp column is forged
    const embedded = String(row.name).match(/(\d{13})$/)?.[1];
    if (embedded && embedded !== String(row.timestamp)) {
      throw new InputRefusal(`INVALID_INPUT: migrations row ${row.name} carries timestamp ${row.timestamp} conflicting with its name-trailing timestamp ${embedded}`);
    }
  }
  if (!doc.snapshot || !doc.server_version) throw new InputRefusal('INVALID_INPUT: collection document lacks the single-snapshot provenance (snapshot/server_version)');
  return doc;
}

export function validateInventory(value) {
  const isWrapped = !Array.isArray(value) && value && typeof value === 'object';
  const inventory = isWrapped ? value.canonicalTypeorm : value;
  if (!Array.isArray(inventory) || !inventory.length) throw new InputRefusal('INVALID_INPUT: inventory carries no canonicalTypeorm entries');
  const names = new Set();
  const timestamps = new Set();
  for (const entry of inventory) {
    if (!entry?.effective_name || !/^\d{13}$/.test(String(entry.timestamp))) throw new InputRefusal(`INVALID_INPUT: inventory entry malformed: ${JSON.stringify(entry)}`);
    // duplicates inflate applied counts — refused
    if (names.has(entry.effective_name)) throw new InputRefusal(`INVALID_INPUT: duplicate inventory effective_name: ${entry.effective_name}`);
    if (timestamps.has(String(entry.timestamp))) throw new InputRefusal(`INVALID_INPUT: duplicate inventory timestamp: ${entry.timestamp}`);
    names.add(entry.effective_name);
    timestamps.add(String(entry.timestamp));
    const embedded = String(entry.effective_name).match(/(\d{13})$/)?.[1];
    if (embedded && embedded !== String(entry.timestamp)) {
      throw new InputRefusal(`INVALID_INPUT: inventory entry ${entry.effective_name} carries timestamp ${entry.timestamp} conflicting with its name-trailing timestamp ${embedded}`);
    }
  }
  if (isWrapped) {
    // the source_ref must be a real commit SHA — a forged label is refused
    // before any evaluation can trust the inventory
    if (!/^[a-f0-9]{40}$/i.test(String(value.source_ref ?? ''))) {
      throw new InputRefusal(`INVALID_INPUT: inventory source_ref must be a 40-hex commit SHA, got: ${JSON.stringify(value.source_ref)}`);
    }
  }
  return inventory;
}

export function validateLegacyDir(dir) {
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new InputRefusal(`MISSING_INPUT: --legacy-dir does not exist: ${dir}`);
  }
  const canonicalLegacy = fs.readdirSync(dir).filter((name) => /^2026.*\.sql$/.test(name)).sort();
  if (!canonicalLegacy.length) throw new InputRefusal(`INVALID_INPUT: --legacy-dir contains no legacy SQL migrations: ${dir}`);
  return canonicalLegacy;
}

// SOURCE VERIFICATION: the inventory declares its source commit
// (source_ref). Regenerating the inventory FROM that commit with the reviewed
// generator and comparing the canonical arrays proves the file is the
// complete, unmodified inventory of its claimed source — truncation (deleted
// pending entries), duplication and post-generation edits all mismatch and
// are refused as INVALID_INPUT. Default ON (the strict path); tests of
// deliberately-broken inventories exercise exactly this refusal.
export function verifyInventorySource(inventoryFile, inventoryDoc, deps = {}) {
  const sourceRef = inventoryDoc?.source_ref;
  if (!/^[a-f0-9]{40}$/i.test(String(sourceRef ?? ''))) {
    throw new InputRefusal(`INVALID_INPUT: inventory source_ref must be a 40-hex commit SHA for source verification, got: ${JSON.stringify(sourceRef)}`);
  }
  const runGenerator = deps.runGenerator || ((ref, outFile) => {
    const run = spawnSync(process.execPath, ['scripts/ci/ledger-source-inventory.mjs', ref, outFile], { cwd: path.resolve(import.meta.dirname ?? '.', '../..'), encoding: 'utf8' });
    if (run.status !== 0) throw new InputRefusal(`INVALID_INPUT: cannot regenerate the inventory from ${ref}: ${String(run.stderr || '').slice(0, 160)}`);
  });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-inv-verify-'));
  try {
    const regenerated = path.join(tmp, 'regenerated.json');
    runGenerator(sourceRef, regenerated);
    const expected = JSON.parse(fs.readFileSync(regenerated, 'utf8')).canonicalTypeorm
      .map((entry) => `${entry.effective_name}@${entry.timestamp}`);
    const actual = (Array.isArray(inventoryDoc) ? inventoryDoc : inventoryDoc.canonicalTypeorm)
      .map((entry) => `${entry.effective_name}@${entry.timestamp}`);
    if (expected.length !== actual.length || expected.some((entry, i) => entry !== actual[i])) {
      throw new InputRefusal(`INVALID_INPUT: inventory (${path.basename(inventoryFile)}) is NOT the complete inventory of its declared source ${sourceRef} — regenerated ${expected.length} entries, file carries ${actual.length}; truncated or edited inventories are refused`);
    }
    return true;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export function loadEvaluationInputs(args, deps = {}) {
  const collection = (deps.validateCollectionDocument || validateCollectionDocument)(readJson(args.collection, 'collection document'));
  const inventoryRaw = readJson(args.inventory, 'inventory');
  const inventory = (deps.validateInventory || validateInventory)(inventoryRaw);
  const canonicalLegacy = (deps.validateLegacyDir || validateLegacyDir)(args.legacyDir);
  // the retired registry is an INPUT: its deep-validation refusals (not an
  // array, malformed entry, duplicate identity) are input refusals (exit 2),
  // never a generic crash
  let retiredTypeorm;
  try {
    retiredTypeorm = validateRetiredRegistry(readJson(args.retired, 'retired registry'));
  } catch (error) {
    throw new InputRefusal(`INVALID_INPUT: retired registry (${args.retired}): ${error?.message ?? error}`);
  }
  // source verification: the inventory must BE the inventory of its declared
  // commit (regenerate + compare) — refuses truncated/duplicated/edited files
  if (deps.verifySource !== false && inventoryRaw && !Array.isArray(inventoryRaw)) {
    (deps.verifyInventorySource || verifyInventorySource)(args.inventory, inventoryRaw);
  }
  return { collection, inventory, canonicalLegacy, retiredTypeorm };
}

export function evaluateCollectionOffline(args, deps = {}) {
  const { collection, inventory, canonicalLegacy, retiredTypeorm } = (deps.load || loadEvaluationInputs)(args, deps);
  const result = (deps.evaluateLedger || evaluateLedger)({
    schemaRows: collection.schema_migrations,
    typeormRows: collection.migrations,
    canonicalLegacy,
    canonicalTypeorm: inventory,
    retiredTypeorm,
    mode: args.mode,
  });
  const verdict = { schema: 'phoenix.ledger-offline-evaluation/v1', collection: path.resolve(args.collection), inventory: path.resolve(args.inventory), mode: args.mode, result };
  if (args.out) {
    fs.writeFileSync(args.out, JSON.stringify(verdict, null, 2));
  }
  return verdict;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const verdict = evaluateCollectionOffline(parseArgs(process.argv.slice(2)));
    console.log(`LEDGER_OFFLINE_EVALUATION=${verdict.result.pass ? 'PASS' : 'BLOCK'};applied=${verdict.result.counts.canonical_typeorm_applied};pending=${verdict.result.counts.canonical_typeorm_pending};failures=${JSON.stringify(verdict.result.failures)}`);
    // exit contract: PASS 0 — BLOCK 1 (a real evaluation conclusion with the
    // failure list) — refusals 2 (input problems, never an evaluation)
    if (!verdict.result.pass) process.exitCode = 1;
  } catch (error) {
    const refusal = error instanceof InputRefusal || /MISSING_INPUT|INVALID_INPUT/.test(String(error?.message));
    console.error(String(error?.message || error).replace(/\s+/g, ' ').slice(0, 300));
    process.exitCode = refusal ? 2 : 1;
  }
}
