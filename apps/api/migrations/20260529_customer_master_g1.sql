-- ============================================================
-- Phoenix ERP V3 — Customer Master Consolidation Phase G1
-- ============================================================
-- 目标：为客户主档统一读取做好字段基础建设
--   P3: sal_customers 扩展（兼容迁移字段）
--   P2: fin_ar_invoices / fin_ar_receipts 增加 sal_customer_id
-- 约定：所有 DDL 幂等（ADD COLUMN IF NOT EXISTS），不改已有数据
-- ============================================================

DO $$ BEGIN
  RAISE NOTICE '=== Customer Master G1 Migration START ===';

  -- ─────────────────────────────────────────────────────────
  -- P3: sal_customers 扩展字段
  -- ─────────────────────────────────────────────────────────

  -- legacy_customer_code: 记录从 ord_customers / b2b_customers 迁入时的原 customer_code
  --   用途：Phase G1 SalesEngine 双查时 legacy_customer_code = $1 兼容旧 POS 订单
  --   Phase G2 数据迁移后填充，Phase G3+ 废弃
  ALTER TABLE sal_customers
    ADD COLUMN IF NOT EXISTS legacy_customer_code VARCHAR(50);

  -- protection_status: 从 ord_customers 迁入的客户保护状态
  --   值域：INIT（默认，无保护）/ OWNED / PROTECTED
  ALTER TABLE sal_customers
    ADD COLUMN IF NOT EXISTS protection_status VARCHAR(20) DEFAULT 'INIT';

  -- 唯一索引：保证同一 legacy_customer_code 不重复映射
  -- WHERE IS NOT NULL → 空值不占索引（未迁移客户不影响）
  CREATE UNIQUE INDEX IF NOT EXISTS idx_sal_cust_legacy_code
    ON sal_customers (legacy_customer_code)
    WHERE legacy_customer_code IS NOT NULL;

  COMMENT ON COLUMN sal_customers.legacy_customer_code IS
    'Phase G1 — 从 ord_customers/b2b_customers 迁入时保留原 customer_code，Phase G2 填充，Phase G3 废弃';
  COMMENT ON COLUMN sal_customers.protection_status IS
    'Phase G1 — 从 ord_customers 迁入的客户保护状态: INIT/OWNED/PROTECTED';

  RAISE NOTICE 'P3: sal_customers extended (legacy_customer_code, protection_status)';

  -- ─────────────────────────────────────────────────────────
  -- P2: fin_ar_invoices — 增加 sal_customer_id
  -- ─────────────────────────────────────────────────────────
  -- 暂不加 FK CONSTRAINT，允许历史数据 customer_id=NULL
  -- 新建 AR 发票时由 Sales V2 Invoice Service 填充
  ALTER TABLE fin_ar_invoices
    ADD COLUMN IF NOT EXISTS sal_customer_id BIGINT;

  COMMENT ON COLUMN fin_ar_invoices.sal_customer_id IS
    'Phase G1 — FK 逻辑 → sal_customers.id（不加硬 FK，允许历史空值）';

  CREATE INDEX IF NOT EXISTS idx_fin_ar_inv_sal_cust
    ON fin_ar_invoices (sal_customer_id)
    WHERE sal_customer_id IS NOT NULL;

  RAISE NOTICE 'P2: fin_ar_invoices.sal_customer_id added';

  -- ─────────────────────────────────────────────────────────
  -- P2: fin_ar_receipts — 增加 sal_customer_id
  -- ─────────────────────────────────────────────────────────
  ALTER TABLE fin_ar_receipts
    ADD COLUMN IF NOT EXISTS sal_customer_id BIGINT;

  COMMENT ON COLUMN fin_ar_receipts.sal_customer_id IS
    'Phase G1 — FK 逻辑 → sal_customers.id（不加硬 FK，允许历史空值）';

  CREATE INDEX IF NOT EXISTS idx_fin_ar_rec_sal_cust
    ON fin_ar_receipts (sal_customer_id)
    WHERE sal_customer_id IS NOT NULL;

  RAISE NOTICE 'P2: fin_ar_receipts.sal_customer_id added';

  -- ─────────────────────────────────────────────────────────
  -- 封存标注：ord_customers / b2b_customers 只读注释
  -- ─────────────────────────────────────────────────────────
  -- 修复（Phase C）：本文件整体已是一个 PL/pgSQL 块（外层 DO 块），
  -- 不能再嵌套 DO；在块内直接用 IF EXISTS ... THEN ... END IF + EXECUTE。
  -- 注意：本注释内不能出现美元引用符号，否则会提前闭合外层 dollar-quote。
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='ord_customers') THEN
    EXECUTE 'COMMENT ON TABLE ord_customers IS ''[LEGACY][READ_ONLY][Phase E封存] 禁止新业务写入 — 正式主档见 sal_customers''';
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='b2b_customers') THEN
    EXECUTE 'COMMENT ON TABLE b2b_customers IS ''[LEGACY][READ_ONLY][Phase E封存] 禁止新业务写入 — 正式主档见 sal_customers (DISTRIBUTOR type)''';
  END IF;

  RAISE NOTICE '=== Customer Master G1 Migration DONE ===';
END $$;
