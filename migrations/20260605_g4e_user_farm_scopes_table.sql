-- ═════════════════════════════════════════════════════════════════════════════
-- sys_user_farm_scopes 表 — 补建（G4-E 阶段 entity 已存在但生产 DDL 缺失）
-- ═════════════════════════════════════════════════════════════════════════════
-- 发现：执行宋明光重对齐 migration 时，INSERT INTO sys_user_farm_scopes 报
--   "relation sys_user_farm_scopes does not exist"。G4-E 阶段在 entity 中
--   定义但 schema 文件未建表，导致 DataScope 的 allowedFarmCodes 一直没数据。
--
-- 本 migration 补齐 DDL，配合 entity 实现完整 G4-E FarmScope 能力。
-- 全程幂等（CREATE TABLE IF NOT EXISTS）。
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS sys_user_farm_scopes (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL,
  farm_code  VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_farm UNIQUE (user_id, farm_code)
);

CREATE INDEX IF NOT EXISTS idx_user_farm_scope_user ON sys_user_farm_scopes (user_id);
CREATE INDEX IF NOT EXISTS idx_user_farm_scope_farm ON sys_user_farm_scopes (farm_code);

COMMENT ON TABLE sys_user_farm_scopes IS
  '用户对场站 (brd_farms.farm_code) 的额外授权（G4-E：与 warehouse/project 同层）。'
  'DataScopeService.resolve() 用此表填充 ctx.allowedFarmCodes。';

COMMIT;
