import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * INV-401：蛋品存货计价层 schema（纯 DDL，批次成本法）。
 *
 * 1. inv_batches.unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0
 *    批次单位成本（批次成本法：出库按所属批次 unit_cost 结转，不用移动平均；
 *    移动平均可后续在批次成本数据之上做月度聚合视图）。
 *
 *    DEFAULT 0 = 历史批次挂账（交接 F2 决策记录）：存量批次无成本数据，统一按
 *    0 计价挂账，**首月 COGS 准确性受历史挂账影响**；是否对历史批次做一次性
 *    估价回填待财务确认（F2 开放决策点，回填走 scripts/ 运维脚本，不进迁移链）。
 *
 * 2. inv_ledger.cost_change NUMERIC(18,6)（可空）
 *    出库结转金额（cost_change = qty_change × 批次 unit_cost）。NULL = 该行
 *    无成本维度（历史行不动、入库行不写、SALE_RETURN 暂按 0 结转冲减留待 F3）。
 *    不加 NOT NULL：历史台账行必须保持 NULL 语义，避免迁移触碰存量数据。
 *
 * 本期边界（协调者已定）：fin 凭证对接不做（F3）、月结报表不做、兽药
 * （brd_medication*）不纳入本期。交付 = schema + 入库计价 + 出库结转台账
 * + 金额汇总只读 API。
 */
export class InvEggCostingColumns1794885912725 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (await queryRunner.hasTable("inv_batches")) {
            await queryRunner.query(`
                ALTER TABLE "inv_batches"
                  ADD COLUMN IF NOT EXISTS "unit_cost" NUMERIC(18,6) NOT NULL DEFAULT 0
            `);
        }
        if (await queryRunner.hasTable("inv_ledger")) {
            await queryRunner.query(`
                ALTER TABLE "inv_ledger"
                  ADD COLUMN IF NOT EXISTS "cost_change" NUMERIC(18,6)
            `);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (await queryRunner.hasTable("inv_ledger")
            && await queryRunner.hasColumn("inv_ledger", "cost_change")) {
            await queryRunner.query(`ALTER TABLE "inv_ledger" DROP COLUMN "cost_change"`);
        }
        if (await queryRunner.hasTable("inv_batches")
            && await queryRunner.hasColumn("inv_batches", "unit_cost")) {
            await queryRunner.query(`ALTER TABLE "inv_batches" DROP COLUMN "unit_cost"`);
        }
    }

}
