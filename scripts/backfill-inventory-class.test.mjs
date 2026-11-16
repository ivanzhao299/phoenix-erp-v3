import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBackfill, readAudit } from './backfill-inventory-class.mjs';

test('audit includes the farm-sale and availability safety gate', async () => {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      return { rows: [{ total_batches: 1, defect_grade_batches: 1, grade_conflicts: 0,
        unknown_grade_batches: 0, defect_mismatches: 1, standard_mismatches: 0,
        null_classes: 0, invalid_classes: 0, unsafe_defect_batches: 1 }] };
    },
  };
  const audit = await readAudit(client);
  assert.equal(audit.unsafe_defect_batches, 1);
  assert.match(calls[0].sql, /status = 'AVAILABLE'/);
  assert.match(calls[0].sql, /w\.type = 'EGG_FARM'/);
  assert.match(calls[0].sql, /owner_store_id IS NULL/);
});

test('apply fails closed when a defect batch is not approved farm sale stock', async () => {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push(sql);
      if (sql === 'BEGIN' || sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (sql.includes('SELECT') && sql.includes('FROM inv_batches')) {
        return { rows: [{ null_classes: 0, invalid_classes: 0, grade_conflicts: 0,
          unknown_grade_batches: 0, unsafe_defect_batches: 1 }] };
      }
      if (sql === 'ROLLBACK') return { rows: [] };
      return { rows: [] };
    },
  };
  await assert.rejects(
    () => applyBackfill(client, { dryRun: false, log() {} }),
    /不满足养鸡场可售条件/,
  );
  assert.equal(calls.at(-1), 'ROLLBACK');
  assert.equal(calls.some(sql => sql.includes('UPDATE inv_batches')), false);
});
