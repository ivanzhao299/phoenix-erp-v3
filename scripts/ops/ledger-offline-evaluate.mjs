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
// ALL inputs are REQUIRED; a missing, unreadable or wrong-shaped input is a
// refusal (exit 1) before any evaluation. The evaluation itself is the
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
    else throw new Error(`unknown argument: ${arg}`);
  }
  for (const key of ['collection', 'inventory', 'legacyDir', 'retired']) {
    if (!args[key]) throw new Error(`MISSING_INPUT: --${key === 'legacyDir' ? 'legacy-dir' : key} is required`);
  }
  if (!['pre-migration', 'post-migration'].includes(args.mode)) throw new Error(`invalid --mode: ${args.mode}`);
  return args;
}

function readJson(file, label, validate) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (error) {
    throw new Error(`MISSING_INPUT: cannot read ${label} (${file}): ${error.message}`);
  }
  let value;
  try { value = JSON.parse(raw); } catch (error) {
    throw new Error(`INVALID_INPUT: ${label} (${file}) is not valid JSON: ${error.message}`);
  }
  if (validate) validate(value);
  return value;
}

export function loadEvaluationInputs(args, deps = {}) {
  const collection = readJson(args.collection, 'collection document', (doc) => {
    if (doc?.schema !== COLLECTION_SCHEMA) throw new Error(`INVALID_INPUT: collection schema mismatch, expected ${COLLECTION_SCHEMA}, got ${doc?.schema ?? String(doc?.schema)}`);
    if (!Array.isArray(doc.schema_migrations) || !Array.isArray(doc.migrations)) throw new Error('INVALID_INPUT: collection document lacks the two ledger row arrays');
  });
  let invRaw = readJson(args.inventory, 'inventory');
  const inventory = Array.isArray(invRaw) ? invRaw : invRaw.canonicalTypeorm;
  if (!Array.isArray(inventory) || !inventory.length) throw new Error(`INVALID_INPUT: inventory (${args.inventory}) carries no canonicalTypeorm entries`);
  for (const entry of inventory) {
    if (!entry?.effective_name || !/^\d{13}$/.test(String(entry.timestamp))) throw new Error(`INVALID_INPUT: inventory entry malformed: ${JSON.stringify(entry)}`);
  }
  if (!args.legacyDir || !fs.existsSync(args.legacyDir) || !fs.statSync(args.legacyDir).isDirectory()) {
    throw new Error(`MISSING_INPUT: --legacy-dir does not exist: ${args.legacyDir}`);
  }
  const canonicalLegacy = fs.readdirSync(args.legacyDir).filter((name) => /^2026.*\.sql$/.test(name)).sort();
  if (!canonicalLegacy.length) throw new Error(`INVALID_INPUT: --legacy-dir contains no legacy SQL migrations: ${args.legacyDir}`);
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
  } catch (error) {
    console.error(String(error?.message || error).replace(/\s+/g, ' ').slice(0, 300));
    process.exitCode = 1;
  }
}
