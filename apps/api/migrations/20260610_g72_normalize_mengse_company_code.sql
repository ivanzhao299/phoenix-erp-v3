-- ════════════════════════════════════════════════════════════════════════
-- G72：规范化非标 company_code 'MENGSE' → 'COMP-LAO-AGRI'（承接 G71 公司隔离）
-- ════════════════════════════════════════════════════════════════════════
-- 背景：G71 给主数据中心加了按 company_code 的公司隔离后，发现客户/司机/车辆里
--   混用了非标 company_code 'MENGSE'（孟赛），不符合标准公司码 COMP-LAO-* 命名，
--   且不在任何用户的公司 scope 里 → 王玮华(孟赛东鹏出纳)反而看不到自己孟赛的客户。
-- 业务确认(用户 2026-06-10)：孟赛 隶属 老挝凤凰农业发展有限公司 = COMP-LAO-AGRI。
--   （东鹏 隶属 老挝东鹏星驰农业发展有限公司 = COMP-LAO-XINGCHI，但库中无 DONGPENG 非标码。）
-- 处理：32 条 'MENGSE' 记录的 company_code 统一规范为 'COMP-LAO-AGRI'。
--   sal_customers 同步把 company_name(所属公司)纠正为标准公司名(原误填为客户名)。
-- 幂等：仅命中 company_code='MENGSE'。
-- ════════════════════════════════════════════════════════════════════════

UPDATE sal_customers
SET company_code = 'COMP-LAO-AGRI',
    company_name = '老挝凤凰农业发展有限公司',
    updated_at   = now()
WHERE company_code = 'MENGSE';

UPDATE sal_drivers
SET company_code = 'COMP-LAO-AGRI'
WHERE company_code = 'MENGSE';

UPDATE sal_vehicles
SET company_code = 'COMP-LAO-AGRI'
WHERE company_code = 'MENGSE';
