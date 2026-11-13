import { MigrationInterface, QueryRunner } from 'typeorm';

/** Durable audit/idempotency envelope for internal defect inventory actions. */
export class AddWmsDefectDisposition1794405000000 implements MigrationInterface {
  name = 'AddWmsDefectDisposition1794405000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wms_defect_dispositions" (
        "id" BIGSERIAL PRIMARY KEY,
        "disposition_no" VARCHAR(80) NOT NULL UNIQUE,
        "batch_no" VARCHAR(80) NOT NULL,
        "grade_code" VARCHAR(16) NOT NULL,
        "action" VARCHAR(32) NOT NULL,
        "qty" NUMERIC(18,3) NOT NULL CHECK ("qty" > 0),
        "warehouse_code" VARCHAR(64) NOT NULL,
        "company_code" VARCHAR(64) NOT NULL,
        "target_warehouse_code" VARCHAR(64),
        "target_location_code" VARCHAR(64),
        "reason" TEXT NOT NULL,
        "source_reference" VARCHAR(120),
        "operator" VARCHAR(128) NOT NULL,
        "status" VARCHAR(16) NOT NULL DEFAULT 'PROCESSING',
        "target_batch_no" VARCHAR(100),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "ck_wms_defect_dispositions_grade" CHECK ("grade_code" IN ('DIRTY','CRACKED','BROKEN','DAMAGED')),
        CONSTRAINT "ck_wms_defect_dispositions_action" CHECK ("action" IN ('PROCESSING','CLEANING_RECHECK','TRANSFER','WASTE','RETURN_TO_SOURCE')),
        CONSTRAINT "ck_wms_defect_dispositions_status" CHECK ("status" IN ('PROCESSING','DONE','FAILED'))
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_wms_defect_dispositions_batch" ON "wms_defect_dispositions" ("batch_no", "created_at" DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_wms_defect_dispositions_warehouse" ON "wms_defect_dispositions" ("warehouse_code", "created_at" DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_wms_defect_dispositions_warehouse"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_wms_defect_dispositions_batch"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wms_defect_dispositions"`);
  }
}
