import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 建 chanjet_ar_snapshot 表 — 好业财应收统计表快照
 *
 * 铁律:只读好业财(HTTP GET),写 PG(本表)。
 * 唯一性:bookid+period+assistant_customer_code+subject_id。
 */
export class CreateChanjetArSnapshot1781791930631 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chanjet_ar_snapshot" (
        "id" bigserial NOT NULL,
        "bookid" varchar(64) NOT NULL,
        "period" varchar(6) NOT NULL,
        "assistant_customer_code" varchar(64),
        "assistant_customer_id" varchar(64),
        "subject_id" varchar(64),
        "subject_name" varchar(256),
        "init_balance" numeric(18,2) NOT NULL DEFAULT 0,
        "current_period_jf" numeric(18,2) NOT NULL DEFAULT 0,
        "current_period_df" numeric(18,2) NOT NULL DEFAULT 0,
        "endbalance" numeric(18,2) NOT NULL DEFAULT 0,
        "year_jf_accumulate" numeric(18,2) NOT NULL DEFAULT 0,
        "year_df_accumulate" numeric(18,2) NOT NULL DEFAULT 0,
        "currency" varchar(8) NOT NULL DEFAULT 'LAK',
        "raw_data" jsonb,
        "synced_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chanjet_ar_snapshot" PRIMARY KEY ("id"),
        CONSTRAINT "uq_chanjet_ar" UNIQUE ("bookid", "period", "assistant_customer_code", "subject_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_ar_book_period" ON "chanjet_ar_snapshot"("bookid","period")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_ar_synced_at" ON "chanjet_ar_snapshot"("synced_at" DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_ar_synced_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_ar_book_period"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chanjet_ar_snapshot"`);
  }
}
