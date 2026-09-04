import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('./cash-balance-reconciliation.sql', import.meta.url), 'utf8');
const audit = fs.readFileSync(new URL('./cash-balance-formula-audit.sql', import.meta.url), 'utf8');
const runner = fs.readFileSync(new URL('./run-cash-balance-reconciliation.sh', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../../.github/workflows/cash-balance-reconciliation.yml', import.meta.url), 'utf8');

test('repair locks the approved dynamic snapshot and defaults to rollback', () => {
  assert.match(sql, /INSERT INTO recon_map VALUES/);
  assert.equal((sql.match(/\('(?:FH|DP)-/g) || []).length, 11);
  assert.match(sql, /SHARE ROW EXCLUSIVE/);
  assert.match(sql, /target business transaction count=.*approved snapshot=426/);
  assert.match(sql, /BAL_RECON_COMMIT/);
  assert.match(sql, /ROLLED_BACK_REHEARSAL/);
  assert.doesNotMatch(sql, /UPDATE fin_cash_accounts\s+SET current_balance\s*=/i);
  assert.doesNotMatch(sql, /UPDATE fin_cash_accounts/i);
  assert.doesNotMatch(sql, /UPDATE fin_cash_transactions/i);
});

test('repair preserves business facts and adds governed opening evidence', () => {
  assert.match(sql, /source_type,source_no/);
  assert.match(sql, /'OPENING','BAL-RECON-20260904B'/);
  assert.match(sql, /source_account=/);
  assert.match(sql, /AT TIME ZONE 'Asia\/Vientiane'/);
  assert.match(sql, /business transaction snapshot\/hash changed/);
  assert.match(sql, /current\/opening account snapshot changed/);
  assert.match(sql, /chain discontinuity/);
});

test('audit excludes only evidenced G45 retired duplicates', () => {
  assert.match(audit, /status='INACTIVE'/);
  assert.match(audit, /remark LIKE '%\[G45 已并入刘杰主档\(FH-\/DP-\)，停用\]%'/);
  assert.match(audit, /unexplained_inactive_differences/);
});

test('runner backs up and hashes before opening writable execution', () => {
  const backup = runner.indexOf('target-accounts-before.csv');
  const execute = runner.indexOf('BAL_RECON_COMMIT=true');
  assert.ok(backup > 0 && execute > backup);
  assert.match(runner, /sha256sum -c/);
  assert.match(runner, /rollback\.sql/);
  assert.match(runner, /RECON_APPROVAL_REF.*BAL-RECON-20260904B/);
  assert.match(runner, /API_ERROR_WINDOW=PASS/);
  assert.match(runner, /--verify/);
  assert.match(runner, /default_transaction_read_only=on/);
});

test('production workflow is manually approved and retains artifacts', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /APPROVE-BAL-RECON-20260904B/);
  assert.match(workflow, /upload-artifact@v4/);
  assert.match(workflow, /EVIDENCE_B64_BEGIN/);
  assert.match(workflow, /tar -tzf/);
});
