import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'apps/api/src/database/migrations/1788570000000-RejectNonFiniteCashBalances.ts',
  'utf8',
);
const audit = readFileSync(
  'scripts/ops/readonly-audits/cash-balance-finite-constraints.sql',
  'utf8',
);

const constraints = [
  'chk_fin_cash_txn_amount_finite',
  'chk_fin_cash_txn_balance_after_finite',
  'chk_fin_cash_acc_opening_balance_finite',
  'chk_fin_cash_acc_current_balance_finite',
];

test('migration validates and can remove every numeric NaN constraint', () => {
  for (const constraint of constraints) {
    assert.match(migration, new RegExp(`ADD CONSTRAINT \\"${constraint}\\"`));
    assert.match(migration, new RegExp(`VALIDATE CONSTRAINT \\"${constraint}\\"`));
    assert.match(migration, new RegExp(`DROP CONSTRAINT IF EXISTS \\"${constraint}\\"`));
  }
  assert.equal((migration.match(/<> \\'NaN\\'::numeric/g) || []).length, 4);
  assert.doesNotMatch(migration, /INSERT|UPDATE|DELETE|TRUNCATE|MERGE/i);
});

test('post-deploy audit preserves the stage 2 invariants', () => {
  for (const constraint of constraints) assert.match(audit, new RegExp(constraint));
  assert.match(audit, /active_breaks <> 0/);
  assert.match(audit, /active_formula_diffs <> 0/);
  assert.match(audit, /account_lookup_diffs <> 0/);
  assert.match(audit, /numeric_nan_rows/);
  assert.equal((audit.match(/source_type = 'OPENING' THEN 0/g) || []).length, 2);
});
