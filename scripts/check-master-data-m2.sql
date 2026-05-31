-- ============================================================
-- Phoenix ERP V3 — Master Data M2 校验脚本
-- 用法：psql -d <db> -f scripts/check-master-data-m2.sql
-- 检查：用户数 / 角色绑定 / 司机 / 门店 / 客户 / 供应商 / 组织绑定 / 重复编码
-- ============================================================
\echo '════════════════════════════════════════════════════════════'
\echo 'Master Data M2 — 校验'
\echo '════════════════════════════════════════════════════════════'

-- ── 1. 核心计数 ────────────────────────────────────────────────────────────────
\echo ''
\echo '【1】核心数据计数'
SELECT '矩阵用户(10人)在册'    AS 项, count(*) AS 数量 FROM sys_user WHERE username IN
  ('zhaoyongwei','zhuzhaocun','songlei','fuqiang','xiejiling','liujie','wangweihua','zhuzhao_an','liushanjun','ajian')
UNION ALL SELECT 'ROLE_CASH(出纳)角色', count(*) FROM sys_role WHERE role_code='ROLE_CASH'
UNION ALL SELECT '矩阵10人角色绑定', count(*) FROM sys_user_role ur JOIN sys_user u ON u.user_id=ur.user_id
  WHERE u.username IN ('zhaoyongwei','zhuzhaocun','songlei','fuqiang','xiejiling','liujie','wangweihua','zhuzhao_an','liushanjun','ajian')
UNION ALL SELECT '矩阵10人组织绑定', count(*) FROM sys_user_orgs uo JOIN sys_user u ON u.user_id=uo.user_id
  WHERE u.username IN ('zhaoyongwei','zhuzhaocun','songlei','fuqiang','xiejiling','liujie','wangweihua','zhuzhao_an','liushanjun','ajian')
UNION ALL SELECT '司机(DRV-VTE)', count(*) FROM sal_drivers WHERE driver_code LIKE 'DRV-VTE-%'
UNION ALL SELECT '门店(STORE-)',  count(*) FROM mst_stores  WHERE store_code LIKE 'STORE-%'
UNION ALL SELECT '供应商(SUP-)',  count(*) FROM prc_suppliers WHERE supplier_code LIKE 'SUP-%'
UNION ALL SELECT '客户(sal_customers 总)', count(*) FROM sal_customers;

-- ── 2. 每人恰好一个主角色 ──────────────────────────────────────────────────────
\echo ''
\echo '【2】矩阵每人恰好 1 个主角色 is_primary=TRUE'
SELECT CASE WHEN bool_and(c=1) THEN '✅ PASS — 每人唯一主角色'
            ELSE '❌ FAIL — 存在 0 或多个主角色：'||string_agg(username||'('||c||')', ', ') FILTER (WHERE c<>1) END AS result
FROM (
  SELECT u.username, count(*) FILTER (WHERE ur.is_primary) AS c
  FROM sys_user u JOIN sys_user_role ur ON ur.user_id=u.user_id
  WHERE u.username IN ('zhaoyongwei','zhuzhaocun','songlei','fuqiang','xiejiling','liujie','wangweihua','zhuzhao_an','liushanjun','ajian')
  GROUP BY u.username
) t;

-- ── 3. 重复编码检查 ────────────────────────────────────────────────────────────
\echo ''
\echo '【3】主数据重复编码（应全为 0）'
SELECT '司机重复 driver_code' AS 检查, count(*) AS 重复数 FROM (SELECT driver_code FROM sal_drivers GROUP BY driver_code HAVING count(*)>1) a
UNION ALL SELECT '门店重复 store_code',     count(*) FROM (SELECT store_code FROM mst_stores GROUP BY store_code HAVING count(*)>1) b
UNION ALL SELECT '供应商重复 supplier_code', count(*) FROM (SELECT supplier_code FROM prc_suppliers GROUP BY supplier_code HAVING count(*)>1) c
UNION ALL SELECT '客户重复 customer_no',     count(*) FROM (SELECT customer_no FROM sal_customers GROUP BY customer_no HAVING count(*)>1) d
UNION ALL SELECT '用户重复 username',        count(*) FROM (SELECT username FROM sys_user GROUP BY username HAVING count(*)>1) e;

-- ── 4. 组织绑定有效性（org_code 必须在 sys_organizations 中存在）────────────────
\echo ''
\echo '【4】矩阵用户组织绑定均指向有效组织节点'
SELECT CASE WHEN count(*)=0 THEN '✅ PASS — 组织绑定均有效'
            ELSE '❌ FAIL — '||count(*)||' 条绑定指向不存在的组织' END AS result
FROM sys_user_orgs uo
JOIN sys_user u ON u.user_id=uo.user_id
WHERE u.username IN ('zhaoyongwei','zhuzhaocun','songlei','fuqiang','xiejiling','liujie','wangweihua','zhuzhao_an','liushanjun','ajian')
  AND NOT EXISTS (SELECT 1 FROM sys_organizations o WHERE o.id = uo.org_id);

\echo ''
\echo '════════════════════════════════════════════════════════════'
\echo '校验完成。任一 ❌ FAIL 或重复数>0 需排查。'
\echo '════════════════════════════════════════════════════════════'
