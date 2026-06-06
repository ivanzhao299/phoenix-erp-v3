-- ═════════════════════════════════════════════════════════════════════════════
-- G7 · 23 孤儿 active 用户分配 sys_user_orgs（DataScope 启用前提）
-- ═════════════════════════════════════════════════════════════════════════════
-- 现状（2026-06-06 SSH 实测）：
--   sys_user 41 active 用户中 23 个无任何 sys_user_orgs 记录 (56% 孤儿) →
--   DataScopeService 无法解析其组织范围 → 业务路径走 storeCode 字符串兜底，
--   跨站点漂移风险高。
--
-- 分配策略：
--   1. 超管 + 集团管理类（ALL 范围 + 管理类角色） → ORG-GROUP (id=9)
--   2. PILOT-MS 试运行 + STORE-MS（孟赛门店） → SITE-MENGSAI-LAYER (id=18)
--   3. STORE-VTE/BLX/HSI/SYB（万象/波利坎赛/沙耶武里）→ 暂绑 ORG-GROUP
--      待业务方在主数据中心精细调整到具体门店/SITE
--
-- 幂等：每条 INSERT WHERE NOT EXISTS 守卫，重复跑 0 行写入
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $body$
DECLARE
  inserted INT := 0;
  total_before INT;
  total_after INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='sys_user_orgs') THEN
    RAISE NOTICE '[g7_assign_orphan_users] sys_user_orgs 不存在（CI），跳过';
    RETURN;
  END IF;

  SELECT count(*) INTO total_before FROM sys_user_orgs;

  -- ── 1. ALL 范围 + 管理类（10 用户） → ORG-GROUP (id=9) ──────────────────────
  EXECUTE $$INSERT INTO sys_user_orgs (user_id, org_id, org_code, is_primary, role_scope, data_scope_level, created_at)
            SELECT u.user_id, 9, 'ORG-GROUP', true, 'GROUP', 'GROUP', now()
              FROM sys_user u
             WHERE u.username IN ('admin','xuefeng','guodapeng','songshoujiang','tangzhiwen',
                                  'gaoyang','fanzhenhao','qiantao','chenyifei','xuegang')
               AND NOT EXISTS (SELECT 1 FROM sys_user_orgs uo WHERE uo.user_id=u.user_id)$$;

  -- ── 2. 孟赛试运行 + 孟赛门店（8 用户） → SITE-MENGSAI-LAYER (id=18) ────────
  EXECUTE $$INSERT INTO sys_user_orgs (user_id, org_id, org_code, is_primary, role_scope, data_scope_level, created_at)
            SELECT u.user_id, 18, 'SITE-MENGSAI-LAYER', true, 'SITE', 'SITE', now()
              FROM sys_user u
             WHERE u.username IN ('chenling','pilot_sales','pilot_cashier','pilot_driver',
                                  'pilot_wms','pilot_finance','pilot_manager')
               AND NOT EXISTS (SELECT 1 FROM sys_user_orgs uo WHERE uo.user_id=u.user_id)$$;

  -- ── 3. 万象/波利坎赛/沙耶武里门店用户（6 用户） → 暂绑 ORG-GROUP ───────────
  --     业务方应在主数据中心调整到对应具体门店 SITE
  EXECUTE $$INSERT INTO sys_user_orgs (user_id, org_id, org_code, is_primary, role_scope, data_scope_level, created_at)
            SELECT u.user_id, 9, 'ORG-GROUP', true, 'GROUP', 'GROUP', now()
              FROM sys_user u
             WHERE u.username IN ('store_mgr1','cashier','alue','bouavanh','langshipei','xiaolan')
               AND NOT EXISTS (SELECT 1 FROM sys_user_orgs uo WHERE uo.user_id=u.user_id)$$;

  SELECT count(*) INTO total_after FROM sys_user_orgs;
  inserted := total_after - total_before;
  RAISE NOTICE '[g7_assign_orphan_users] 完成 — sys_user_orgs 行数 % → %, 新增 % 行', total_before, total_after, inserted;
END $body$;

COMMIT;

-- ─── 验证 SQL ──────────────────────────────────────────
-- SELECT count(*) FROM sys_user u
--  WHERE u.status=1 AND NOT EXISTS (SELECT 1 FROM sys_user_orgs uo WHERE uo.user_id=u.user_id);
-- 期望：0（之前 23）

-- ─── 回滚 ──────────────────────────────────────────
-- DELETE FROM sys_user_orgs WHERE user_id IN (96,97,98,145,146,147,149,150,151,152,153,154,156,158,159,295,296,297,298,299,300,2944,2945)
--   AND created_at > '2026-06-06 14:00:00';
