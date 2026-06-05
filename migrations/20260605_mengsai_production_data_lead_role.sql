-- ═════════════════════════════════════════════════════════════════════════════
-- 新增角色 + 菜单矩阵：孟赛生产数据主管
-- ═════════════════════════════════════════════════════════════════════════════
-- 业务背景：
--   宋明光承担"孟赛蛋鸡养殖场生产数据收集、整理、上传、提交、异常备注"，
--   不是养殖场长（FARM_MGR）也不是出纳（CASH）。需要独立角色，定位为
--   "生产数据主管"，仅限孟赛蛋鸡场的数据范围。
--
-- 本 migration 不绑定具体用户。用户绑定见 20260605_songmingguang_realign.sql。
-- 全程幂等（NOT EXISTS 守卫）。**请勿在生产 DB 直接执行**（按业务方要求）。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) 新增角色 ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR ─────────────────────
INSERT INTO sys_role (role_code, role_name_zh, role_type, approval_level, description)
SELECT
  'ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR',
  '孟赛生产数据主管',
  'PRODUCTION',
  0,
  '孟赛蛋鸡养殖场生产数据收集、整理、上传、提交、异常备注岗位。' ||
  '仅录入和提交，无审批权；数据范围限定 COMP-LAO-AGRI / 孟赛蛋鸡养殖场 / 1-6 号鸡舍。' ||
  '禁止跨场查看、删历史、改主数据、改财务、看销售价格、看客户欠款、用户管理、系统设置。'
WHERE NOT EXISTS (SELECT 1 FROM sys_role WHERE role_code='ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR');

-- ── 2) 菜单 × 操作权限矩阵 ──────────────────────────────────────────────────
-- perm_codes: V=查看 C=新增 E=编辑 D=删除 A=审批 X=导出
-- 该岗位需要：录入(C) + 编辑未提交/被退回(E) + 查看本人提交(V) + 查看孟赛看板(V)。
-- 不需要：D（不能删历史）/A（不能审批）/X（不能全局导出）
--
-- 11 个许可菜单对应实际系统已存在菜单的映射：
--   1) 生产日报录入        → MENU_FARM_DAILY / MOBILE_HENREPORT
--   2) 生产日报上传        → MENU_PROD_INBOUND
--   3) 鸡舍生产数据        → MENU_FARM_DATA（仅 V，业务定位是"查看本场"，非维护主数据）
--   4) 鸡蛋分级统计        → MOBILE_EGGLOG / MOBILE_EGG
--   5) 饲料消耗登记        → MOBILE_FEED
--   6) 库存入库登记        → MENU_PROD_INBOUND（鸡蛋入库走该入口；原料走 MENU_INV_MANUAL_INBOUND）
--   7) 库存出库登记        → MENU_PROD_COLLECTION（集蛋记录）+ MENU_WMS_INOUT（原料出库）
--   8) 附件上传            → 复用 MENU_FARM_DAILY（已含 attachment uploader）
--   9) 我的提交记录        → MENU_WORKFLOW（V）— 仅看本人发起的实例
--  10) 孟赛生产看板        → MENU_DASHBOARD（V）+ MOBILE_DASHBOARD（V）
--  11) 异常提示查看        → MENU_FARM_QA（V）— 现有质检异常提示菜单
--
-- 注：业务方提供的菜单清单偏概念，实际映射到现有 sys_menu。未来如需独立"孟赛
-- 生产看板"等专用菜单，可在 GLP-1A-3 阶段单独建。

DO $$
DECLARE
  role_id_v BIGINT;
  m_id BIGINT;
  spec RECORD;
BEGIN
  SELECT role_id INTO role_id_v FROM sys_role
   WHERE role_code='ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR';
  IF role_id_v IS NULL THEN
    RAISE NOTICE 'Role not seeded, skip menu perms';
    RETURN;
  END IF;

  FOR spec IN
    SELECT * FROM (VALUES
      ('MENU_DASHBOARD',         'V'),       -- 工作台 / 孟赛生产看板
      ('MENU_FARM_DAILY',        'V,E'),     -- 鸡舍日报（录入和编辑未提交）
      ('MENU_FARM_DATA',         'V'),       -- 养殖数据（仅查看本场）
      ('MENU_FARM_QA',           'V'),       -- 异常提示查看
      ('MENU_PROD_COLLECTION',   'V,C,E'),   -- 集蛋记录（录入鸡蛋分级）
      ('MENU_PROD_INBOUND',      'V,C,E'),   -- 日产蛋入库 / 鸡蛋分级统计
      ('MENU_INV_MANUAL_INBOUND','V,C'),     -- 原料库存入库
      ('MENU_WMS_INOUT',         'V,C'),     -- 出入库作业（饲料消耗）
      ('MENU_WMS_VIEW',          'V'),       -- 仓储查看
      ('MENU_WORKFLOW',          'V'),       -- 我的提交记录（工作流）
      ('MOBILE_DASHBOARD',       'V'),       -- 移动看板
      ('MOBILE_HENREPORT',       'V,C'),     -- 存栏日报
      ('MOBILE_MORTALITY',       'V,C'),     -- 死淘快录
      ('MOBILE_EGGLOG',          'V,C'),     -- 产蛋录入
      ('MOBILE_EGG',             'V,C'),     -- 鸡蛋台账
      ('MOBILE_FEED',            'V,C')      -- 饲料台账
    ) AS t(menu_code, perm_codes)
  LOOP
    SELECT menu_id INTO m_id FROM sys_menu WHERE menu_code = spec.menu_code;
    IF m_id IS NULL THEN
      RAISE NOTICE 'menu % missing, skip', spec.menu_code;
      CONTINUE;
    END IF;
    INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
    SELECT role_id_v, m_id, spec.perm_codes
    WHERE NOT EXISTS (
      SELECT 1 FROM sys_role_menu_permission
       WHERE role_id = role_id_v AND menu_id = m_id
    );
  END LOOP;
END $$;

-- ── 3) sys_data_scopes：限定数据范围为 COMPANY 级 ──────────────────────────
-- 该角色在所有"业务大类"菜单下，最高范围 = COMPANY（公司级），不可 REGION/GROUP。
-- 配合 sys_user_orgs.data_scope_level=COMPANY + sys_user_farm_scopes 进一步限定
-- 到具体公司 + 具体场站。
INSERT INTO sys_data_scopes (role_code, module_code, scope_type, enabled, created_at)
SELECT 'ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR', m, 'COMPANY', true, now()
  FROM unnest(ARRAY[
    'MENU_DASHBOARD',
    'MENU_FARM_DAILY','MENU_FARM_DATA','MENU_FARM_QA',
    'MENU_PROD_COLLECTION','MENU_PROD_INBOUND',
    'MENU_INV_MANUAL_INBOUND','MENU_WMS_INOUT','MENU_WMS_VIEW',
    'MENU_WORKFLOW'
  ]) AS m
WHERE NOT EXISTS (
  SELECT 1 FROM sys_data_scopes
   WHERE role_code='ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR' AND module_code=m
);

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- 验证 SQL：
--   SELECT count(*) FROM sys_role WHERE role_code='ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR';  -- 1
--   SELECT count(*) FROM sys_role_menu_permission rmp
--     JOIN sys_role r ON r.role_id=rmp.role_id
--    WHERE r.role_code='ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR';  -- ≈16
--   SELECT count(*) FROM sys_data_scopes
--    WHERE role_code='ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR';    -- 10
-- ═════════════════════════════════════════════════════════════════════════════
