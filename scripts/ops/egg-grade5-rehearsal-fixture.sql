-- Before-image fixture mirroring the production snapshot of 2026-09-11 (run 34665332082):
-- mst_products: EGG id=10 ACTIVE; PRD-EGG-5/PRD-EGG-GRADE_5 absent.
-- product_grades: GRADE_5 id=2277 ACTIVE. packaging_specs: PKG_PACK_SPEC_3 id=2612 ACTIVE qty 30.
-- product_skus: exactly 26 rows; 7 legacy GRADE_5 under PRD-EGG-5 (ids 3953..3983).
-- chanjet_master_mapping: CJ legacy registration rows referencing legacy sku codes.
CREATE TABLE mst_products (
  id              SERIAL PRIMARY KEY,
  product_code    VARCHAR(64) UNIQUE NOT NULL,
  product_name    VARCHAR(100),
  product_name_zh VARCHAR(128),
  product_name_lo VARCHAR(128),
  category_code   VARCHAR(64),
  unit_zh         VARCHAR(20),
  has_grade       BOOLEAN NOT NULL DEFAULT FALSE,
  has_spec        BOOLEAN NOT NULL DEFAULT FALSE,
  status          VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO mst_products (id, product_code, product_name, product_name_zh, category_code, unit_zh, has_grade, has_spec, status)
VALUES (10, 'EGG', 'Egg', '鸡蛋', 'CAT_EGG', '枚', TRUE, TRUE, 'ACTIVE'),
       (11, 'PRD-FEED-001', 'Feed', '饲料', 'CAT_FEED', '袋', FALSE, FALSE, 'ACTIVE'),
       (12, 'PRD-CHICK-001', 'Chick', '鸡苗', 'CAT_CHICK', '只', FALSE, FALSE, 'ACTIVE');
SELECT setval('mst_products_id_seq', 100);

CREATE TABLE product_grades (
  id            BIGSERIAL PRIMARY KEY,
  grade_code    VARCHAR(16) NOT NULL UNIQUE,
  grade_name    VARCHAR(64) NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_saleable   BOOLEAN NOT NULL DEFAULT TRUE,
  is_storable   BOOLEAN NOT NULL DEFAULT TRUE,
  status        VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO product_grades (id, grade_code, grade_name, status) VALUES
  (2270, 'GRADE_1', '一级', 'ACTIVE'),
  (2273, 'GRADE_3', '三级', 'ACTIVE'),
  (2277, 'GRADE_5', '五级', 'ACTIVE');
SELECT setval('product_grades_id_seq', 3000);

CREATE TABLE packaging_specs (
  id             BIGSERIAL PRIMARY KEY,
  spec_code      VARCHAR(64) NOT NULL UNIQUE,
  spec_name      VARCHAR(128) NOT NULL,
  qty_per_unit   NUMERIC(10,2) NOT NULL DEFAULT 1,
  base_unit      VARCHAR(16) NOT NULL DEFAULT '枚',
  display_unit   VARCHAR(16) NOT NULL DEFAULT '枚',
  sort_order     INTEGER NOT NULL DEFAULT 0,
  status         VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO packaging_specs (id, spec_code, spec_name, qty_per_unit, status) VALUES
  (2601, 'PKG_PACK_SPEC_1', '散装', 1, 'ACTIVE'),
  (2605, 'PKG_PACK_SPEC_5', '礼盒12枚', 12, 'ACTIVE'),
  (2612, 'PKG_PACK_SPEC_3', '精品礼盒(30枚/盒)', 30, 'ACTIVE');
SELECT setval('packaging_specs_id_seq', 3000);

CREATE TABLE product_skus (
  id           BIGSERIAL PRIMARY KEY,
  sku_code     VARCHAR(64) NOT NULL UNIQUE,
  product_code VARCHAR(64) NOT NULL,
  product_name VARCHAR(256),
  grade_code   VARCHAR(16) NOT NULL,
  spec_code    VARCHAR(64) NOT NULL,
  sku_name     VARCHAR(256),
  barcode      VARCHAR(64),
  status       VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  remark       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_product_skus_combo ON product_skus (product_code, grade_code, spec_code);

-- 7 legacy GRADE_5 SKUs under the legacy product code (before-image ids per snapshot)
INSERT INTO product_skus (id, sku_code, product_code, product_name, grade_code, spec_code, sku_name, status, remark) VALUES
  (3953, 'SKU-5-LOOSE',  'PRD-EGG-5', '鸡蛋', 'GRADE_5', 'PKG_PACK_SPEC_1', '鸡蛋 (GRADE_5 / PKG_PACK_SPEC_1)', 'ACTIVE', 'legacy import'),
  (3958, 'SKU-5-TRAY30', 'PRD-EGG-5', '鸡蛋', 'GRADE_5', 'PKG_PACK_SPEC_2', '鸡蛋 (GRADE_5 / PKG_PACK_SPEC_2)', 'ACTIVE', 'legacy import'),
  (3963, 'SKU-5-TRAY36', 'PRD-EGG-5', '鸡蛋', 'GRADE_5', 'PKG_PACK_SPEC_4', '鸡蛋 (GRADE_5 / PKG_PACK_SPEC_4)', 'ACTIVE', 'legacy import'),
  (3968, 'SKU-5-BOX360', 'PRD-EGG-5', '鸡蛋', 'GRADE_5', 'PKG_PACK_SPEC_6', '鸡蛋 (GRADE_5 / PKG_PACK_SPEC_6)', 'ACTIVE', 'legacy import'),
  (3973, 'SKU-5-BOX720', 'PRD-EGG-5', '鸡蛋', 'GRADE_5', 'PKG_PACK_SPEC_7', '鸡蛋 (GRADE_5 / PKG_PACK_SPEC_7)', 'ACTIVE', 'legacy import'),
  (3978, 'SKU-5-GIFT12', 'PRD-EGG-5', '鸡蛋', 'GRADE_5', 'PKG_PACK_SPEC_5', '鸡蛋 (GRADE_5 / PKG_PACK_SPEC_5)', 'ACTIVE', 'legacy import'),
  (3983, 'SKU-5-GIFT24', 'PRD-EGG-5', '鸡蛋', 'GRADE_5', 'PKG_PACK_SPEC_8', '鸡蛋 (GRADE_5 / PKG_PACK_SPEC_8)', 'ACTIVE', 'legacy import');
-- 19 filler SKUs (other grades/products) -> total exactly 26
INSERT INTO product_skus (sku_code, product_code, product_name, grade_code, spec_code, sku_name, status) VALUES
  ('SKU-1-LOOSE',  'EGG', '鸡蛋', 'GRADE_1', 'PKG_PACK_SPEC_1', '鸡蛋 (GRADE_1 / PKG_PACK_SPEC_1)', 'ACTIVE'),
  ('SKU-1-TRAY30', 'EGG', '鸡蛋', 'GRADE_1', 'PKG_PACK_SPEC_2', '鸡蛋 (GRADE_1 / PKG_PACK_SPEC_2)', 'ACTIVE'),
  ('SKU-1-TRAY36', 'EGG', '鸡蛋', 'GRADE_1', 'PKG_PACK_SPEC_4', '鸡蛋 (GRADE_1 / PKG_PACK_SPEC_4)', 'ACTIVE'),
  ('SKU-1-BOX360', 'EGG', '鸡蛋', 'GRADE_1', 'PKG_PACK_SPEC_6', '鸡蛋 (GRADE_1 / PKG_PACK_SPEC_6)', 'ACTIVE'),
  ('SKU-1-BOX720', 'EGG', '鸡蛋', 'GRADE_1', 'PKG_PACK_SPEC_7', '鸡蛋 (GRADE_1 / PKG_PACK_SPEC_7)', 'ACTIVE'),
  ('SKU-1-GIFT12', 'EGG', '鸡蛋', 'GRADE_1', 'PKG_PACK_SPEC_5', '鸡蛋 (GRADE_1 / PKG_PACK_SPEC_5)', 'ACTIVE'),
  ('SKU-1-GIFT24', 'EGG', '鸡蛋', 'GRADE_1', 'PKG_PACK_SPEC_8', '鸡蛋 (GRADE_1 / PKG_PACK_SPEC_8)', 'ACTIVE'),
  ('SKU-3-LOOSE',  'EGG', '鸡蛋', 'GRADE_3', 'PKG_PACK_SPEC_1', '鸡蛋 (GRADE_3 / PKG_PACK_SPEC_1)', 'ACTIVE'),
  ('SKU-3-TRAY30', 'EGG', '鸡蛋', 'GRADE_3', 'PKG_PACK_SPEC_2', '鸡蛋 (GRADE_3 / PKG_PACK_SPEC_2)', 'ACTIVE'),
  ('SKU-3-TRAY36', 'EGG', '鸡蛋', 'GRADE_3', 'PKG_PACK_SPEC_4', '鸡蛋 (GRADE_3 / PKG_PACK_SPEC_4)', 'ACTIVE'),
  ('SKU-3-BOX360', 'EGG', '鸡蛋', 'GRADE_3', 'PKG_PACK_SPEC_6', '鸡蛋 (GRADE_3 / PKG_PACK_SPEC_6)', 'ACTIVE'),
  ('SKU-3-BOX720', 'EGG', '鸡蛋', 'GRADE_3', 'PKG_PACK_SPEC_7', '鸡蛋 (GRADE_3 / PKG_PACK_SPEC_7)', 'ACTIVE'),
  ('SKU-FEED-25',  'PRD-FEED-001',  '饲料', 'GRADE_1', 'PKG_FEED_25',  '饲料 (GRADE_1 / PKG_FEED_25)', 'ACTIVE'),
  ('SKU-FEED-50',  'PRD-FEED-001',  '饲料', 'GRADE_1', 'PKG_FEED_50',  '饲料 (GRADE_1 / PKG_FEED_50)', 'ACTIVE'),
  ('SKU-CHICK-01', 'PRD-CHICK-001', '鸡苗', 'GRADE_1', 'PKG_CHICK_01', '鸡苗 (GRADE_1 / PKG_CHICK_01)', 'ACTIVE'),
  ('SKU-CHICK-10', 'PRD-CHICK-001', '鸡苗', 'GRADE_1', 'PKG_CHICK_10', '鸡苗 (GRADE_1 / PKG_CHICK_10)', 'ACTIVE'),
  ('SKU-1-DIS',    'EGG', '鸡蛋', 'GRADE_1', 'PKG_PACK_SPEC_9', '鸡蛋 (GRADE_1 / PKG_PACK_SPEC_9)', 'DISABLED'),
  ('SKU-3-DIS',    'EGG', '鸡蛋', 'GRADE_3', 'PKG_PACK_SPEC_9', '鸡蛋 (GRADE_3 / PKG_PACK_SPEC_9)', 'DISABLED'),
  ('SKU-3-DIS2',   'EGG', '鸡蛋', 'GRADE_3', 'PKG_PACK_SPEC_10', '鸡蛋 (GRADE_3 / PKG_PACK_SPEC_10)', 'DISABLED');
SELECT setval('product_skus_id_seq', (SELECT max(id) FROM product_skus));

-- CJ legacy registration relation (Q6): minimal production-shaped columns
CREATE TABLE chanjet_master_mapping (
  id             BIGSERIAL PRIMARY KEY,
  mapping_type   VARCHAR(40) NOT NULL,
  book_id        VARCHAR(64) NOT NULL DEFAULT '',
  erp_code       VARCHAR(128) NOT NULL DEFAULT '',
  erp_name       VARCHAR(256) NOT NULL DEFAULT '',
  erp_entity_type VARCHAR(32) NOT NULL DEFAULT '',
  chanjet_id     VARCHAR(128) NOT NULL DEFAULT '',
  chanjet_code   VARCHAR(128) NOT NULL DEFAULT '',
  chanjet_name   VARCHAR(256) NOT NULL DEFAULT '',
  match_status   VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  review_status  VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO chanjet_master_mapping (mapping_type, book_id, erp_code, erp_name, erp_entity_type, chanjet_id, chanjet_code, chanjet_name, match_status, review_status) VALUES
  ('PRODUCT', 'BK-001', 'SKU-5-TRAY30', '鸡蛋 (GRADE_5 / PKG_PACK_SPEC_2)', 'SKU', 'cj-1001', 'CJ-EGG-TRAY', 'CJ 鸡蛋托盘30', 'MANUAL', 'APPROVED'),
  ('PRODUCT', 'BK-001', 'SKU-5-BOX360', '鸡蛋 (GRADE_5 / PKG_PACK_SPEC_6)', 'SKU', 'cj-1002', 'CJ-EGG-BOX',  'CJ 鸡蛋箱装',  'MANUAL', 'APPROVED');

-- transactional reference tables used by V11 / hard-rollback gates
CREATE TABLE inv_batches (
  id          BIGSERIAL PRIMARY KEY,
  batch_no    VARCHAR(64) UNIQUE NOT NULL,
  sku_code    VARCHAR(64),
  product_code VARCHAR(64),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE sal_order_items (
  id          BIGSERIAL PRIMARY KEY,
  sku_code    VARCHAR(64),
  qty         INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
