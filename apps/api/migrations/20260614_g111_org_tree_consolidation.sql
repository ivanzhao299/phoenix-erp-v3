-- ════════════════════════════════════════════════════════════════════════
-- G111 组织树收口（Stage 2）2026-06-14  ⚠️ 本地提交·未部署·待用户审核
-- ────────────────────────────────────────────────────────────────────────
-- 用户定稿的组织调整（法人树层面，不含 BU 解耦——那在 g112）：
--   1. 公司改名：COMP-LAO-XINGCHI → "老挝东鹏县星驰农业发展有限公司"（对齐用友）
--   2. 集团本部建 2 部门：人力资源与行政管理部、集团采购管理部
--   3. 财务中心拍平：ORG-FINANCE-CENTER 改名"集团财务管理部"+ 转 DEPARTMENT；
--      3 个财务小组(审核/资金/分析)的成员(刘杰/朱兆安/刘汉涛)重绑到它，再删 3 组
--   4. 删空占位：ORG-HQ(冗余总部)、BU-TRADING/BU-SCM(空事业群)、
--      3 个 PLANNED 场站(孟赛孵化/有机肥/万象饲料)及其下部门
-- ⚠️ 全程用 org_code 子查询解析 id（绝不硬编码 id，生产 id 不同）；幂等；to_regclass 守卫。
--    硬删除仅针对"空占位/已腾空"节点；删除按依赖序（子→父）。
-- ════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_group_id  BIGINT;
  v_fin_id    BIGINT;
BEGIN
  IF to_regclass('public.sys_organizations') IS NULL THEN RETURN; END IF;

  SELECT id INTO v_group_id FROM sys_organizations WHERE org_code = 'ORG-GROUP';
  SELECT id INTO v_fin_id   FROM sys_organizations WHERE org_code = 'ORG-FINANCE-CENTER';

  -- ── 1. 公司改名 ────────────────────────────────────────────────────────
  UPDATE sys_organizations
     SET org_name = '老挝东鹏县星驰农业发展有限公司',
         org_name_cn = '老挝东鹏县星驰农业发展有限公司',
         updated_at = NOW()
   WHERE org_code = 'COMP-LAO-XINGCHI';

  -- ── 2. 集团本部新建 2 部门（直挂集团 level2）──────────────────────────
  INSERT INTO sys_organizations (org_code, org_name, org_name_cn, parent_id, parent_code, org_type, level, path, status, sort_order, created_at, updated_at)
  SELECT v.code, v.nm, v.nm, v_group_id, 'ORG-GROUP', 'DEPARTMENT', 2, '/ORG-GROUP/'||v.code||'/', 'ACTIVE', v.so, NOW(), NOW()
  FROM (VALUES
    ('DEPT-HQ-HR-ADMIN',    '人力资源与行政管理部', 50),
    ('DEPT-HQ-PROCUREMENT', '集团采购管理部',       60)
  ) AS v(code, nm, so)
  WHERE NOT EXISTS (SELECT 1 FROM sys_organizations o WHERE o.org_code = v.code);

  -- ── 3. 财务中心拍平 ────────────────────────────────────────────────────
  -- 3a. 改名 + 转部门类型
  UPDATE sys_organizations
     SET org_name = '集团财务管理部', org_name_cn = '集团财务管理部',
         org_type = 'DEPARTMENT', sort_order = 40, updated_at = NOW()
   WHERE org_code = 'ORG-FINANCE-CENTER';
  -- 3b. 3 个小组成员重绑到"集团财务管理部"（按 org_code 解析 id）
  IF to_regclass('public.sys_user_orgs') IS NOT NULL AND v_fin_id IS NOT NULL THEN
    UPDATE sys_user_orgs
       SET org_id = v_fin_id
     WHERE org_id IN (SELECT id FROM sys_organizations
                       WHERE org_code IN ('DEPT-FIN-REVIEW','DEPT-FIN-TREASURY','DEPT-FIN-ANALYSIS'))
       -- 防 UNIQUE 冲突：若该用户已绑财务部则跳过
       AND NOT EXISTS (SELECT 1 FROM sys_user_orgs u2
                        WHERE u2.user_id = sys_user_orgs.user_id AND u2.org_id = v_fin_id);
  END IF;
  -- 3c. 删 3 个小组（成员已腾空）
  DELETE FROM sys_organizations
   WHERE org_code IN ('DEPT-FIN-REVIEW','DEPT-FIN-TREASURY','DEPT-FIN-ANALYSIS');

  -- ── 4. 删空占位（依赖序：先子部门，后场站/BU/总部）──────────────────
  -- 4a. 3 个 PLANNED 场站下的部门（按父关系，稳健）
  DELETE FROM sys_organizations
   WHERE parent_code IN ('SITE-MENGSAI-HATCHERY','SITE-MENGSAI-ORGANIC','SITE-VTE-FEED');
  -- 4b. 3 个 PLANNED 场站本体
  DELETE FROM sys_organizations
   WHERE org_code IN ('SITE-MENGSAI-HATCHERY','SITE-MENGSAI-ORGANIC','SITE-VTE-FEED');
  -- 4c. 2 个空事业群 + 冗余总部
  DELETE FROM sys_organizations
   WHERE org_code IN ('BU-TRADING','BU-SCM','ORG-HQ');

END $$;
