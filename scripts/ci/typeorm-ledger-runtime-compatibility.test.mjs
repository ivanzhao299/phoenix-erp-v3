import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('runtime rehearsal is disposable and uses the real TypeORM CLI', () => {
  const source = fs.readFileSync('scripts/ci/run-typeorm-ledger-runtime-compatibility-fixture.mjs', 'utf8');
  assert.match(source, /migration:show/);
  assert.match(source, /migration:run/);
  assert.match(source, /DropHouseOwnershipRedundantColumns1787647200000/);
  assert.match(source, /LEGACY_BRIDGE_REMAINS_ABSENT=PASS/);
  assert.match(source, /ledger-preflight\.mjs/);
  assert.doesNotMatch(source, /bridge-schema-migrations-to-typeorm\.sh\s+--apply/);
});

