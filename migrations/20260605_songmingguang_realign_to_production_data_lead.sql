-- ═════════════════════════════════════════════════════════════════════════════
-- 宋明光：岗位重对齐为"孟赛生产数据主管"（不再是养殖场长 + 出纳）
-- ═════════════════════════════════════════════════════════════════════════════
-- 前置依赖：必须已跑过
--   · 20260605_mengsai_production_data_lead_role.sql  → 创建新角色
--   · GLP-1A-2 系列 → brd_farms.LPH_MENGSAI 等主数据已建
--
-- 本 migration 做 4 件事：
--   1) 解绑 ROLE_FARM_MGR + ROLE_CASH（之前 GLP-1A-2 阶段错绑）
--   2) 绑定 ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR 为 primary
--   3) sys_user_farm_scopes 加 LPH_MENGSAI（孟赛蛋鸡场范围）
--   4) sys_user_orgs 修改 data_scope_level 为 COMPANY（不再 GROUP/全局）
--   5) perms_version+1 让 token 重算
--
-- 全程幂等。**请勿在生产 DB 直接执行**（按业务方要求，等专项授权后再跑）。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) 解绑旧角色（FARM_MGR + CASH）
DELETE FROM sys_user_role
 WHERE user_id = (SELECT user_id FROM sys_user WHERE username='songmingguang')
   AND role_id IN (
     SELECT role_id FROM sys_role
      WHERE role_code IN ('ROLE_FARM_MGR','ROLE_CASH')
   );

-- 2) 绑定新角色为 primary
INSERT INTO sys_user_role (user_id, role_id, is_primary, is_visible)
SELECT u.user_id, r.role_id, true, true
  FROM sys_user u, sys_role r
 WHERE u.username='songmingguang'
   AND r.role_code='ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR'
   AND NOT EXISTS (
     SELECT 1 FROM sys_user_role ur
      WHERE ur.user_id=u.user_id AND ur.role_id=r.role_id
   );
-- 若已存在该绑定，确保 is_primary=true、is_visible=true
UPDATE sys_user_role
   SET is_primary = true,
       is_visible = true
 WHERE user_id = (SELECT user_id FROM sys_user WHERE username='songmingguang')
   AND role_id = (SELECT role_id FROM sys_role WHERE role_code='ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR');

-- 3) sys_user_farm_scopes：加 LPH_MENGSAI（孟赛蛋鸡场场站范围）
-- 该表用于 DataScopeService.allowedFarmCodes 计算
INSERT INTO sys_user_farm_scopes (user_id, farm_code, created_at)
SELECT u.user_id, 'LPH_MENGSAI', now()
  FROM sys_user u
 WHERE u.username='songmingguang'
   AND NOT EXISTS (
     SELECT 1 FROM sys_user_farm_scopes ufs
      WHERE ufs.user_id=u.user_id AND ufs.farm_code='LPH_MENGSAI'
   );

-- 4) sys_user_orgs：COMPANY 级（GLP-1A-2 finalize 已设过；这里 idempotent 巩固）
UPDATE sys_user_orgs
   SET data_scope_level='COMPANY', role_scope='COMPANY'
 WHERE user_id = (SELECT user_id FROM sys_user WHERE username='songmingguang')
   AND org_code='COMP-LAO-AGRI';

UPDATE sys_user_orgs
   SET data_scope_level='SITE', role_scope='SITE'
 WHERE user_id = (SELECT user_id FROM sys_user WHERE username='songmingguang')
   AND org_code='SITE-MENGSAI-LAYER';

-- 5) note 字段 + perms_version+1
UPDATE sys_user
   SET note = '孟赛生产数据主管 · 数据范围限定 COMP-LAO-AGRI / LPH_MENGSAI / 1-6 号鸡舍',
       perms_version = COALESCE(perms_version,0) + 1,
       updated_at = now()
 WHERE username='songmingguang';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- 验证 SQL：
--   SELECT r.role_code, ur.is_primary, ur.is_visible FROM sys_user_role ur
--     JOIN sys_role r ON r.role_id=ur.role_id
--     JOIN sys_user u ON u.user_id=ur.user_id
--    WHERE u.username='songmingguang' ORDER BY ur.is_primary DESC;
--   -- 期望：仅 ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR (primary=t, visible=t)
--
--   SELECT farm_code FROM sys_user_farm_scopes
--    WHERE user_id=(SELECT user_id FROM sys_user WHERE username='songmingguang');
--   -- 期望：LPH_MENGSAI
--
--   SELECT org_code, data_scope_level FROM sys_user_orgs
--    WHERE user_id=(SELECT user_id FROM sys_user WHERE username='songmingguang');
--   -- 期望：COMP-LAO-AGRI(COMPANY) + SITE-MENGSAI-LAYER(SITE)
-- ═════════════════════════════════════════════════════════════════════════════
