-- ============================================================
-- Role Runtime Phase C — 生产验证脚本
-- 用法：psql -U <user> -d <db> -f scripts/check-role-runtime-phase-c.sql
--
-- 检查 6 项关键修复是否真正落库。每项输出 PASS / FAIL。
-- 任一 FAIL 说明对应迁移未生效，需排查（结合修复后的 deploy.yml 红灯机制）。
-- ============================================================

\echo '════════════════════════════════════════════════════════════'
\echo 'Role Runtime Phase C — 生产验证'
\echo '════════════════════════════════════════════════════════════'

-- ── 检查 1：sys_user_orgs CHECK 约束允许 SITE ─────────────────────────────────
\echo ''
\echo '【检查1】sys_user_orgs.data_scope_level CHECK 允许 SITE'
SELECT
  CASE WHEN pg_get_constraintdef(oid) LIKE '%SITE%'
       THEN '✅ PASS — CHECK 约束已包含 SITE'
       ELSE '❌ FAIL — CHECK 约束缺 SITE（Phase B 绑定会回滚）'
  END AS result
FROM pg_constraint
WHERE conrelid = 'sys_user_orgs'::regclass
  AND contype = 'c'
  AND conname LIKE '%scope_level%';

-- ── 检查 2：sys_organizations 关键组织节点存在 ────────────────────────────────
\echo ''
\echo '【检查2】sys_organizations 关键节点（集团/事业群/公司/场区）'
SELECT
  CASE WHEN COUNT(*) FILTER (WHERE org_code = 'ORG-GROUP') = 1
        AND COUNT(*) FILTER (WHERE org_code = 'BU-AGRI')  = 1
        AND COUNT(*) FILTER (WHERE org_code = 'BU-FOOD')  = 1
        AND COUNT(*) FILTER (WHERE org_code = 'COMP-LAO-AGRI')    = 1
        AND COUNT(*) FILTER (WHERE org_code = 'COMP-LAO-FOOD')    = 1
        AND COUNT(*) FILTER (WHERE org_code = 'COMP-LAO-XINGCHI') = 1
        AND COUNT(*) FILTER (WHERE org_code = 'SITE-VTE-SLAUGHTER') = 1
       THEN '✅ PASS — 关键组织节点齐全（' || COUNT(*) || ' 个节点）'
       ELSE '❌ FAIL — 组织树不完整（仅 ' || COUNT(*) || ' 个节点）'
  END AS result
FROM sys_organizations;

-- ── 检查 3：sys_user_orgs 有预期绑定 ──────────────────────────────────────────
\echo ''
\echo '【检查3】sys_user_orgs 用户绑定数（预期 ≥ 10）'
SELECT
  CASE WHEN COUNT(*) >= 10
       THEN '✅ PASS — ' || COUNT(*) || ' 条用户组织绑定'
       ELSE '❌ FAIL — 仅 ' || COUNT(*) || ' 条绑定（Phase B 可能未落库）'
  END AS result
FROM sys_user_orgs;

-- ── 检查 4：ROLE_DRIVER 无 ALL 范围（安全红线）────────────────────────────────
\echo ''
\echo '【检查4】司机角色无 store_code=ALL 全局超权'
SELECT
  CASE WHEN COUNT(*) = 0
       THEN '✅ PASS — 无司机持 store_code=ALL'
       ELSE '❌ FAIL — ' || COUNT(*) || ' 个司机仍全局超权：' || string_agg(u.username, ', ')
  END AS result
FROM sys_user u
JOIN sys_user_role ur ON ur.user_id = u.user_id
JOIN sys_role r ON r.role_id = ur.role_id
WHERE r.role_code = 'ROLE_DRIVER' AND u.store_code = 'ALL';

-- ── 检查 5：司机已绑定 SITE 范围（精确隔离）──────────────────────────────────
\echo ''
\echo '【检查5】司机 ajian 已绑定 SITE 组织'
SELECT
  CASE WHEN COUNT(*) >= 1
       THEN '✅ PASS — 司机已绑定 SITE 组织'
       ELSE '⚠️ WARN — 司机未绑定 SITE（需业务确认配送场区归属）'
  END AS result
FROM sys_user u
JOIN sys_user_orgs uo ON uo.user_id = u.user_id
JOIN sys_organizations o ON o.id = uo.org_id
WHERE u.username = 'ajian' AND o.org_type = 'SITE';

-- ── 检查 6：MENU_WORKFLOW 审批权限（需通过应用层矩阵，DB 侧检查 sys_role_menu_permission）─
\echo ''
\echo '【检查6】审批角色在 sys_role_menu_permission 持 MENU_WORKFLOW'
\echo '         （注：API 鉴权真实源是 rbac.matrix.ts，此处仅查 Sidebar 可见性数据）'
SELECT
  r.role_code,
  CASE WHEN EXISTS (
    SELECT 1 FROM sys_role_menu_permission rmp
    JOIN sys_menu m ON m.menu_id = rmp.menu_id
    WHERE rmp.role_id = r.role_id AND m.menu_code = 'MENU_WORKFLOW'
      AND rmp.perm_codes LIKE '%A%'
  ) THEN '✅ 有审批权' ELSE '— 无（依赖 rbac.matrix.ts）' END AS workflow_approve
FROM sys_role r
WHERE r.role_code IN ('ROLE_PRC_BUYER','ROLE_VET','ROLE_QA_MGR','ROLE_WMS_MGR','ROLE_FARM_MGR')
ORDER BY r.role_code;

\echo ''
\echo '════════════════════════════════════════════════════════════'
\echo '验证完成。任一项未通过即需排查对应迁移。'
\echo '════════════════════════════════════════════════════════════'
