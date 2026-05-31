-- ============================================================
-- Golden Phoenix · 生产初始化数据包  06 门店（Stores）
-- 目标表：mst_stores（统一门店主档，Store POS / Sales V2 在用；不写旧表）
-- 幂等：ON CONFLICT (store_code) DO NOTHING
--
-- ⚠ TODO（建表建议）：mst_stores 生产库当前列为 store_code/store_name/address/phone/status，
--   无 company_code / site_code / region / remark 列。公司归属暂以「地区 / 公司全称」写入 address。
--   建议后续 schema 迭代补列：
--     ALTER TABLE mst_stores ADD COLUMN company_code varchar(64);
--     ALTER TABLE mst_stores ADD COLUMN region       varchar(128);
--     ALTER TABLE mst_stores ADD COLUMN site_code    varchar(64);
-- ============================================================
BEGIN;

-- 注：address 列为生产与本地共有；公司归属暂存于此（mst_stores 无 region/company_code 列）
INSERT INTO mst_stores (store_code, store_name, address, status)
VALUES
  ('STORE-XC-001',  '特区直营店',     '金三角特区 / COMP-LAO-XINGCHI',     'ACTIVE'),
  ('STORE-DP-001',  '东鹏直营店',     '东鹏 / COMP-LAO-XINGCHI',           'ACTIVE'),
  ('STORE-HS-001',  '会晒直营店',     '会晒(博胶省) / COMP-LAO-XINGCHI',   'ACTIVE'),
  ('STORE-XB-001',  '沙耶武里直营店', '沙耶武里省 / COMP-LAO-AGRI',        'ACTIVE'),
  ('STORE-MX-001',  '孟赛直营店',     '孟赛(乌多姆赛省) / COMP-LAO-AGRI',  'ACTIVE'),
  ('STORE-VTE-001', '万象直营店',     '万象市 / COMP-LAO-FOOD',            'ACTIVE'),
  ('STORE-BKX-001', '波利坎赛直营店', '波利坎赛省 / COMP-LAO-FOOD',        'ACTIVE'),
  ('STORE-LPB-001', '拉邦直营店',     '琅勃拉邦省 / COMP-LAO-AGRI',        'ACTIVE')
ON CONFLICT (store_code) DO NOTHING;

COMMIT;

-- 校验见 90-check-init-data.sql
