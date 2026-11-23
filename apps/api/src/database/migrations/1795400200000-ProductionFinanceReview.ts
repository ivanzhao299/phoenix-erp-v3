import { MigrationInterface, QueryRunner } from 'typeorm';

/** Schema only. Menu installation is an explicit, separate administration operation. */
export class ProductionFinanceReview1795400200000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE production_finance_review_files (
      file_id text PRIMARY KEY REFERENCES file_metadata(file_id),
      reversal_id uuid REFERENCES production_inbound_documents(id),
      manifest_id uuid REFERENCES production_cutover_manifests(id),
      CHECK (num_nonnulls(reversal_id, manifest_id) = 1)
    )`);
    await q.query(`CREATE FUNCTION guard_production_finance_review_binding() RETURNS trigger LANGUAGE plpgsql AS $guard$
      BEGIN
        IF TG_OP='TRUNCATE' THEN
          IF EXISTS (SELECT 1 FROM production_finance_review_files r
            WHERE EXISTS (SELECT 1 FROM production_financial_clearances c WHERE c.evidence_file_id=r.file_id)
               OR EXISTS (SELECT 1 FROM production_cutover_signatures s WHERE s.evidence_file_id=r.file_id)) THEN
            RAISE EXCEPTION 'SIGNED_FINANCE_REVIEW_BINDING_IMMUTABLE';
          END IF;
          RETURN NULL;
        END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended('production-finance-proof:' || OLD.file_id,0));
        IF TG_OP='UPDATE' OR EXISTS(SELECT 1 FROM production_financial_clearances WHERE evidence_file_id=OLD.file_id)
          OR EXISTS(SELECT 1 FROM production_cutover_signatures WHERE evidence_file_id=OLD.file_id) THEN
          RAISE EXCEPTION 'SIGNED_FINANCE_REVIEW_BINDING_IMMUTABLE';
        END IF;
        RETURN OLD;
      END $guard$;
      CREATE TRIGGER trg_finance_review_binding_row BEFORE UPDATE OR DELETE ON production_finance_review_files
        FOR EACH ROW EXECUTE FUNCTION guard_production_finance_review_binding();
      CREATE TRIGGER trg_finance_review_binding_truncate BEFORE TRUNCATE ON production_finance_review_files
        FOR EACH STATEMENT EXECUTE FUNCTION guard_production_finance_review_binding()`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('LOCK TABLE production_finance_review_files IN ACCESS EXCLUSIVE MODE');
    const used = await q.query('SELECT 1 FROM production_finance_review_files LIMIT 1');
    if (used.length) throw new Error('Finance review attachments require their original binding');
    await q.query('DROP TABLE production_finance_review_files');
    await q.query('DROP FUNCTION guard_production_finance_review_binding()');
  }
}
