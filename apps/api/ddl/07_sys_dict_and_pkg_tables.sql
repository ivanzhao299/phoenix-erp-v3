-- ============== V3 包装模块表补齐 (pkg_shifts / pkg_tasks ALTER) ==============
-- [V3 完整化] pkg_shifts 和 pkg_tasks 表已存在但 schema 不匹配 packaging.service.ts 期望
-- 用 ALTER TABLE ADD COLUMN IF NOT EXISTS 模式补齐缺失列, 不动现有数据
-- 修复点:
--   - pkg_shifts: 加 completed_at(TIMESTAMP)、qualified_qty、reopen_reason、created_by、updated_by、created_at
--   - pkg_tasks: 加 shift_id(FK)、house_code、task_type、graded_at/by、completed_at/by、created_by;
--     另外 service.ts 写 presort_xl/dirty/broken 但表里是 presort_xl_qty/dirty_qty/broken_qty
--     → 不改表(避免破坏 Antigravity 既有逻辑), 改在 service.ts SQL 用现有列名
-- 全部可重复执行

-- ────────────────────────────────────────────────────────────────
-- 1. pkg_shifts 补齐 packaging.service.ts 期望的列
-- ────────────────────────────────────────────────────────────────
ALTER TABLE pkg_shifts ADD COLUMN IF NOT EXISTS completed_at    TIMESTAMP;
ALTER TABLE pkg_shifts ADD COLUMN IF NOT EXISTS qualified_qty   INT NOT NULL DEFAULT 0;
ALTER TABLE pkg_shifts ADD COLUMN IF NOT EXISTS reopen_reason   TEXT;
ALTER TABLE pkg_shifts ADD COLUMN IF NOT EXISTS created_by      BIGINT;
ALTER TABLE pkg_shifts ADD COLUMN IF NOT EXISTS updated_by      BIGINT;
ALTER TABLE pkg_shifts ADD COLUMN IF NOT EXISTS created_at      TIMESTAMP NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_pkg_shifts_date_status ON pkg_shifts (shift_date, status);
CREATE INDEX IF NOT EXISTS idx_pkg_shifts_house ON pkg_shifts (house_code);

-- ────────────────────────────────────────────────────────────────
-- 2. pkg_tasks 补齐 packaging.service.ts 期望的列
-- ────────────────────────────────────────────────────────────────
ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS shift_id        BIGINT;
ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS house_code      VARCHAR(64);
ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS task_type       VARCHAR(32) NOT NULL DEFAULT 'GRADING';
ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS graded_at       TIMESTAMP;
ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS graded_by       BIGINT;
ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS completed_at    TIMESTAMP;
ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS completed_by    BIGINT;
ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS created_by      BIGINT;

CREATE INDEX IF NOT EXISTS idx_pkg_tasks_status ON pkg_tasks (task_type, status);
CREATE INDEX IF NOT EXISTS idx_pkg_tasks_shift ON pkg_tasks (shift_id);

-- ────────────────────────────────────────────────────────────────
-- 3. 列名映射: packaging.service.ts 写 presort_xl, 但表里是 presort_xl_qty
--    采用 ALIAS 视图? Postgres 没原生 column alias. 改 service.ts 是更小风险路径,
--    但这超出本 DDL 范围. 本文件不动这部分, 由后续 commit 在 service.ts 中改 SQL.
-- ────────────────────────────────────────────────────────────────
