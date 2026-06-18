import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 建 sys_chanjet_state 表 — 畅捷通鉴权链状态持久化(单行)
 *
 * 解决:容器重启时 chanjet appTicket/cert/token 内存丢失,对接断 ~10 min。
 * 单行表 key='singleton',启动 load,变更 save。
 */
export class CreateSysChanjetState1781787856093 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sys_chanjet_state" (
        "key" varchar(16) NOT NULL DEFAULT 'singleton',
        "app_ticket" text,
        "certificate" text,
        "tokens" jsonb,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sys_chanjet_state" PRIMARY KEY ("key")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sys_chanjet_state"`);
  }
}
