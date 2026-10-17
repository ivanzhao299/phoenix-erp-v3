// R4.2d the coordinator's ORIGINAL offline counterexamples, verbatim shapes
// (from /tmp/root-r42-07fe869c-review/original-offline-counterexamples.py),
// formalized as the canonical contract. The inventory fixture is generated
// AT RUNTIME from the checked-out HEAD (so the source ref resolves in any
// checkout, including shallow CI), then mutated EXACTLY as the script does:
//
//   valid                    → exit 0
//   missing-legacy (row)     → exit 1 (BLOCK, legacy_missing)
//   missing-snapshot         → exit 2 (input refusal)
//   duplicate-legacy         → exit 2   ← original group 1
//   invalid-date             → exit 2   ← original group 2
//   duplicate-inventory      → exit 2   ← original group 3 (applied inflation)
//   name-timestamp-conflict  → exit 2   ← original group 4
//   wrong-source (forged)    → exit 2   ← original group 5
//   full-post                → exit 1 (BLOCK, canonical_pending)
//   truncated-post           → exit 2   ← original group 6 (vacuous PASS)
import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const repoRoot = path.resolve(process.cwd());
const adapter = path.join(repoRoot, 'scripts/ops/ledger-offline-evaluate.mjs');
const generator = path.join(repoRoot, 'scripts/ci/ledger-source-inventory.mjs');
const retired = path.join(repoRoot, 'scripts/ci/retired-typeorm-migrations.json');

// the coordinator's collection sample, verbatim
const sampleFile = path.join(repoRoot, 'docs/ops/evidence/ledger-collection-sample.json');

let work;
let headSha;
let inventoryFile; // runtime-generated: source_ref IS the resolvable HEAD sha

function generateInventoryFromHead() {
  headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  inventoryFile = path.join(work, 'inventory-head.json');
  execFileSync(process.execPath, [generator, headSha, inventoryFile], { cwd: repoRoot, encoding: 'utf8' });
  return JSON.parse(fs.readFileSync(inventoryFile, 'utf8'));
}

function runAdapter(label, doc, inventory, mode = 'pre-migration') {
  const collectionFile = path.join(work, `${label}-collection.json`);
  const inventoryArg = path.join(work, `${label}-inventory.json`);
  fs.writeFileSync(collectionFile, JSON.stringify(doc));
  fs.writeFileSync(inventoryArg, JSON.stringify(inventory));
  const run = spawnSync(process.execPath, [adapter, '--collection', collectionFile, '--inventory', inventoryArg, '--legacy-dir', 'apps/api/migrations', '--retired', retired, '--mode', mode], { cwd: repoRoot, encoding: 'utf8' });
  return { code: run.status ?? -1, stdout: run.stdout ?? '', stderr: run.stderr ?? '', label };
}

const clone = (value) => JSON.parse(JSON.stringify(value));

describe('the coordinator\'s original offline counterexamples (verbatim shapes)', () => {
  let collection;
  let inventory;
  before(() => {
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-offline-counter-'));
    collection = JSON.parse(fs.readFileSync(sampleFile, 'utf8'));
    inventory = generateInventoryFromHead();
  });
  after(() => fs.rmSync(work, { recursive: true, force: true }));

  test('valid input still passes (exit 0) — the harness is not over-strict', () => {
    const run = runAdapter('valid', collection, inventory);
    assert.equal(run.code, 0, `${run.stdout}\n${run.stderr}`);
  });

  test('missing legacy row still BLOCKs (exit 1)', () => {
    const doc = clone(collection);
    doc.schema_migrations.pop();
    const run = runAdapter('missing-legacy', doc, inventory);
    assert.equal(run.code, 1);
    assert.match(run.stdout, /legacy_missing/);
  });

  test('missing snapshot provenance is still refused (exit 2)', () => {
    const doc = clone(collection);
    delete doc.snapshot;
    const run = runAdapter('missing-snapshot', doc, inventory);
    assert.equal(run.code, 2);
  });

  // ── the six original groups ──────────────────────────────────────────────

  test('group 1 — duplicate legacy row is REFUSED (was PASS)', () => {
    const doc = clone(collection);
    doc.schema_migrations.push(doc.schema_migrations[0]);
    const run = runAdapter('duplicate-legacy', doc, inventory);
    assert.equal(run.code, 2, `expected refusal, got exit ${run.code} (${run.stdout})`);
    assert.match(run.stderr, /duplicate/i);
  });

  test('group 2 — illegal applied_at is REFUSED (was PASS)', () => {
    const doc = clone(collection);
    doc.schema_migrations[0].applied_at = 'not-a-date';
    const run = runAdapter('invalid-date', doc, inventory);
    assert.equal(run.code, 2, `expected refusal, got exit ${run.code} (${run.stdout})`);
    assert.match(run.stderr, /applied_at/i);
  });

  test('group 3 — duplicate inventory entry is REFUSED, no applied inflation (was PASS)', () => {
    const inv = clone(inventory);
    inv.canonicalTypeorm.push(inv.canonicalTypeorm[0]);
    const run = runAdapter('duplicate-inventory', collection, inv);
    assert.equal(run.code, 2, `expected refusal, got exit ${run.code} (${run.stdout})`);
    assert.match(run.stderr, /inventory/i);
  });

  test('group 4 — name-trailing-timestamp vs timestamp conflict is REFUSED (was PASS)', () => {
    const inv = clone(inventory);
    const doc = clone(collection);
    const entry = inv.canonicalTypeorm[0];
    entry.timestamp = Number(entry.timestamp) + 1;
    for (const row of doc.migrations) {
      if (row.name === entry.effective_name) row.timestamp = entry.timestamp;
    }
    const run = runAdapter('name-timestamp-conflict', doc, inv);
    assert.equal(run.code, 2, `expected refusal, got exit ${run.code} (${run.stdout})`);
  });

  test('group 5 — forged source_ref is REFUSED (was PASS)', () => {
    const inv = clone(inventory);
    inv.source_ref = 'fabricated';
    const run = runAdapter('wrong-source', collection, inv);
    assert.equal(run.code, 2, `expected refusal, got exit ${run.code} (${run.stdout})`);
    assert.match(run.stderr, /source_ref/i);
  });

  test('full inventory in post-migration still BLOCKs (exit 1, canonical_pending)', () => {
    const run = runAdapter('full-post', collection, inventory, 'post-migration');
    assert.equal(run.code, 1);
    assert.match(run.stdout, /canonical_pending/);
  });

  test('group 6 — truncated inventory (pending entries deleted) is REFUSED, never a vacuous PASS (was PASS)', () => {
    const inv = clone(inventory);
    const applied = new Set(collection.migrations.map((row) => row.name));
    inv.canonicalTypeorm = inv.canonicalTypeorm.filter((entry) => applied.has(entry.effective_name));
    const run = runAdapter('truncated-post', collection, inv, 'post-migration');
    assert.equal(run.code, 2, `expected refusal, got exit ${run.code} (${run.stdout})`);
  });
});
