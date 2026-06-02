-- ════════════════════════════════════════════════════════════════════════
-- Workflow 表单运行时 — 修复 wf_form_definition 列漂移(HTTP 400 根因)
-- ────────────────────────────────────────────────────────────────────────
-- 背景：wf_form_definition 由 WorkflowService.ensureSchema() 的 CREATE TABLE 建表，
--   但旧建表 DDL 缺少 biz_type / module_code / remark 三列；
--   而 createForm() INSERT、listForms() SELECT 均引用这三列 →
--   PostgreSQL 报"列不存在"(42703) → 全局异常过滤器映射为 HTTP 400 →
--   /workflow/forms/runtime 页面"HTTP 400"、表单列表加载失败。
-- 修复：幂等补齐三列(ADD COLUMN IF NOT EXISTS)。
-- 表不存在时跳过(运行时 ensureSchema 会建含新列的表)。
-- ════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('public.wf_form_definition') IS NOT NULL THEN
    ALTER TABLE wf_form_definition ADD COLUMN IF NOT EXISTS biz_type    VARCHAR(64);
    ALTER TABLE wf_form_definition ADD COLUMN IF NOT EXISTS module_code VARCHAR(64);
    ALTER TABLE wf_form_definition ADD COLUMN IF NOT EXISTS remark      TEXT;
  END IF;
END $$;
