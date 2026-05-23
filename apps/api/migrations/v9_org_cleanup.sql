-- v9: 组织架构清理 — 门店编码标准化 / 新建直营门店 / 角色权限修正（幂等）
-- 执行日期：2026-05-23
-- 涉及变更：
--   1. 门店编码统一：STORE-VTE-01 / ST-VTE-001 → STORE-VTE-001
--   2. 农场编码统一：FARM001/FARM-01 → FARM-MS，FARM002 → FARM-DP（已于2026-05-23执行）
--   3. 新建4个直营门店并归位各店长 store_code
--   4. 司机归位到万象仓库
--   5. 宋明光：移除 ROLE_LOG_MGR，保留 ROLE_FIN_ACCT（职责分离内控）
--   6. 赵永伟：合并双账号 yongwei299 → zhaoyongwei，追加 ROLE_REGION_MGR

-- ── 1. 门店编码统一 ────────────────────────────────────────────────────────────

UPDATE sys_store
  SET store_code = 'STORE-VTE-001'
  WHERE store_code = 'STORE-VTE-01';

UPDATE sys_user
  SET store_code = 'STORE-VTE-001'
  WHERE store_code IN ('STORE-VTE-01', 'ST-VTE-001');

-- ── 2. 农场编码统一（幂等，已执行则无影响） ──────────────────────────────────

UPDATE sys_user
  SET store_code = 'FARM-MS'
  WHERE store_code IN ('FARM001', 'FARM-01', 'FARM-001');

UPDATE sys_user
  SET store_code = 'FARM-DP'
  WHERE store_code IN ('FARM002', 'FARM-02', 'FARM-002');

UPDATE brd_flocks
  SET farm_code = 'FARM-MS'
  WHERE farm_code IN ('FARM001', 'FARM-01', 'FARM-001');

UPDATE brd_flocks
  SET farm_code = 'FARM-DP'
  WHERE farm_code IN ('FARM002', 'FARM-02', 'FARM-002');

UPDATE brd_houses
  SET farm_code = 'FARM-MS'
  WHERE farm_code IN ('FARM001', 'FARM-01', 'FARM-001');

UPDATE brd_daily_logs
  SET farm_code = 'FARM-MS'
  WHERE farm_code IN ('FARM001', 'FARM-01', 'FARM-001');

UPDATE brd_daily_logs
  SET farm_code = 'FARM-DP'
  WHERE farm_code IN ('FARM002', 'FARM-02', 'FARM-002');

-- ── 3. 新建直营门店 ────────────────────────────────────────────────────────────

INSERT INTO sys_store (store_code, store_name_zh, store_type, parent_code, status)
VALUES
  ('STORE-MS-001',  '孟赛直营店',     'STORE', 'CO-FHA', 1),
  ('STORE-BLX-001', '波利坎赛直营店', 'STORE', 'CO-FHA', 1),
  ('STORE-HSI-001', '会晒直营店',     'STORE', 'CO-FHA', 1),
  ('STORE-SYB-001', '沙耶武里直营店', 'STORE', 'CO-FHA', 1)
ON CONFLICT (store_code) DO NOTHING;

-- 店长归位
UPDATE sys_user SET store_code = 'STORE-MS-001'  WHERE username = 'chenling';
UPDATE sys_user SET store_code = 'STORE-VTE-001' WHERE username = 'alue';
UPDATE sys_user SET store_code = 'STORE-BLX-001' WHERE username = 'bouavanh';
UPDATE sys_user SET store_code = 'STORE-HSI-001' WHERE username = 'langshipei';
UPDATE sys_user SET store_code = 'STORE-SYB-001' WHERE username = 'xiaolan';

-- 司机归位到万象仓库配送中心
UPDATE sys_user SET store_code = 'WH-VTE-01' WHERE username = 'ajian';

-- ── 4. 宋明光：移除 ROLE_LOG_MGR（保留 ROLE_FIN_ACCT，职责分离） ──────────────

DELETE FROM sys_user_role
  WHERE user_id = (SELECT user_id FROM sys_user WHERE username = 'songmingguang')
    AND role_id  = (SELECT role_id  FROM sys_role  WHERE role_code = 'ROLE_LOG_MGR');

-- ── 5. 赵永伟：给 zhaoyongwei 追加 ROLE_REGION_MGR，删除冗余账号 yongwei299 ──

INSERT INTO sys_user_role (user_id, role_id)
  SELECT u.user_id, r.role_id
  FROM sys_user u, sys_role r
  WHERE u.username = 'zhaoyongwei'
    AND r.role_code = 'ROLE_REGION_MGR'
    AND NOT EXISTS (
      SELECT 1 FROM sys_user_role ur2
      WHERE ur2.user_id = u.user_id AND ur2.role_id = r.role_id
    );

DELETE FROM sys_user_role
  WHERE user_id = (SELECT user_id FROM sys_user WHERE username = 'yongwei299');

DELETE FROM sys_user WHERE username = 'yongwei299';
