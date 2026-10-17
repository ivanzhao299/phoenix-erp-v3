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
import path from 'node:path';
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
  for (const row of doc.schema_migrations) {
    if (!row?.filename) throw new InputRefusal(`INVALID_INPUT: schema_migrations row without filename: ${JSON.stringify(row)}`);
  }
  for (const row of doc.migrations) {
    if (!row?.name || !/^\d{13}$/.test(String(row.timestamp))) throw new InputRefusal(`INVALID_INPUT: migrations row malformed: ${JSON.stringify(row)}`);
  }
  if (!doc.snapshot || !doc.server_version) throw new InputRefusal('INVALID_INPUT: collection document lacks the single-snapshot provenance (snapshot/server_version)');
  return doc;
}

export function validateInventory(value) {
  const inventory = Array.isArray(value) ? value : value?.canonicalTypeorm;
  if (!Array.isArray(inventory) || !inventory.length) throw new InputRefusal(`INVALID_INPUT: inventory carries no canonicalTypeorm entries`);
  for (const entry of inventory) {
    if (!entry?.effective_name || !/^\d{13}$/.test(String(entry.timestamp))) throw new InputRefusal(`INVALID_INPUT: inventory entry malformed: ${JSON.stringify(entry)}`);
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

export function loadEvaluationInputs(args, deps = {}) {
  const collection = (deps.validateCollectionDocument || validateCollectionDocument)(readJson(args.collection, 'collection document'));
  const inventory = (deps.validateInventory || validateInventory)(readJson(args.inventory, 'inventory'));
  const canonicalLegacy = (deps.validateLegacyDir || validateLegacyDir)(args.legacyDir);
  const retiredTypeorm = validateRetiredRegistry(readJson(args.retired, 'retired registry'));
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
