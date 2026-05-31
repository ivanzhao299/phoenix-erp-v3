-- ============================================================
-- Golden Phoenix · 生产初始化数据包  05 司机（Drivers）
-- 目标表：sal_drivers（不写 sys_user，司机不建系统账号、不绑定 GROUP）
-- 幂等：ON CONFLICT (driver_code) DO NOTHING
-- 注：sal_drivers 无 site_code 列 → 发出地 SITE 暂存于 remark（TODO：建议加列 site_code）
--
-- 归属已按名单订正（M5 确认）：
--   阿喷/阿哨 → 星驰养鸡场 COMP-LAO-XINGCHI（东鹏）
--   阿通/阿给 → 凤凰农业 COMP-LAO-AGRI（孟赛）
--   阿坚      → 名单未列，暂保留待核（归属/电话待确认）
-- 注：driver_code 仍沿用 DRV-VTE-* 仅作唯一标识，不再代表万象；如需按场区重编码另行处理。
-- ============================================================
BEGIN;

INSERT INTO sal_drivers (driver_code, driver_name, company_code, phone, status, remark)
VALUES
  ('DRV-VTE-001', '阿坚', 'COMP-LAO-FOOD',    NULL,       'ACTIVE', '⚠ 名单未列，保留待核：归属/电话待确认'),
  ('DRV-VTE-002', '阿喷', 'COMP-LAO-XINGCHI', '92627461', 'ACTIVE', 'site=SITE-DONGPENG-LAYER（星驰养鸡场）'),
  ('DRV-VTE-003', '阿哨', 'COMP-LAO-XINGCHI', '77374960', 'ACTIVE', 'site=SITE-DONGPENG-LAYER（星驰养鸡场）'),
  ('DRV-VTE-004', '阿通', 'COMP-LAO-AGRI',    NULL,       'ACTIVE', 'site=SITE-MENGSAI-LAYER（凤凰孟赛）；DATA_INCOMPLETE: phone'),
  ('DRV-VTE-005', '阿给', 'COMP-LAO-AGRI',    NULL,       'ACTIVE', 'site=SITE-MENGSAI-LAYER（凤凰孟赛）；DATA_INCOMPLETE: phone')
ON CONFLICT (driver_code) DO NOTHING;

COMMIT;

-- 司机仅建档案，暂不开系统账号；启用 Mobile Delivery 时再评估。
-- 校验见 90-check-init-data.sql
