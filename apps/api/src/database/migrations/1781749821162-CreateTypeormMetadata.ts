import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * g195-P6+ 第 1 步 — 建 TypeORM 内部元数据表 `typeorm_metadata`
 *
 * 背景:TypeORM 0.3.x 用此表记录 @Generated 列 / 视图等的元数据。我们因
 * synchronize:false + 169 baseline 全手写 DDL,从未建过该表。
 * CI g195-P5 #3 (entity diff warn-only) 触发首条 QueryFailedError 即"relation
 * typeorm_metadata does not exist"——典型表现是查 GENERATED_COLUMN 时炸,
 * 例如 shr_project_equity.unpaid_capital。
 *
 * 建表结构按 TypeORM 0.3 Postgres driver 标准 DDL,日后 migration:generate /
 * @Generated 列同步 / view 持久化等机制即可正常工作。
 */
export class CreateTypeormMetadata1781749821162 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "typeorm_metadata" (
        "type" varchar NOT NULL,
        "database" varchar,
        "schema" varchar,
        "table" varchar,
        "name" varchar,
        "value" text
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "typeorm_metadata"`);
  }
}
