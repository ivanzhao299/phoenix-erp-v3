-- ════════════════════════════════════════════════════════════════════════
-- G98 股东按公司看养殖每日数据 + 撤回区域督导误授（2026-06-13）
-- ────────────────────────────────────────────────────────────────────────
-- 用户校正：
--   ① 按「公司」而非「农场」给股东开放——农场归属公司，在公司有股就看该公司农场每日数据
--      （配合后端 farm 读取新增 company_code 维度，取代旧 storeCode 单 token 隔离）。
--   ② 区域督导 ROLE_REGION_MGR = 销售督导，不属生产/场长线 → 撤回 G97 给它授的 MENU_FARM_DATA:V。
-- ════════════════════════════════════════════════════════════════════════

-- ① 撤回 G97 给区域督导授的 MENU_FARM_DATA:V（保留其 g5a 既有的 MENU_FARM_DAILY:V 不动）
DELETE FROM sys_role_menu_permission p
USING sys_role r, sys_menu m
WHERE p.role_id = r.role_id AND p.menu_id = m.menu_id
  AND r.role_code = 'ROLE_REGION_MGR' AND m.menu_code = 'MENU_FARM_DATA';

-- ② 按公司绑定股东用户（数据驱动：持股项目→所属公司；仅绑「有养殖场」的公司，排除食品厂）
--    is_primary=false 追加绑定，不动其主组织/既有岗位范围；data_scope_level=COMPANY。
--    brd_flocks 为生产侧表（CI 测试库可能无）→ to_regclass 守卫。
DO $$
BEGIN
  IF to_regclass('public.brd_flocks') IS NOT NULL
     AND to_regclass('public.shr_project_equity') IS NOT NULL
     AND to_regclass('public.shr_shareholders') IS NOT NULL
     AND to_regclass('public.shr_projects') IS NOT NULL THEN
    INSERT INTO sys_user_orgs (user_id, org_id, is_primary, data_scope_level)
    SELECT DISTINCT sh.linked_user_id::bigint, o.id, false, 'COMPANY'
    FROM shr_project_equity pe
    JOIN shr_shareholders sh ON sh.shareholder_code = pe.shareholder_code
    JOIN shr_projects prj   ON prj.project_code   = pe.project_code
    JOIN sys_organizations o ON o.org_code = prj.company_code AND o.org_type = 'COMPANY'
    WHERE sh.linked_user_id IS NOT NULL
      AND prj.company_code IS NOT NULL
      -- 仅「有养殖场数据」的公司（brd_flocks 出现过的 company_code）→ 天然排除万象食品厂
      AND prj.company_code IN (SELECT DISTINCT company_code FROM brd_flocks WHERE company_code IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM sys_user_orgs uo
        WHERE uo.user_id = sh.linked_user_id::bigint AND uo.org_id = o.id
      );
  END IF;
END $$;
