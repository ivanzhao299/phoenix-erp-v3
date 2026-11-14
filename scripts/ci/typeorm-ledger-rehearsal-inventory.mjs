import assert from 'node:assert/strict';
import fs from 'node:fs';

export const admissionMigration = Object.freeze({
  source_file: 'apps/api/dist/database/migrations/1791878400000-CreateChanjetExecutionAdmissions.js',
  class_name: 'CreateChanjetExecutionAdmissions1791878400000',
  effective_name: 'CreateChanjetExecutionAdmissions1791878400000',
  timestamp: 1791878400000,
});
export const featureMigrations = Object.freeze([
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794402000000-AddImmuneIssueLines.js',
    class_name: 'AddImmuneIssueLines1794402000000',
    effective_name: 'AddImmuneIssueLines1794402000000',
    timestamp: 1794402000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794403000000-AddGradeInventoryPolicy.js',
    class_name: 'AddGradeInventoryPolicy1794403000000',
    effective_name: 'AddGradeInventoryPolicy1794403000000',
    timestamp: 1794403000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794405000000-AddWmsDefectDisposition.js',
    class_name: 'AddWmsDefectDisposition1794405000000',
    effective_name: 'AddWmsDefectDisposition1794405000000',
    timestamp: 1794405000000,
  }),
  Object.freeze({
    source_file: 'apps/api/dist/database/migrations/1794500000000-FreezeRetiredEggGrades.js',
    class_name: 'FreezeRetiredEggGrades1794500000000',
    effective_name: 'FreezeRetiredEggGrades1794500000000',
    timestamp: 1794500000000,
  }),
]);
const pinned = JSON.parse(fs.readFileSync(new URL('./typeorm-ledger-rehearsal-historical-inventory.json', import.meta.url), 'utf8'));
const sorted = entries => [...entries].sort((a,b) => a.timestamp-b.timestamp);

/** This fixture rehearses the pinned historical ledger, not newly added feature DDL. */
export function partitionRehearsalInventory(entries) {
  assert.equal(pinned.schema, 'phoenix.typeorm-historical-rehearsal-inventory/1');
  assert.equal(pinned.historicalCount, 96);
  assert.equal(pinned.entries.length, 96);
  const expectedTotal = pinned.entries.length + 1 + featureMigrations.length;
  assert.equal(entries.length, expectedTotal, `expected ${expectedTotal} pinned historical/reviewed migrations, got ${entries.length}`);
  assert.equal(new Set(entries.map(e => e.timestamp)).size, expectedTotal, 'canonical timestamps must remain unique');
  assert.equal(new Set(entries.map(e => e.effective_name)).size, expectedTotal, 'canonical effective names must remain unique');
  const added = entries.filter(e => e.timestamp === admissionMigration.timestamp);
  assert.equal(added.length, 1, 'admission migration must be present exactly once');
  assert.deepEqual(added[0], admissionMigration, 'admission class/name/path must match the reviewed control migration');
  for (const feature of featureMigrations) {
    const matches = entries.filter(e => e.timestamp === feature.timestamp);
    assert.equal(matches.length, 1, `feature migration ${feature.timestamp} must be present exactly once`);
    assert.deepEqual(matches[0], feature, `feature migration ${feature.timestamp} metadata changed`);
  }
  const excluded = new Set([admissionMigration.timestamp, ...featureMigrations.map(feature => feature.timestamp)]);
  const history = entries.filter(e => !excluded.has(e.timestamp));
  assert.deepEqual(sorted(history), sorted(pinned.entries), 'historical 96-member ledger inventory changed or contains an unknown migration');
  return { history, admission: added[0] };
}
