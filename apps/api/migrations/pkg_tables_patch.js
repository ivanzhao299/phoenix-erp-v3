/**
 * Phoenix ERP V3 — 包装模块补充表 Migration
 * 建表：pkg_exceptions, pkg_label_prints
 * 同时给 pkg_tasks 补充包装相关字段（如不存在）
 * 运行方式：node migrations/pkg_tables_patch.js
 */

const { Client } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

async function run() {
  await client.connect();
  console.log('✅ 连接数据库成功');

  const sqls = [
    // ── pkg_exceptions ────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS pkg_exceptions (
       id            SERIAL PRIMARY KEY,
       nc_no         VARCHAR(64) UNIQUE,
       issue_type    VARCHAR(32) NOT NULL,
       severity      VARCHAR(16) DEFAULT 'LOW',
       batch_no      VARCHAR(64),
       store_code    VARCHAR(32),
       description   TEXT,
       action_taken  VARCHAR(32) DEFAULT 'PENDING',
       status        VARCHAR(32) DEFAULT 'OPEN',
       created_by    INTEGER,
       updated_by    INTEGER,
       created_at    TIMESTAMPTZ DEFAULT NOW(),
       updated_at    TIMESTAMPTZ DEFAULT NOW()
     )`,

    // 自动生成 nc_no
    `CREATE OR REPLACE FUNCTION pkg_exceptions_set_nc_no()
     RETURNS TRIGGER AS $$
     BEGIN
       IF NEW.nc_no IS NULL OR NEW.nc_no = '' THEN
         NEW.nc_no := 'EX-' || TO_CHAR(NOW(),'YYYYMMDD') || '-' || LPAD(NEW.id::text, 4, '0');
       END IF;
       RETURN NEW;
     END; $$ LANGUAGE plpgsql`,

    `DROP TRIGGER IF EXISTS trg_pkg_exceptions_nc_no ON pkg_exceptions`,
    `CREATE TRIGGER trg_pkg_exceptions_nc_no
     BEFORE INSERT ON pkg_exceptions
     FOR EACH ROW EXECUTE FUNCTION pkg_exceptions_set_nc_no()`,

    // ── pkg_label_prints ─────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS pkg_label_prints (
       id          SERIAL PRIMARY KEY,
       task_no     VARCHAR(64),
       batch_no    VARCHAR(64),
       sku_code    VARCHAR(32),
       pack_type   VARCHAR(32),
       copies      INTEGER DEFAULT 1,
       operator    VARCHAR(64),
       printed_at  TIMESTAMPTZ DEFAULT NOW(),
       created_at  TIMESTAMPTZ DEFAULT NOW()
     )`,

    // ── pkg_shifts（集蛋班次主表）────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS pkg_shifts (
       id             SERIAL PRIMARY KEY,
       shift_no       VARCHAR(64) UNIQUE NOT NULL,
       house_code     VARCHAR(32),
       shift_type     VARCHAR(16) DEFAULT 'AM',
       operator       VARCHAR(64),
       shift_date     DATE NOT NULL DEFAULT CURRENT_DATE,
       total_qty      INTEGER DEFAULT 0,
       dirty_qty      INTEGER DEFAULT 0,
       broken_qty     INTEGER DEFAULT 0,
       qualified_qty  INTEGER DEFAULT 0,
       status         VARCHAR(32) DEFAULT 'PENDING',
       reopen_reason  VARCHAR(256),
       completed_at   TIMESTAMPTZ,
       created_by     INTEGER,
       updated_by     INTEGER,
       created_at     TIMESTAMPTZ DEFAULT NOW(),
       updated_at     TIMESTAMPTZ DEFAULT NOW()
     )`,

    // ── pkg_tasks（分级/包装任务主表）────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS pkg_tasks (
       id              SERIAL PRIMARY KEY,
       task_no         VARCHAR(64) UNIQUE NOT NULL,
       shift_id        INTEGER REFERENCES pkg_shifts(id),
       house_code      VARCHAR(32),
       task_type       VARCHAR(32) DEFAULT 'GRADING',
       plan_qty        INTEGER DEFAULT 0,
       grade_results   TEXT,
       anomaly_reason  VARCHAR(64),
       presort_xl      INTEGER DEFAULT 0,
       presort_dirty   INTEGER DEFAULT 0,
       presort_broken  INTEGER DEFAULT 0,
       packed_qty      INTEGER DEFAULT 0,
       output_qty      INTEGER DEFAULT 0,
       pack_spec       VARCHAR(32),
       remainder_qty   INTEGER DEFAULT 0,
       status          VARCHAR(32) DEFAULT 'PENDING',
       graded_at       TIMESTAMPTZ,
       graded_by       INTEGER,
       completed_at    TIMESTAMPTZ,
       completed_by    INTEGER,
       created_by      INTEGER,
       updated_by      INTEGER,
       created_at      TIMESTAMPTZ DEFAULT NOW(),
       updated_at      TIMESTAMPTZ DEFAULT NOW()
     )`,

    // ── 补充列（兼容已有表的情况）──────────────────────────────────────────
    `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS task_type     VARCHAR(32) DEFAULT 'GRADING'`,
    `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS grade_results TEXT`,
    `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS anomaly_reason VARCHAR(64)`,
    `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS presort_xl    INTEGER DEFAULT 0`,
    `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS presort_dirty INTEGER DEFAULT 0`,
    `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS presort_broken INTEGER DEFAULT 0`,
    `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS packed_qty    INTEGER DEFAULT 0`,
    `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS output_qty    INTEGER DEFAULT 0`,
    `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS pack_spec     VARCHAR(32)`,
    `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS remainder_qty INTEGER DEFAULT 0`,
    `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS graded_at     TIMESTAMPTZ`,
    `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS graded_by     INTEGER`,
    `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS completed_at  TIMESTAMPTZ`,
    `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS completed_by  INTEGER`,
    `ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS updated_by    INTEGER`,
    `ALTER TABLE pkg_shifts ADD COLUMN IF NOT EXISTS total_qty     INTEGER DEFAULT 0`,
    `ALTER TABLE pkg_shifts ADD COLUMN IF NOT EXISTS dirty_qty     INTEGER DEFAULT 0`,
    `ALTER TABLE pkg_shifts ADD COLUMN IF NOT EXISTS broken_qty    INTEGER DEFAULT 0`,
    `ALTER TABLE pkg_shifts ADD COLUMN IF NOT EXISTS qualified_qty INTEGER DEFAULT 0`,
    `ALTER TABLE pkg_shifts ADD COLUMN IF NOT EXISTS completed_at  TIMESTAMPTZ`,
    `ALTER TABLE pkg_shifts ADD COLUMN IF NOT EXISTS reopen_reason VARCHAR(256)`,
    `ALTER TABLE pkg_shifts ADD COLUMN IF NOT EXISTS updated_by    INTEGER`,

    // ── 索引 ─────────────────────────────────────────────────────────────────
    `CREATE INDEX IF NOT EXISTS idx_pkg_tasks_type_status ON pkg_tasks (task_type, status)`,
    `CREATE INDEX IF NOT EXISTS idx_pkg_tasks_completed ON pkg_tasks (completed_at)`,
    `CREATE INDEX IF NOT EXISTS idx_pkg_label_prints_task ON pkg_label_prints (task_no)`,
    `CREATE INDEX IF NOT EXISTS idx_pkg_exceptions_status ON pkg_exceptions (status)`,
    `CREATE INDEX IF NOT EXISTS idx_pkg_shifts_date ON pkg_shifts (shift_date)`,
  ];

  let ok = 0, fail = 0;
  for (const sql of sqls) {
    try {
      await client.query(sql);
      ok++;
    } catch (e) {
      console.warn(`⚠️  ${e.message?.slice(0,100)}`);
      fail++;
    }
  }
  console.log(`\n完成：✅ ${ok} 成功 / ⚠️  ${fail} 跳过`);
  await client.end();
}

run().catch(e => { console.error('❌ Migration 失败:', e.message); process.exit(1); });
