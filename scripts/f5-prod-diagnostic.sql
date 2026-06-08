-- ════════════════════════════════════════════════════════════════════════════
-- F5 生产状态诊断（只读，不改任何数据）— G40 配套
-- ════════════════════════════════════════════════════════════════════════════
-- 用途：agent 无生产 DB 访问，无法确认顶级 migrations 的内容在生产是否真缺。
--       请在生产库执行本脚本，把输出贴回，据此判断 G40 backfill 是否必要 /
--       songmingguang 等是否需补。全部 SELECT，零写入。
-- 执行：psql "$DATABASE_URL" -f scripts/f5-prod-diagnostic.sql
-- ════════════════════════════════════════════════════════════════════════════

\echo '=== A. brd_daily_logs 生产派生列是否存在 ==='
SELECT column_name
  FROM information_schema.columns
 WHERE table_name='brd_daily_logs'
   AND column_name IN ('opening_qty','closing_qty','self_use_qty','lay_rate')
 ORDER BY column_name;
-- 期望 4 行；缺行 = 生产缺该列（farm.service 写入/派生会报错）

\echo '=== B. wms_outbound / wms_inbound 去向·备注列是否存在 ==='
SELECT table_name, column_name
  FROM information_schema.columns
 WHERE (table_name='wms_outbound' AND column_name IN ('destination_type','destination_house_code','remark'))
    OR (table_name='wms_inbound'  AND column_name='remark')
 ORDER BY table_name, column_name;
-- 期望 4 行

\echo '=== C. 包装异常字典是否已种 ==='
SELECT dict_type, count(*) AS n
  FROM sys_dict
 WHERE dict_type IN ('PKG_ANOMALY_REASON','PKG_EXCEPTION_TYPE')
 GROUP BY dict_type;
-- 期望 PKG_ANOMALY_REASON=7, PKG_EXCEPTION_TYPE=6；缺/少 = 异常页下拉空

\echo '=== D. G37/G38 字典是否已生效（确认前几阶段迁移跑了没）==='
SELECT dict_type, count(*) AS n
  FROM sys_dict
 WHERE dict_type IN ('FIN_CONTRIBUTION_TYPE','FIN_RECEIPT_METHOD','FIN_PAYER_TYPE',
                     'PRC_URGENCY','PRC_QUALITY_STATUS','SAL_RETURN_REASON',
                     'SAL_PAY_METHOD','SAL_DELIVERY_EXCEPTION',
                     'BRD_VACCINE_TYPE','BRD_VACCINATE_METHOD')
 GROUP BY dict_type
 ORDER BY dict_type;
-- 全 0 = G37/G38 还没在生产跑

\echo '=== E. songmingguang 用户是否存在（可复现性核对）==='
SELECT username, real_name, status FROM sys_user WHERE username='songmingguang';
-- 1 行 = 已存在（预期，UAT 在用）；0 行 = 从零重建库缺失，需补建
