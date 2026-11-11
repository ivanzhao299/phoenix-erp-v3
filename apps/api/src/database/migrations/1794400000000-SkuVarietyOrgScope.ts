import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SKU 多公司品种适配 · 阶段 2（结构）
 *
 * 修正版方案一（已审批决策 9/10/11）：
 *   - GRADE_0 特大档恢复为集团标准等级（数据 seed 走运维脚本）
 *   - 壳色变体只建「红壳蛋 / 粉壳蛋」两个，品种多对一映射
 *   - 阶段 0+2+3 最小闭环：本迁移只建结构，不写业务数据
 *
 * 结构（四张新表 + 三列）：
 *   md_product_varieties   品种→商业产品变体（红壳/粉壳），主表
 *   md_variety_breeds      变体↔BRD_BREED 品种 多对多映射
 *   md_sku_org_scope       SKU 组织适用范围（company/farm/site + sale/stock 开关）
 *   md_sku_aliases         SKU 本地编码/条码别名（阶段 4 POS 用，先建结构）
 *   product_skus.variety_code        关联变体（可空：历史 SKU 无变体）
 *   mst_products.variety_code        同上
 *   brd_flocks.breed_code            鸡群标准品种码（strain 中文名保留兼容）
 *   inv_batches.variety_code         批次品种快照（历史批 NULL，新批必写）
 *
 * 铁律遵循：
 *   - up() 无业务数据 DML（g197-H；种子走 scripts/seed-sku-variety-org-scope.mjs）
 *   - down() 真实可回滚（g195-P5）
 *   - md_sku_org_scope 唯一约束列全 NOT NULL（g198：NULL≠NULL 会击穿唯一约束）
 */
