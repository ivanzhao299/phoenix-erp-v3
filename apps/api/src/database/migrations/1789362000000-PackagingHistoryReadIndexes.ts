import {MigrationInterface,QueryRunner} from 'typeorm';
/** Read indexes and reconciliation of the existing WMS schema intent (reason already in its CREATE baseline). */
export class PackagingHistoryReadIndexes1789362000000 implements MigrationInterface {
 async up(q:QueryRunner):Promise<void>{
  await q.query('ALTER TABLE wms_transfer ADD COLUMN IF NOT EXISTS reason text');
  await q.query('CREATE INDEX IF NOT EXISTS ix_packing_history_source_no ON inv_batches(source_no)');
  await q.query('CREATE INDEX IF NOT EXISTS ix_packing_history_handover ON pkg_handover_records(packing_code)');
  await q.query('CREATE INDEX IF NOT EXISTS ix_packing_history_date_id ON pkg_packing_records(production_date DESC,id DESC) WHERE NOT is_test');
 }
 async down(q:QueryRunner):Promise<void>{
  await q.query('DROP INDEX IF EXISTS ix_packing_history_source_no');
  await q.query('DROP INDEX IF EXISTS ix_packing_history_handover');
  await q.query('DROP INDEX IF EXISTS ix_packing_history_date_id');
  // Retain reason: old environments already had this compatibility field and may contain user data.
 }
}
