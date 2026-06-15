-- ════════════════════════════════════════════════════════════════════════
-- G122 同步 sys_user.store_code = 主组织 org_code（修系统性数据范围错位）2026-06-15
-- ────────────────────────────────────────────────────────────────────────
-- 根因（impersonate 实测发现）：行级数据范围过滤实际由 sys_user.store_code 驱动
--   （generic-crud：effectiveQuery[scopeField]=userStoreCode），但 G114 只更新了
--   sys_user_orgs 绑定、没同步 store_code → 32 在岗用户 store_code 多为陈旧码
--   （FARM-MS / STORE-MS-001 / AREA-ZHU…），与 G113/G114 对齐后的 org_code 对不上
--   → 场长看空养殖总览、店长看空销售等"假空"现象。
-- 修复：store_code ← 主绑定 org_code；GROUP 级 → 'ALL'（generic-crud isGlobal）。
--   维度自动对齐：场长→SITE码(brd mapped_site_code)、店长→STORE码(pos_/store_)、
--   公司角色→COMPANY码、集团/超管→'ALL'。
-- 仅 ACTIVE 用户；perms_version+1 强制重登拿新 storeCode。幂等。
-- ════════════════════════════════════════════════════════════════════════

UPDATE sys_user u
   SET store_code = sub.code,
       perms_version = COALESCE(u.perms_version, 0) + 1,
       updated_at = NOW()
  FROM (
    SELECT uo.user_id,
           CASE WHEN uo.data_scope_level = 'GROUP' THEN 'ALL' ELSE uo.org_code END AS code
      FROM sys_user_orgs uo
     WHERE uo.is_primary = true
  ) sub
 WHERE u.user_id = sub.user_id
   AND u.status = 1
   AND COALESCE(u.store_code, '') <> sub.code;  -- 幂等：仅在不一致时更新
