import { MigrationInterface, QueryRunner } from 'typeorm';

export class EggCollectionProductionDay1795564900000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await this.adjust(q, 'shift.production_date IS DISTINCT FROM NEW.production_date',
      '(shift.production_date IS NULL OR shift.production_date < NEW.production_date)');
  }

  async down(q: QueryRunner): Promise<void> {
    const [found]=await q.query(`SELECT EXISTS(SELECT 1 FROM production_raw_receipts receipt
      JOIN pkg_source_batches source ON source.id::text=receipt.source_batch_id::text
      JOIN pkg_work_shifts shift ON shift.id=source.shift_id
      WHERE receipt.state='POSTED' AND shift.production_date>receipt.production_date) AS used`);
    if (found.used) throw new Error('RAW_COLLECTION_DATE_DOWN_HOLD: preserve posted cross-day provenance');
    await this.adjust(q, '(shift.production_date IS NULL OR shift.production_date < NEW.production_date)',
      'shift.production_date IS DISTINCT FROM NEW.production_date');
  }

  private async adjust(q: QueryRunner, from: string, to: string): Promise<void> {
    // Replace only the anchored date predicate. The record projections retain
    // the complete signed values on both old and newly frozen RAW receipts.
    const [row] = await q.query("SELECT pg_get_functiondef('guard_official_raw_posted()'::regprocedure) AS definition");
    if (!row?.definition || row.definition.split(from).length !== 2) {
      throw new Error('RAW_COLLECTION_DATE_CONTRACT_DRIFT');
    }
    await q.query(row.definition.replace(from,to));
  }
}
