-- ============================================================
-- Phoenix ERP V3 — Product Master Foundation Phase H2
-- 20260530_product_master_h2.sql
-- ============================================================
-- 目标：
--   1. 建立 product_grades（等级主数据）+ 初始化 7 个标准等级
--   2. 建立 packaging_specs（包装规格主数据）+ 初始化 7 个标准规格
--   3. 建立 product_skus（SKU 主数据表）
--   4. 升级 mst_products（补全缺失字段）
-- 注意：
--   - 不修改任何现有交易表（sal_order_items / inv_batches / sal_price_items 等）
--   - 不做任何数据迁移
--   - 全部幂等（IF NOT EXISTS / ON CONFLICT DO NOTHING）
-- ============================================================

-- ============================================================
-- PART 1: product_grades — 等级主数据
-- ============================================================

CREATE TABLE IF NOT EXISTS product_grades (
  id           BIGSERIAL    PRIMARY KEY,
  grade_code   VARCHAR(16)  NOT NULL UNIQUE,
  grade_name   VARCHAR(64)  NOT NULL,
  grade_name_lo VARCHAR(64),
  sort_order   INTEGER      NOT NULL DEFAULT 0,
  is_saleable  BOOLEAN      NOT NULL DEFAULT TRUE,   -- 可销售等级（AA/A/B/C）
  is_storable  BOOLEAN      NOT NULL DEFAULT TRUE,   -- 可正常入库（DIRTY/CRACKED 为非标入库）
  status       VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',
  remark       TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE product_grades IS '产品等级主数据 — Phase H2 建立，统一 grade_code 值集（AA/A/B/C/DIRTY/CRACKED/BROKEN/DAMAGED）';

CREATE INDEX IF NOT EXISTS idx_product_grades_status ON product_grades(status);

-- 初始化标准等级值（幂等）
INSERT INTO product_grades (grade_code, grade_name, grade_name_lo, sort_order, is_saleable, is_storable, status, remark)
VALUES
  ('AA',      '特级蛋',   'AA Grade',       10,  TRUE,  TRUE,  'ACTIVE', '出口/礼品级，最高品质'),
  ('A',       '一级蛋',   'Grade A',        20,  TRUE,  TRUE,  'ACTIVE', '标准鲜蛋，主流销售等级'),
  ('B',       '二级蛋',   'Grade B',        30,  TRUE,  TRUE,  'ACTIVE', '批发/食品加工用'),
  ('C',       '三级蛋',   'Grade C',        40,  TRUE,  TRUE,  'ACTIVE', '工厂加工原料，低端市场'),
  ('DIRTY',   '脏蛋',     'Dirty Egg',      50,  FALSE, TRUE,  'ACTIVE', '外壳污染，需清洁处理后降级销售'),
  ('CRACKED', '裂缝蛋',   'Cracked Egg',    60,  FALSE, TRUE,  'ACTIVE', '蛋壳有裂缝，可用于加工，不可零售'),
  ('BROKEN',  '破蛋',     'Broken Egg',     70,  FALSE, FALSE, 'ACTIVE', '蛋壳破损，仅作废品处理'),
  ('DAMAGED', '损坏蛋',   'Damaged',        80,  FALSE, FALSE, 'ACTIVE', '退货/异常品，质检确认不可用')
ON CONFLICT (grade_code) DO NOTHING;


-- ============================================================
-- PART 2: packaging_specs — 包装规格主数据
-- ============================================================

CREATE TABLE IF NOT EXISTS packaging_specs (
  id               BIGSERIAL    PRIMARY KEY,
  spec_code        VARCHAR(64)  NOT NULL UNIQUE,
  spec_name        VARCHAR(128) NOT NULL,
  spec_name_lo     VARCHAR(128),
  qty_per_unit     NUMERIC(10,2) NOT NULL DEFAULT 1,  -- 每销售单位含基础单位（枚）数量
  base_unit        VARCHAR(16)  NOT NULL DEFAULT '枚',  -- 基础计量单位
  display_unit     VARCHAR(16)  NOT NULL DEFAULT '枚',  -- 对外显示单位
  sort_order       INTEGER      NOT NULL DEFAULT 0,
  status           VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',
  remark           TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE packaging_specs IS '包装规格主数据 — Phase H2 建立，统一 packaging_spec 值集，含单位换算关系';

CREATE INDEX IF NOT EXISTS idx_packaging_specs_status ON packaging_specs(status);

-- 初始化标准包装规格（幂等）
INSERT INTO packaging_specs (spec_code, spec_name, spec_name_lo, qty_per_unit, base_unit, display_unit, sort_order, status, remark)
VALUES
  ('LOOSE',      '散装',         'Loose',           1,    '枚', '枚', 10,  'ACTIVE', '散装按枚计，无包装'),
  ('TRAY30',     '30枚/托',      '30 pcs/tray',     30,   '枚', '托', 20,  'ACTIVE', '标准零售托盘，30枚装'),
  ('TRAY36',     '36枚/托',      '36 pcs/tray',     36,   '枚', '托', 25,  'ACTIVE', '大托盘，36枚装'),
  ('BOX360',     '360枚/箱',     '360 pcs/case',    360,  '枚', '箱', 30,  'ACTIVE', '标准整箱（12托×30枚）'),
  ('BOX720',     '720枚/箱',     '720 pcs/case',    720,  '枚', '箱', 35,  'ACTIVE', '大箱（20托×36枚）'),
  ('GIFT12',     '礼盒装 12枚',  'Gift Box 12pcs',  12,   '枚', '盒', 40,  'ACTIVE', '精装礼盒，12枚装，独立包装'),
  ('GIFT24',     '礼盒装 24枚',  'Gift Box 24pcs',  24,   '枚', '盒', 45,  'ACTIVE', '精装礼盒，24枚装，独立包装')
ON CONFLICT (spec_code) DO NOTHING;


-- ============================================================
-- PART 3: product_skus — SKU 主数据
-- ============================================================

CREATE TABLE IF NOT EXISTS product_skus (
  id           BIGSERIAL    PRIMARY KEY,
  sku_code     VARCHAR(64)  NOT NULL UNIQUE,
  product_code VARCHAR(64)  NOT NULL,        -- 关联 mst_products.product_code（软关联，无 FK 约束）
  product_name VARCHAR(256),                 -- 冗余产品名（提升查询效率）
  grade_code   VARCHAR(16)  NOT NULL,        -- 关联 product_grades.grade_code（软关联）
  spec_code    VARCHAR(64)  NOT NULL,        -- 关联 packaging_specs.spec_code（软关联）
  sku_name     VARCHAR(256),                 -- 自动生成：产品名 + 等级 + 规格
  barcode      VARCHAR(64),
  status       VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',
  remark       TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE product_skus IS 'SKU 主数据 — Phase H2 建立。SKU = product_code + grade_code + spec_code 的唯一组合，为 H3（价格接 SKU）和 H4（库存接 SKU）做准备';

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_skus_combo
  ON product_skus (product_code, grade_code, spec_code);

CREATE INDEX IF NOT EXISTS idx_product_skus_product ON product_skus(product_code);
CREATE INDEX IF NOT EXISTS idx_product_skus_grade   ON product_skus(grade_code);
CREATE INDEX IF NOT EXISTS idx_product_skus_spec    ON product_skus(spec_code);
CREATE INDEX IF NOT EXISTS idx_product_skus_status  ON product_skus(status);


-- ============================================================
-- PART 4: mst_products 字段升级
-- ============================================================

-- 补充前端已使用但未在基线 Schema 定义的字段（幂等）
ALTER TABLE mst_products
  ADD COLUMN IF NOT EXISTS category_code       VARCHAR(64),
  ADD COLUMN IF NOT EXISTS unit_zh             VARCHAR(16)   DEFAULT '枚',
  ADD COLUMN IF NOT EXISTS unit_lo             VARCHAR(16),
  ADD COLUMN IF NOT EXISTS shelf_life_days     INTEGER,
  ADD COLUMN IF NOT EXISTS price_retail        NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_url           TEXT,
  ADD COLUMN IF NOT EXISTS specs               TEXT,
  ADD COLUMN IF NOT EXISTS has_grade           BOOLEAN       NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS has_spec            BOOLEAN       NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ   DEFAULT NOW();

COMMENT ON TABLE  mst_products IS '产品主档 — Phase H2 字段升级，补全 category_code / unit_zh / shelf_life_days / price_retail / has_grade / has_spec 等缺失字段';
COMMENT ON COLUMN mst_products.has_grade IS '是否按等级管理（TRUE=需选 grade_code，FALSE=单一等级产品）';
COMMENT ON COLUMN mst_products.has_spec  IS '是否按包装规格管理（TRUE=需选 spec_code，FALSE=散装/固定规格）';

-- 迁移 category → category_code（如旧字段有值则回填，幂等）
UPDATE mst_products
   SET category_code = category
 WHERE category IS NOT NULL
   AND category_code IS NULL;


-- ============================================================
-- 完成验证
-- ============================================================

DO $$ BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Product Master H2 Migration — COMPLETE';
  RAISE NOTICE '========================================';
  RAISE NOTICE '[product_grades]   rows: %', (SELECT COUNT(*) FROM product_grades);
  RAISE NOTICE '[packaging_specs]  rows: %', (SELECT COUNT(*) FROM packaging_specs);
  RAISE NOTICE '[product_skus]     rows: %', (SELECT COUNT(*) FROM product_skus);
  RAISE NOTICE '[mst_products]     rows: %', (SELECT COUNT(*) FROM mst_products);
  RAISE NOTICE '[mst_products] has_grade cols: %', (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name='mst_products' AND column_name='has_grade'
  );
  RAISE NOTICE '========================================';
END $$;
