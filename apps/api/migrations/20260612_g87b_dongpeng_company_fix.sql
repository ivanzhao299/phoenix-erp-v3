-- ════════════════════════════════════════════════════════════════════════
-- G87-B 东鹏归属纠错 — 东鹏养殖场/经营项目 属 老挝金三角兴驰农业（用户确认）
-- ────────────────────────────────────────────────────────────────────────
-- 纠错：G87 把 FARM-DP 错挂 COMP-LAO-AGRI；溯源发现 biz_projects 种子里
--      PRJ_DONGPENG_LAYER 的 company_code 同样错为 AGRI（错误依据源头）。
-- 正确归属（用户确认 + G81 门店入树佐证：东鹏直营店即挂兴驰）：
--      孟赛养殖场 → COMP-LAO-AGRI（老挝凤凰农业发展有限公司）✓ 不变
--      东鹏养殖场 → COMP-LAO-XINGCHI（老挝金三角兴驰农业开发有限公司）← 本次纠正
-- 幂等：UPDATE 仅在值不正确时生效；brd_farms 带 to_regclass 守卫（CI 库无此表）。
-- ════════════════════════════════════════════════════════════════════════

-- ① 养殖场归属纠正（生产）
DO $$
BEGIN
  IF to_regclass('public.brd_farms') IS NOT NULL THEN
    UPDATE brd_farms SET company_code = 'COMP-LAO-XINGCHI'
    WHERE farm_code = 'FARM-DP'
      AND (company_code IS DISTINCT FROM 'COMP-LAO-XINGCHI');
  END IF;
END $$;

-- ② 东鹏经营项目归属纠正（biz_projects 种子源头错误）
UPDATE biz_projects SET company_code = 'COMP-LAO-XINGCHI', updated_at = now()
WHERE project_code = 'PRJ_DONGPENG_LAYER'
  AND company_code = 'COMP-LAO-AGRI';