export class SkuVarietyOrgScope1794400000000 implements MigrationInterface {
  name = 'SkuVarietyOrgScope1794400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "md_product_varieties" (
        "id" bigserial NOT NULL,
        "variety_code" varchar(64) NOT NULL,
        "variety_name" varchar(128) NOT NULL,
        "variety_name_en" varchar(128),
        "shell_color" varchar(16) NOT NULL DEFAULT '',
        "status" varchar(16) NOT NULL DEFAULT 'ACTIVE',
        "effective_date" date,
        "expire_date" date,
        "remark" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_md_product_varieties" PRIMARY KEY ("id"),
        CONSTRAINT "uq_md_product_varieties_code" UNIQUE ("variety_code")
      )
    `);
    await queryRunner.query(`
      COMMENT ON TABLE "md_product_varieties" IS
        '蛋品商业变体（红壳蛋/粉壳蛋）— 品种差异的商业表现层；品种(海兰褐等)经 md_variety_breeds 多对一映射到变体'
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_md_product_varieties_status" ON "md_product_varieties"("status")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "md_variety_breeds" (
        "id" bigserial NOT NULL,
        "variety_code" varchar(64) NOT NULL,
        "breed_code" varchar(64) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'ACTIVE',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_md_variety_breeds" PRIMARY KEY ("id"),
        CONSTRAINT "uq_md_variety_breeds" UNIQUE ("variety_code", "breed_code")
      )
    `);
    await queryRunner.query(`
      COMMENT ON TABLE "md_variety_breeds" IS
        '变体↔品种映射（多对多）：HY_LINE_BROWN/LOHMANN_BROWN/ISA_BROWN→EGG_RED；HY_LINE_WHITE/LOHMANN_WHITE/DEKALB_WHITE→EGG_PINK 之外的组合由运维脚本维护'
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_md_variety_breeds_breed" ON "md_variety_breeds"("breed_code", "status")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "md_sku_org_scope" (
        "id" bigserial NOT NULL,
        "sku_code" varchar(64) NOT NULL,
        "scope_type" varchar(16) NOT NULL,
        "scope_code" varchar(64) NOT NULL DEFAULT '',
        "sale_enabled" boolean NOT NULL DEFAULT true,
        "stock_enabled" boolean NOT NULL DEFAULT true,
        "status" varchar(16) NOT NULL DEFAULT 'ACTIVE',
        "effective_date" date,
        "expire_date" date,
        "default_flag" boolean NOT NULL DEFAULT false,
        "remark" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_md_sku_org_scope" PRIMARY KEY ("id"),
        CONSTRAINT "uq_md_sku_org_scope" UNIQUE ("sku_code", "scope_type", "scope_code"),
        CONSTRAINT "ck_md_sku_org_scope_type" CHECK ("scope_type" IN ('COMPANY', 'FARM', 'SITE', 'ALL'))
      )
    `);
    await queryRunner.query(`
      COMMENT ON TABLE "md_sku_org_scope" IS
        'SKU 组织适用范围：同一集团 SKU 可分配给多个公司/农场/场站；scope_type=ALL 表示集团共享兜底；品种约束在变体层，不在本表'
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_md_sku_org_scope_lookup" ON "md_sku_org_scope"("scope_type", "scope_code", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_md_sku_org_scope_sku" ON "md_sku_org_scope"("sku_code", "status")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "md_sku_aliases" (
        "id" bigserial NOT NULL,
        "sku_code" varchar(64) NOT NULL,
        "scope_type" varchar(16) NOT NULL DEFAULT 'COMPANY',
        "scope_code" varchar(64) NOT NULL DEFAULT '',
        "alias_type" varchar(16) NOT NULL,
        "alias_code" varchar(128) NOT NULL,
        "alias_name" varchar(256),
        "status" varchar(16) NOT NULL DEFAULT 'ACTIVE',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_md_sku_aliases" PRIMARY KEY ("id"),
        CONSTRAINT "uq_md_sku_aliases" UNIQUE ("scope_type", "scope_code", "alias_type", "alias_code"),
        CONSTRAINT "ck_md_sku_aliases_type" CHECK ("alias_type" IN ('LOCAL_CODE', 'BARCODE', 'CUSTOMER_CODE'))
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_md_sku_aliases_sku" ON "md_sku_aliases"("sku_code", "status")`);

    await queryRunner.query(`ALTER TABLE "product_skus" ADD COLUMN IF NOT EXISTS "variety_code" varchar(64)`);
    await queryRunner.query(`COMMENT ON COLUMN "product_skus"."variety_code" IS '蛋品商业变体（md_product_varieties.variety_code），历史 SKU 为 NULL'`);
    await queryRunner.query(`ALTER TABLE "mst_products" ADD COLUMN IF NOT EXISTS "variety_code" varchar(64)`);
    await queryRunner.query(`ALTER TABLE "brd_flocks" ADD COLUMN IF NOT EXISTS "breed_code" varchar(64)`);
    await queryRunner.query(`COMMENT ON COLUMN "brd_flocks"."breed_code" IS '标准品种码（sys_dict BRD_BREED），strain 保留中文名做兼容展示'`);
    await queryRunner.query(`ALTER TABLE "inv_batches" ADD COLUMN IF NOT EXISTS "variety_code" varchar(64)`);
    await queryRunner.query(`COMMENT ON COLUMN "inv_batches"."variety_code" IS '品种快照（md_product_varieties.variety_code），历史批次 NULL，TEMP_PRODUCTION 新批必写'`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_product_skus_variety" ON "product_skus"("variety_code")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_inv_batches_variety" ON "inv_batches"("variety_code")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_inv_batches_variety"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_product_skus_variety"`);
    await queryRunner.query(`ALTER TABLE "inv_batches" DROP COLUMN IF EXISTS "variety_code"`);
    await queryRunner.query(`ALTER TABLE "brd_flocks" DROP COLUMN IF EXISTS "breed_code"`);
    await queryRunner.query(`ALTER TABLE "mst_products" DROP COLUMN IF EXISTS "variety_code"`);
    await queryRunner.query(`ALTER TABLE "product_skus" DROP COLUMN IF EXISTS "variety_code"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "md_sku_aliases"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "md_sku_org_scope"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "md_variety_breeds"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "md_product_varieties"`);
  }
}
