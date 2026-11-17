import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * INV-201：inv_batches / inv_ledger DB 完整性兜底（纯 DDL）。
 *
 * 1. ck_inv_batches_qty — `qty >= 0 AND qty_available >= 0 AND qty_available <= qty`
 *    应用层守卫（5 个写引擎的 guarded UPDATE）之外的 DB 级兜底，挡住旁路写入
 *    造成的负库存 / 超可用。NOT VALID：只校验新增/更新行，不扫存量。
 * 2. fk_inv_ledger_batch — `inv_ledger.batch_no → inv_batches.batch_no`
 *    （ON DELETE RESTRICT，NOT VALID）。杜绝 DMG-* 类伪批次号孤儿台账。
 *
 * 前置顺序（硬约束，已满足）：`processReturnInventory` 的 DAMAGE_WRITEOFF
 * 已改为挂 `RET-{returnNo}-{itemId}` 真实批次行（INV-201a，先于此迁移合入），
 * 否则 FK 会在首次破损退货时报错。
 *
 * 存量清零前禁止 VALIDATE：
 *   - 预检（只读）：scripts/check-inv-batches-invariants.sql 三计数（负数量 /
 *     超可用 / ledger 孤儿 batch_no）全 0 后，才可在运维窗口执行
 *     `ALTER TABLE ... VALIDATE CONSTRAINT ...`（仅 SHARE UPDATE EXCLUSIVE 锁）。
 *   - 历史 DMG-* 孤儿台账行由预检脚本列出，登记进批次 2 执行报告后另行处置。
 */
export class InvBatchesIntegrityConstraints1794879957217 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (!(await queryRunner.hasTable("inv_batches")) || !(await queryRunner.hasTable("inv_ledger"))) return;

        await queryRunner.query(`
            ALTER TABLE "inv_batches"
              ADD CONSTRAINT "ck_inv_batches_qty"
              CHECK (qty >= 0 AND qty_available >= 0 AND qty_available <= qty) NOT VALID
        `);

        await queryRunner.query(`
            ALTER TABLE "inv_ledger"
              ADD CONSTRAINT "fk_inv_ledger_batch"
              FOREIGN KEY ("batch_no") REFERENCES "inv_batches" ("batch_no")
              ON DELETE RESTRICT NOT VALID
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (await queryRunner.hasTable("inv_ledger")) {
            await queryRunner.query(`ALTER TABLE "inv_ledger" DROP CONSTRAINT IF EXISTS "fk_inv_ledger_batch"`);
        }
        if (await queryRunner.hasTable("inv_batches")) {
            await queryRunner.query(`ALTER TABLE "inv_batches" DROP CONSTRAINT IF EXISTS "ck_inv_batches_qty"`);
        }
    }

}
