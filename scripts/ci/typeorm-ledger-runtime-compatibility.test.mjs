import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { partitionRehearsalInventory, admissionMigration } from './typeorm-ledger-rehearsal-inventory.mjs';

test('runtime rehearsal is disposable and uses the real TypeORM CLI', () => {
  const source = fs.readFileSync('scripts/ci/run-typeorm-ledger-runtime-compatibility-fixture.mjs', 'utf8');
  assert.match(source, /migration:show/);
  assert.match(source, /migration:run/);
  assert.match(source, /DropHouseOwnershipRedundantColumns1787647200000/);
  assert.match(source, /LEGACY_BRIDGE_REMAINS_ABSENT=PASS/);
  assert.match(source, /ledger-preflight\.mjs/);
  assert.doesNotMatch(source, /bridge-schema-migrations-to-typeorm\.sh\s+--apply/);
});

test('the rehearsal invokes the preflight with the candidate ledger inventory and classifies its output', () => {
  // the historical UNPARSEABLE_PREFLIGHT_OUTPUT was a deterministic
  // invocation crash: the preflight requires --inventory and the rehearsal
  // did not pass one, so it crashed before evaluating and its human crash
  // line failed the old JSON-parse fallback
  const source = fs.readFileSync('scripts/ci/run-typeorm-ledger-runtime-compatibility-fixture.mjs', 'utf8');
  assert.match(source, /'--db-mode',\s*'ci'/);
  assert.match(source, /'--inventory',\s*inventoryFile/);
  assert.match(source, /candidate-ledger-inventory\.json/);
  // the inventory payload carries the production-identical shape
  assert.match(source, /canonicalTypeorm:\s*entries\.map/);
  assert.match(source, /canonicalLegacy:\s*legacyFiles/);
  assert.match(source, /retiredTypeorm:\s*retiredRegistry/);
  // stdout/stderr are captured separately and classified by the shared,
  // tested classifier — never concatenated before a JSON.parse
  assert.match(source, /classifyPreflightOutput\(preflight\)/);
  assert.match(source, /stdout:\s*error\.stdout \?\? ''/);
  const classifier = fs.readFileSync('scripts/ci/ledger-preflight-output-classify.mjs', 'utf8');
  assert.match(classifier, /JSON\.parse\(combined\)/);
  // the divergence claim is evidence-based: an invocation crash can never
  // assert semantics divergence
  assert.doesNotMatch(source, /console\.log\('LEDGER_PREFLIGHT_RUNTIME_SEMANTICS_DIVERGENCE=CONFIRMED'\)/);
});

test('historical rehearsal accepts only its pinned 88 classes and the exact separate admission migration', () => {
  const historical = JSON.parse(fs.readFileSync('scripts/ci/typeorm-ledger-rehearsal-historical-inventory.json','utf8')).entries;
  const current = [...historical, admissionMigration];
  assert.equal(partitionRehearsalInventory(current).history.length,88);
  assert.throws(() => partitionRehearsalInventory(historical));
  assert.throws(() => partitionRehearsalInventory([...current, {...admissionMigration,timestamp:1791878400001}]));
  assert.throws(() => partitionRehearsalInventory([...historical,{...admissionMigration,class_name:'UnreviewedMigration1791878400000'}]));
  assert.throws(() => partitionRehearsalInventory([...historical.slice(1),{...historical[0],effective_name:'UnknownHistoricalName'},admissionMigration]));
  assert.throws(() => partitionRehearsalInventory([...historical.slice(1),historical[1],admissionMigration]));
});

