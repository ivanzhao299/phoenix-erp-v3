import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('./cash-balance-chain-rebuild-20260904.sql', import.meta.url), 'utf8');
const runner = readFileSync(new URL('./run-cash-balance-chain-rebuild-20260904.sh', import.meta.url), 'utf8');
const verify = readFileSync(new URL('./cash-balance-chain-verify-20260904.sql', import.meta.url), 'utf8');

test('scope and approval are exact', () => {
  for (const [code,id] of [['CA-202608-00001',505],['CA-202608-00002',507],['CASH_CNY',460],['DP-04',512],['DP-10',508],['FH-101',218]]) {
    assert.match(sql, new RegExp(`\\('${code}',${id}\\)`));
  }
  assert.match(runner, /BAL-CHAIN-REBUILD-20260904/);
});

test('only balance_after is updated and transaction is fail closed', () => {
  const updates = [...sql.matchAll(/UPDATE\s+fin_cash_transactions\s+[^;]+;/gis)].map((m) => m[0]);
  assert.equal(updates.length, 2); // rebuild + generated rollback statement
  for (const update of updates) assert.match(update, /SET\s+balance_after\s*=/i);
  assert.doesNotMatch(sql, /UPDATE\s+fin_cash_accounts/i);
  assert.match(sql, /v_updated<>29/);
  assert.match(sql, /v_changed<>23/);
  assert.match(sql, /ROLLBACK/);
});

test('exports locked evidence and verifies immutable sets', () => {
  assert.match(sql, /LOCK TABLE fin_cash_transactions IN SHARE ROW EXCLUSIVE MODE/);
  assert.match(sql, /FOR UPDATE OF a/);
  assert.match(sql, /FOR UPDATE OF x/);
  assert.match(sql, /v_account_drift<>0/);
  assert.match(sql, /v_immutable_drift<>0/);
  assert.match(sql, /v_other_drift<>0/);
  assert.match(runner, /sha256sum/);
  assert.match(runner, /cmp .*other-before\.csv.*other-after\.csv/);
  assert.match(verify, /BEGIN TRANSACTION READ ONLY/);
  assert.match(verify, /v_breaks<>0 OR v_nan<>0 OR v_formula<>0/);
});
