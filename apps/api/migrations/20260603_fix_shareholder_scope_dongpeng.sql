-- ════════════════════════════════════════════════════════════════════════
-- 修复：东鹏股东 scope 缺失（朱召安 username 拼写不匹配 + 陈逸飞 scope 漏建）
-- ────────────────────────────────────────────────────────────────────────
-- 根因：
--   · 朱召安（SHR-ZHU-ZHAOAN）：sys_user.username='zhuzhao_an'（含下划线），
--     原迁移 JOIN 条件写的是 'zhuzhaoan'（无下划线），匹配失败，scope 未插入。
--   · 陈逸飞（SHR-CHEN-YIFEI）：原迁移未建 scope 记录（漏建）。
-- 修复：
--   · 朱召安：按 real_name='朱召安' 精确匹配，避免 username 拼写歧义。
--   · 陈逸飞：按 real_name='陈逸飞' 精确匹配；若生产库无此账号则静默跳过。
-- 全部幂等：WHERE NOT EXISTS 守卫，可重复执行。
-- ════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('public.shr_shareholder_scopes') IS NOT NULL THEN

    -- ① 朱召安 → 东鹏蛋鸡养殖场（PROJECT 级）
    INSERT INTO shr_shareholder_scopes
      (user_id, shareholder_code, scope_type, scope_code, project_code, can_approve, status)
    SELECT u.user_id, 'SHR-ZHU-ZHAOAN', 'PROJECT', 'SITE-DONGPENG-LAYER', 'SHR-DONGPENG-LAYER', FALSE, 'ACTIVE'
    FROM sys_user u
    WHERE u.real_name = '朱召安'
      AND NOT EXISTS (
        SELECT 1 FROM shr_shareholder_scopes s
        WHERE s.user_id = u.user_id
          AND s.shareholder_code = 'SHR-ZHU-ZHAOAN'
          AND s.project_code = 'SHR-DONGPENG-LAYER'
      );

    -- ② 陈逸飞 → 东鹏蛋鸡养殖场（PROJECT 级）
    --    若生产库无陈逸飞账号则静默跳过（0行插入）
    INSERT INTO shr_shareholder_scopes
      (user_id, shareholder_code, scope_type, scope_code, project_code, can_approve, status)
    SELECT u.user_id, 'SHR-CHEN-YIFEI', 'PROJECT', 'SITE-DONGPENG-LAYER', 'SHR-DONGPENG-LAYER', FALSE, 'ACTIVE'
    FROM sys_user u
    WHERE u.real_name = '陈逸飞'
      AND NOT EXISTS (
        SELECT 1 FROM shr_shareholder_scopes s
        WHERE s.user_id = u.user_id
          AND s.shareholder_code = 'SHR-CHEN-YIFEI'
          AND s.project_code = 'SHR-DONGPENG-LAYER'
      );

    RAISE NOTICE '东鹏股东scope修复完成（朱召安/陈逸飞 若无账号则跳过）';
  END IF;
END $$;
