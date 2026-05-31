-- ============================================================
-- Golden Phoenix · 生产初始化数据包  09 车辆（Vehicles）
-- 目标表：sal_vehicles（不写旧表）
--
-- ⚠ 数据现状：名单.xlsx 未提供车辆信息（车牌、车型、载重、归属公司）。
--   本批次「不写入任何车辆」，待现场补录后按下方模板单独导入。
--   详见 README「待确认事项 · 车辆信息缺失」。
-- ============================================================
BEGIN;

-- ── 车辆导入模板（取消注释并填入真实数据后执行）──────────────────────────
-- INSERT INTO sal_vehicles
--   (vehicle_no, plate_no, vehicle_type, capacity, company_code, status, remark)
-- VALUES
--   ('VEH-VTE-001','<车牌号>','<车型 如冷藏车/平板车>','<载重kg>','COMP-LAO-FOOD','ACTIVE',NULL)
-- ON CONFLICT (vehicle_no) DO NOTHING;
-- ──────────────────────────────────────────────────────────────────────────

COMMIT;

-- 校验见 90-check-init-data.sql
