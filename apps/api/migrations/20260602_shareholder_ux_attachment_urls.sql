-- ════════════════════════════════════════════════════════════════════════
-- Shareholder Runtime UX Enhancement — 资本流附件 URL 持久化
-- ────────────────────────────────────────────────────────────────────────
-- 为 shr_capital_contributions 增加 attachment_urls(jsonb) 列，持久化附件 URL 列表。
-- 复用现有 /api/upload/contract 上传通道(本地落盘 + /uploads 静态访问)与 FileUploadInput。
-- 与 finance-v2 的 attachment_urls jsonb 范式一致。attachment_count 已存在,同步维护。
--
-- 不改状态机/业务逻辑/股权结构；仅新增一个可空列(向后兼容,历史数据不受影响)。
-- 幂等：ADD COLUMN IF NOT EXISTS。
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE shr_capital_contributions
  ADD COLUMN IF NOT EXISTS attachment_urls jsonb;
