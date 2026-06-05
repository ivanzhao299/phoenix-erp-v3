-- ═════════════════════════════════════════════════════════════════════════════
-- GLP-1A-2 — company_code 占位修正（LPH → COMP-LAO-AGRI）
-- ═════════════════════════════════════════════════════════════════════════════
-- 背景：上一份主数据 migration 用 company_code='LPH' 作为占位（"Lao Phoenix
-- Holdings"），但生产 sys_organizations 真实的"老挝凤凰农业发展有限公司"
-- 代码是 COMP-LAO-AGRI。DataScope 因 company 不匹配过滤掉所有 LPH 数据，
-- 导致 UI 列表显示为空（DB 表实际有数据）。
--
-- 本 migration 把 3 张表的 'LPH' 改为 'COMP-LAO-AGRI'：
--   1) sal_customers (11)：CUS_* 11 个客户
--   2) fin_cash_accounts (4)：CASH_LAK / WECHAT_LAK / CASH_CNY / WECHAT_CNY
--   3) brd_farms (1)：LPH_MENGSAI 的 store_code
--
-- 全程幂等（WHERE company_code='LPH'），重复执行无副作用。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE sal_customers
   SET company_code='COMP-LAO-AGRI',
       company_name='老挝凤凰农业发展有限公司',
       updated_at=now()
 WHERE company_code='LPH'
   AND customer_no IN ('CUS_MH_AF','CUS_MH_PP','CUS_SY','CUS_LB_STORE','CUS_MS_STORE','CUS_VTE_STORE','CUS_BLK_STORE','CUS_DP_HX','CUS_VTE_LB','CUS_FSL','CUS_RETAIL');

UPDATE fin_cash_accounts
   SET company_code='COMP-LAO-AGRI',
       company_name='老挝凤凰农业发展有限公司',
       updated_at=now()
 WHERE company_code='LPH'
   AND account_code IN ('CASH_LAK','WECHAT_LAK','CASH_CNY','WECHAT_CNY');

UPDATE brd_farms
   SET store_code='SITE-MENGSAI-LAYER',
       updated_at=now()
 WHERE farm_code='LPH_MENGSAI' AND store_code='LPH';

COMMIT;
