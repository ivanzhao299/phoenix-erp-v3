-- ============================================================
-- Golden Phoenix · 生产初始化数据包  05 司机（Drivers）
-- 目标表：sal_drivers（不写 sys_user，司机不建系统账号、不绑定 GROUP）
-- 幂等：ON CONFLICT (driver_code) DO NOTHING
-- 注：sal_drivers 无 site_code 列 → 发出地 SITE 暂存于 remark（TODO：建议加列 site_code）
-- ============================================================
BEGIN;

INSERT INTO sal_drivers (driver_code, driver_name, company_code, status, remark)
VALUES
  ('DRV-VTE-001', '阿坚', 'COMP-LAO-FOOD', 'ACTIVE', 'site_code=SITE-VTE-SLAUGHTER（配送发出地）'),
  ('DRV-VTE-002', '阿喷', 'COMP-LAO-FOOD', 'ACTIVE', 'site_code=SITE-VTE-SLAUGHTER（配送发出地）'),
  ('DRV-VTE-003', '阿哨', 'COMP-LAO-FOOD', 'ACTIVE', 'site_code=SITE-VTE-SLAUGHTER（配送发出地）'),
  ('DRV-VTE-004', '阿通', 'COMP-LAO-FOOD', 'ACTIVE', 'site_code=SITE-VTE-SLAUGHTER（配送发出地）'),
  ('DRV-VTE-005', '阿给', 'COMP-LAO-FOOD', 'ACTIVE', 'site_code=SITE-VTE-SLAUGHTER（配送发出地）')
ON CONFLICT (driver_code) DO NOTHING;

COMMIT;

-- 司机仅建档案，暂不开系统账号；启用 Mobile Delivery 时再评估。
-- 校验见 90-check-init-data.sql
