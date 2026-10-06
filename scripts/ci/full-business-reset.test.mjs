import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const csv = fs.readFileSync(path.join(root, 'full-reset-table-classification.csv'), 'utf8').replace(/^\uFEFF/, '');
const lines = csv.trim().split(/\r?\n/);
const header = lines.shift().split(',');
const tableIndex = header.indexOf('table');
const classIndex = header.indexOf('classification');
const classification = new Map();
for (const line of lines) {
  const cols = line.split(',');
  classification.set(cols[tableIndex], cols[classIndex]);
}

const sql = fs.readFileSync(path.join(root, 'scripts/uat/full-test-business-reset.sql'), 'utf8')
  .replace(/--[^\n]*/g, '')
  .replace(/\/\*.*?\*\//gs, '');
const postcheck = fs.readFileSync(path.join(root, 'scripts/uat/full-test-business-reset-postcheck.sql'), 'utf8');

const deleteTables = [...sql.matchAll(/DELETE\s+FROM\s+public\.([a-zA-Z0-9_]+)/gi)].map((m) => m[1]);
assert(deleteTables.length > 100, `unexpectedly small delete set: ${deleteTables.length}`);
for (const table of deleteTables) {
  const cls = classification.get(table);
  assert(cls, `delete table missing from classification: ${table}`);
  assert(['DELETE_TRANSACTION', 'DELETE_RUNTIME', 'EXTERNAL_GATE', 'RESET_DERIVED'].includes(cls), `unsafe delete class ${table}=${cls}`);
}
for (const table of classification.keys()) {
  if (classification.get(table) === 'KEEP_MASTER') {
    assert(!new RegExp(`DELETE\\s+FROM\\s+public\\.${table}\\b`, 'i').test(sql), `KEEP_MASTER delete found: ${table}`);
  }
}

const updateStatements = [...sql.matchAll(/UPDATE\s+public\.([a-zA-Z0-9_]+)\s+SET\s+([^;]+);/gis)];
const allowedUpdates = new Map([
  ['sal_store_sale_tenders', new Set(['reversal_of_tender_id'])],
  ['pkg_packing_events', new Set(['session_id'])],
  ['store_inventory', new Set(['qty', 'last_count_date', 'updated_at'])],
  ['wms_stock_balance', new Set(['qty', 'locked_qty', 'updated_at'])],
  ['fin_cash_accounts', new Set(['current_balance', 'updated_at'])],
  ['sal_customers', new Set(['credit_used', 'credit_status', 'last_overdue_at'])],
  ['ord_customers', new Set(['credit_used'])],
]);
for (const [, table, body] of updateStatements) {
  assert(allowedUpdates.has(table), `unexpected UPDATE target: ${table}`);
  for (const assignment of body.split(',')) {
    const column = assignment.trim().match(/^([a-zA-Z0-9_]+)/)?.[1];
    assert(column && allowedUpdates.get(table).has(column), `unexpected UPDATE column ${table}.${column}`);
  }
}

assert(!/TRUNCATE\s+[^;]*CASCADE/i.test(sql), 'TRUNCATE CASCADE is forbidden');
assert(!/session_replication_role/i.test(sql), 'session_replication_role is forbidden');
assert(!/DISABLE\s+TRIGGER\s+ALL/i.test(sql), 'DISABLE TRIGGER ALL is forbidden');
assert(!/DROP\s+(TABLE|CONSTRAINT)/i.test(sql), 'schema destructive DDL is forbidden');
assert(!/ALTER\s+SEQUENCE|setval\s*\(/i.test(sql), 'sequence reset is forbidden');
for (const trigger of ['trg_sal_order_lifecycle_events_append_only', 'trg_guard_posted_store_settlement', 'packing_event_immutable', 'preserve_pkg_packing_code_registry', 'preserve_pkg_packing_code_claims']) {
  assert(sql.includes(`DISABLE TRIGGER ${trigger}`), `missing exact trigger disable: ${trigger}`);
  assert(sql.includes(`ENABLE TRIGGER ${trigger}`), `missing exact trigger restore: ${trigger}`);
}
assert(sql.includes('current_balance=opening_balance'), 'cash opening reset missing');
assert(sql.includes('fin_ar_ledger'), 'AR reset missing');
assert(sql.includes('inv_batches'), 'inventory reset missing');
assert(sql.includes('ROLLBACK;'), 'R2 bundle must rollback');
assert(postcheck.includes('BEGIN TRANSACTION READ ONLY;'), 'postcheck must be read-only');
assert(postcheck.includes('ROLLBACK;'), 'postcheck must rollback');
assert(!/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE)\b/i.test(postcheck.replace(/--[^\n]*/g, '')), 'postcheck contains mutation');
console.log(`full-business-reset static checks passed: ${deleteTables.length} DELETE statements, ${updateStatements.length} UPDATE statements`);
