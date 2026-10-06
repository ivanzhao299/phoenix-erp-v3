import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'node:querystring';

const root = path.resolve(import.meta.dirname, '..', '..');
const sql = fs.readFileSync(path.join(root, 'scripts/uat/post-r3-incremental-test-data-cleanup.sql'), 'utf8');
const classification = fs.readFileSync(path.join(root, 'full-reset-table-classification.csv'), 'utf8');
const precounts = fs.readFileSync(path.join(root, 'artifacts/uat/UAT-20261006-R4-6b0e3f/post-r3-zero-required-precounts.csv'), 'utf8').trim().split(/\r?\n/);
assert(sql.includes('\\set PRODUCTION_INCREMENTAL_CLEANUP_AUTHORIZED false'), 'authorization must default false');
assert(sql.includes('PRODUCTION_INCREMENTAL_CLEANUP_DRY_RUN'), 'dry-run gate missing');
assert.equal(precounts.length - 1, 148, 'R4.1 scope must enumerate 148 rows');
assert(!/DELETE\s+FROM\s+public\.sys_cron_heartbeat\b/i.test(sql), 'heartbeat delete forbidden');
assert(!/DELETE\s+FROM\s+public\.(fin_ar_ledger|chanjet_shareholder_voucher_links|chanjet_shareholder_close_periods|chanjet_shareholder_accounting_balances)\b/i.test(sql), 'external gate delete forbidden');
assert(/DELETE\s+FROM\s+public\.sys_notifications\s+WHERE\s+NOT\s*\(\s*notification_type='SYSTEM_ALERT'/is.test(sql), 'notification predicate missing');
assert(sql.includes('approved_system_alert_notifications'), 'approved notification preservation missing');
assert(sql.includes('sys_cron_heartbeat changed'), 'heartbeat preservation assertion missing');
assert(sql.includes('sys_alerts changed'), 'sys_alerts preservation assertion missing');
assert(sql.includes('prc2_request_items'), 'correct PR child table missing');
assert(!/TRUNCATE\s+[^;]*CASCADE/i.test(sql), 'TRUNCATE CASCADE forbidden');
assert(!/session_replication_role/i.test(sql), 'session_replication_role forbidden');
assert(!/DISABLE\s+TRIGGER\s+ALL/i.test(sql), 'DISABLE TRIGGER ALL forbidden');
assert(!/DROP\s+(TABLE|CONSTRAINT)/i.test(sql), 'destructive DDL forbidden');
assert(!/ALTER\s+SEQUENCE|setval\s*\(/i.test(sql), 'sequence reset forbidden');
for (const name of ['sys_user','sys_role','sys_menu','sys_organizations','sys_dict','fin_cash_accounts','sys_alerts','sys_audit_log','sys_operation_logs']) {
  assert(!new RegExp(`DELETE\\s+FROM\\s+public\\.${name}\\b`, 'i').test(sql), `protected table delete found: ${name}`);
}
assert(classification.includes('public,prc2_request_items,PROCUREMENT,DELETE_TRANSACTION'), 'classification must use actual PR child table');
console.log('post-R3 incremental cleanup static checks passed: 148 scope rows; protected runtime/master/archive boundaries intact');
