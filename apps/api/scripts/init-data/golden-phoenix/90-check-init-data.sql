-- ============================================================
-- Golden Phoenix · 生产初始化数据包  90 校验（Check）
-- 只读校验，输出 PASS / FAIL；用法：psql -d <db> -f 90-check-init-data.sql
-- ============================================================
\echo '════════════════════════════════════════════════════════════'
\echo ' Golden Phoenix 初始化数据包 · 校验'
\echo '════════════════════════════════════════════════════════════'

WITH m AS (  -- 矩阵 9 人
  SELECT unnest(ARRAY['zhaoyongwei','zhuzhaocun','songlei','fuqiang','xiejiling',
                      'liujie','wangweihua','zhuzhaoan','liushanjun']) AS username
)
SELECT * FROM (
  -- 1 组织数量
  SELECT 1 AS 序, '组织总数(≥14业务节点)' AS 检查项,
         (SELECT count(*)::text FROM sys_organizations) AS 实际,
         CASE WHEN (SELECT count(*) FROM sys_organizations) >= 14 THEN 'PASS' ELSE 'FAIL' END AS 结果
  -- 2 公司数量
  UNION ALL SELECT 2,'公司数量(=3)',(SELECT count(*)::text FROM sys_organizations WHERE org_type='COMPANY'),
         CASE WHEN (SELECT count(*) FROM sys_organizations WHERE org_type='COMPANY')=3 THEN 'PASS' ELSE 'FAIL' END
  -- 3 场区数量
  UNION ALL SELECT 3,'场区数量(=7)',(SELECT count(*)::text FROM sys_organizations WHERE org_type='SITE'),
         CASE WHEN (SELECT count(*) FROM sys_organizations WHERE org_type='SITE')=7 THEN 'PASS' ELSE 'FAIL' END
  -- 4 用户数量
  UNION ALL SELECT 4,'矩阵用户在册(=9)',(SELECT count(*)::text FROM sys_user u WHERE u.username IN (SELECT username FROM m)),
         CASE WHEN (SELECT count(*) FROM sys_user u WHERE u.username IN (SELECT username FROM m))=9 THEN 'PASS' ELSE 'FAIL' END
  -- 5 用户角色绑定数量
  UNION ALL SELECT 5,'矩阵用户角色绑定(≥15)',
         (SELECT count(*)::text FROM sys_user_role ur JOIN sys_user u ON u.user_id=ur.user_id WHERE u.username IN (SELECT username FROM m)),
         CASE WHEN (SELECT count(*) FROM sys_user_role ur JOIN sys_user u ON u.user_id=ur.user_id WHERE u.username IN (SELECT username FROM m))>=15 THEN 'PASS' ELSE 'FAIL' END
  -- 6 用户组织绑定数量
  UNION ALL SELECT 6,'矩阵用户组织绑定(≥9)',
         (SELECT count(*)::text FROM sys_user_orgs uo JOIN sys_user u ON u.user_id=uo.user_id WHERE u.username IN (SELECT username FROM m)),
         CASE WHEN (SELECT count(*) FROM sys_user_orgs uo JOIN sys_user u ON u.user_id=uo.user_id WHERE u.username IN (SELECT username FROM m))>=9 THEN 'PASS' ELSE 'FAIL' END
  -- 7 无角色用户
  UNION ALL SELECT 7,'无角色矩阵用户(应=0)',
         (SELECT count(*)::text FROM sys_user u WHERE u.username IN (SELECT username FROM m) AND NOT EXISTS(SELECT 1 FROM sys_user_role ur WHERE ur.user_id=u.user_id)),
         CASE WHEN (SELECT count(*) FROM sys_user u WHERE u.username IN (SELECT username FROM m) AND NOT EXISTS(SELECT 1 FROM sys_user_role ur WHERE ur.user_id=u.user_id))=0 THEN 'PASS' ELSE 'FAIL' END
  -- 8 无组织用户
  UNION ALL SELECT 8,'无组织矩阵用户(应=0)',
         (SELECT count(*)::text FROM sys_user u WHERE u.username IN (SELECT username FROM m) AND NOT EXISTS(SELECT 1 FROM sys_user_orgs uo WHERE uo.user_id=u.user_id)),
         CASE WHEN (SELECT count(*) FROM sys_user u WHERE u.username IN (SELECT username FROM m) AND NOT EXISTS(SELECT 1 FROM sys_user_orgs uo WHERE uo.user_id=u.user_id))=0 THEN 'PASS' ELSE 'FAIL' END
  -- 9 GROUP 误授权给司机/收银员
  UNION ALL SELECT 9,'GROUP误授权司机/收银员(应=0)',
         (SELECT count(*)::text FROM sys_user_orgs uo JOIN sys_user_role ur ON ur.user_id=uo.user_id JOIN sys_role r ON r.role_id=ur.role_id WHERE uo.data_scope_level='GROUP' AND r.role_code IN ('ROLE_DRIVER','ROLE_CASHIER')),
         CASE WHEN (SELECT count(*) FROM sys_user_orgs uo JOIN sys_user_role ur ON ur.user_id=uo.user_id JOIN sys_role r ON r.role_id=ur.role_id WHERE uo.data_scope_level='GROUP' AND r.role_code IN ('ROLE_DRIVER','ROLE_CASHIER'))=0 THEN 'PASS' ELSE 'FAIL' END
  -- 10 司机档案数量
  UNION ALL SELECT 10,'司机档案 DRV-VTE-*(=5)',(SELECT count(*)::text FROM sal_drivers WHERE driver_code LIKE 'DRV-VTE-%'),
         CASE WHEN (SELECT count(*) FROM sal_drivers WHERE driver_code LIKE 'DRV-VTE-%')=5 THEN 'PASS' ELSE 'FAIL' END
  -- 11 门店数量
  UNION ALL SELECT 11,'门店 STORE-*(=8)',(SELECT count(*)::text FROM mst_stores WHERE store_code LIKE 'STORE-%'),
         CASE WHEN (SELECT count(*) FROM mst_stores WHERE store_code LIKE 'STORE-%')=8 THEN 'PASS' ELSE 'FAIL' END
  -- 12 客户数量
  UNION ALL SELECT 12,'客户总数(sal_customers)',(SELECT count(*)::text FROM sal_customers),'PASS'
  -- 13 供应商数量
  UNION ALL SELECT 13,'供应商 SUP-*(=6)',(SELECT count(*)::text FROM prc2_suppliers WHERE supplier_code LIKE 'SUP-%'),
         CASE WHEN (SELECT count(*) FROM prc2_suppliers WHERE supplier_code LIKE 'SUP-%')=6 THEN 'PASS' ELSE 'FAIL' END
  -- 14 重复客户名称
  UNION ALL SELECT 14,'重复客户名称(应=0)',
         (SELECT count(*)::text FROM (SELECT 1 FROM sal_customers GROUP BY customer_name HAVING count(*)>1) x),
         CASE WHEN (SELECT count(*) FROM (SELECT 1 FROM sal_customers GROUP BY customer_name HAVING count(*)>1) x)=0 THEN 'PASS' ELSE 'FAIL' END
  -- 15 重复供应商名称
  UNION ALL SELECT 15,'重复供应商名称(应=0)',
         (SELECT count(*)::text FROM (SELECT 1 FROM prc2_suppliers GROUP BY supplier_name HAVING count(*)>1) x),
         CASE WHEN (SELECT count(*) FROM (SELECT 1 FROM prc2_suppliers GROUP BY supplier_name HAVING count(*)>1) x)=0 THEN 'PASS' ELSE 'FAIL' END
  -- 16 旧表写入风险（prc_suppliers / ord_customers / b2b_customers 是否被本包污染——本包从不写它们，仅提示存量）
  UNION ALL SELECT 16,'每用户唯一主组织(应=0违规)',
         (SELECT count(*)::text FROM (SELECT uo.user_id FROM sys_user_orgs uo JOIN sys_user u ON u.user_id=uo.user_id WHERE u.username IN (SELECT username FROM m) GROUP BY uo.user_id HAVING count(*) FILTER(WHERE uo.is_primary)<>1) y),
         CASE WHEN (SELECT count(*) FROM (SELECT uo.user_id FROM sys_user_orgs uo JOIN sys_user u ON u.user_id=uo.user_id WHERE u.username IN (SELECT username FROM m) GROUP BY uo.user_id HAVING count(*) FILTER(WHERE uo.is_primary)<>1) y)=0 THEN 'PASS' ELSE 'FAIL' END
) t ORDER BY 序;

\echo ''
\echo '注：检查项 16 = 主组织唯一性（每用户恰好 1 个 is_primary）。本包从不写 prc_suppliers / ord_customers / b2b_customers / fin_transactions / log_dispatch。'
\echo '════════════════════════════════════════════════════════════'
