import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChanjetApiTrafficBudget1785900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sys_chanjet_api_budget" (
        "budget_key" varchar(32) NOT NULL,
        "request_count" integer NOT NULL DEFAULT 0,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sys_chanjet_api_budget" PRIMARY KEY ("budget_key"),
        CONSTRAINT "CHK_sys_chanjet_api_budget_nonnegative" CHECK ("request_count" >= 0)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sys_chanjet_api_budget"`);
  }
}
