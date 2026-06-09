-- ════════════════════════════════════════════════════════════════════════
-- G64：归档 product_grades 的 UAT 测试残留等级
-- ════════════════════════════════════════════════════════════════════════
-- 现象：product_grades 含一条 GRD-001 / 'UAT-P0 Grade' / PENDING_APPROVAL 测试残留，
--   污染等级主数据（虽未 ACTIVE 故 useProductGrades 不显示，但应清理）。
-- 处理：归档（status=ARCHIVED）而非删除——非破坏性，保留审计痕迹。
-- 幂等：仅命中该测试行。
-- ════════════════════════════════════════════════════════════════════════

UPDATE product_grades
SET status = 'ARCHIVED', updated_at = now()
WHERE grade_code = 'GRD-001'
  AND grade_name = 'UAT-P0 Grade'
  AND status = 'PENDING_APPROVAL';
