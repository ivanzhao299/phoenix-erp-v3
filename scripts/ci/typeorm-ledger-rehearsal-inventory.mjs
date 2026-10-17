import assert from 'node:assert/strict';
import fs from 'node:fs';

export const admissionMigration = Object.freeze({
  source_file: 'apps/api/dist/database/migrations/1791878400000-CreateChanjetExecutionAdmissions.js',
  class_name: 'CreateChanjetExecutionAdmissions1791878400000',
  effective_name: 'CreateChanjetExecutionAdmissions1791878400000',
  timestamp: 1791878400000,
});
const pinned = JSON.parse(fs.readFileSync(new URL('./typeorm-ledger-rehearsal-historical-inventory.json', import.meta.url), 'utf8'));
const sorted = entries => [...entries].sort((a,b) => a.timestamp-b.timestamp);

/** This fixture rehearses the M18 historical ledger, not newly added control DDL. */
export function partitionRehearsalInventory(entries) {
  assert.equal(pinned.schema, 'phoenix.typeorm-historical-rehearsal-inventory/1');
  assert.equal(pinned.historicalCount, 88);
  assert.equal(pinned.entries.length, 88);
  assert.equal(entries.length, 89, `expected 88 pinned historical + 1 explicitly reviewed admission migration, got ${entries.length}`);
  assert.equal(new Set(entries.map(e => e.timestamp)).size, 89, 'canonical timestamps must remain unique');
  assert.equal(new Set(entries.map(e => e.effective_name)).size, 89, 'canonical effective names must remain unique');
  const added = entries.filter(e => e.timestamp === admissionMigration.timestamp);
  assert.equal(added.length, 1, 'admission migration must be present exactly once');
  assert.deepEqual(added[0], admissionMigration, 'admission class/name/path must match the reviewed control migration');
  const history = entries.filter(e => e.timestamp !== admissionMigration.timestamp);
  assert.deepEqual(sorted(history), sorted(pinned.entries), 'historical 88-member ledger inventory changed or contains an unknown migration');
  return { history, admission: added[0] };
}
