-- =============================================================================
-- Phoenix ERP V4 — 包装中心数据重置脚本（健壮版）
-- 执行方式：/Applications/Postgres.app/Contents/Versions/latest/bin/psql -U mac -d phoenix_erp -f v4_packaging_reset.sql
-- =============================================================================

-- 关闭事务，每条语句独立执行，遇错跳过不整体回滚
\set ON_ERROR_STOP off

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: 清空新版 Terminal 作业台数据表（表不存在则跳过）
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'pkg_handover_records')
    THEN TRUNCATE TABLE pkg_handover_records RESTART IDENTITY CASCADE; END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'pkg_packing_records')
    THEN TRUNCATE TABLE pkg_packing_records RESTART IDENTITY CASCADE; END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'pkg_grading_records')
    THEN TRUNCATE TABLE pkg_grading_records RESTART IDENTITY CASCADE; END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'pkg_label_print_logs')
    THEN TRUNCATE TABLE pkg_label_print_logs RESTART IDENTITY CASCADE; END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'pkg_qc_inspections')
    THEN TRUNCATE TABLE pkg_qc_inspections RESTART IDENTITY CASCADE; END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'pkg_source_batches')
    THEN TRUNCATE TABLE pkg_source_batches RESTART IDENTITY CASCADE; END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'pkg_work_shifts')
    THEN TRUNCATE TABLE pkg_work_shifts RESTART IDENTITY CASCADE; END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'pkg_audit_logs')
    THEN TRUNCATE TABLE pkg_audit_logs RESTART IDENTITY CASCADE; END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'pkg_exceptions')
    THEN TRUNCATE TABLE pkg_exceptions RESTART IDENTITY CASCADE; END IF;
  RAISE NOTICE 'STEP 1 done: Terminal tables cleared.';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: 删除旧版包装表
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS pkg_shifts        CASCADE;
DROP TABLE IF EXISTS pkg_tasks         CASCADE;
DROP TABLE IF EXISTS pkg_grading_tasks CASCADE;
DROP TABLE IF EXISTS pkg_label_prints  CASCADE;

DO $$ BEGIN RAISE NOTICE 'STEP 2 done: Old tables dropped.'; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: 鸡舍 + 鸡群基础数据（幂等）
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'brd_houses') THEN
    INSERT INTO brd_houses (house_code, house_name, capacity, house_type, status, created_at, updated_at)
    VALUES
      ('H-01', '1号蛋鸡舍', 5000, 'LAYING', 'ACTIVE', NOW(), NOW()),
      ('H-02', '2号蛋鸡舍', 8000, 'LAYING', 'ACTIVE', NOW(), NOW()),
      ('H-03', '3号蛋鸡舍', 6000, 'LAYING', 'ACTIVE', NOW(), NOW())
    ON CONFLICT (house_code) DO UPDATE SET status = 'ACTIVE', updated_at = NOW();
    RAISE NOTICE 'STEP 3a done: brd_houses seeded.';
  ELSE
    RAISE NOTICE 'STEP 3a skip: brd_houses not found.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'brd_flocks') THEN
    INSERT INTO brd_flocks (flock_code, house_code, breed, hatch_date, current_qty, status, created_at, updated_at)
    VALUES
      ('FL-2024-001', 'H-01', '罗曼褐', '2024-03-01', 4800, 'LAYING', NOW(), NOW()),
      ('FL-2024-002', 'H-02', '海兰灰', '2024-02-15', 7600, 'LAYING', NOW(), NOW()),
      ('FL-2024-003', 'H-03', '伊莎褐', '2024-04-01', 5700, 'LAYING', NOW(), NOW())
    ON CONFLICT (flock_code) DO UPDATE SET status = 'LAYING', updated_at = NOW();
    RAISE NOTICE 'STEP 3b done: brd_flocks seeded.';
  ELSE
    RAISE NOTICE 'STEP 3b skip: brd_flocks not found.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: 今日测试来源批次（需先有 pkg_source_batches 表，启动 API 服务后才存在）
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'pkg_source_batches') THEN
    INSERT INTO pkg_source_batches (
      batch_code, source_inbound_no, production_date,
      house_code, flock_code, lay_date,
      expected_qty, expected_weight, container_count,
      batch_status, created_at, updated_at
    ) VALUES
    (
      'SRC-' || TO_CHAR(CURRENT_DATE,'YYYYMMDD') || '-001',
      'INB-' || TO_CHAR(CURRENT_DATE,'YYYYMMDD') || '-001',
      CURRENT_DATE, 'H-01', 'FL-2024-001', CURRENT_DATE,
      4500, 270.0, 15, 'PENDING_RECEIVE', NOW(), NOW()
    ),
    (
      'SRC-' || TO_CHAR(CURRENT_DATE,'YYYYMMDD') || '-002',
      'INB-' || TO_CHAR(CURRENT_DATE,'YYYYMMDD') || '-002',
      CURRENT_DATE, 'H-02', 'FL-2024-002', CURRENT_DATE,
      7200, 432.0, 24, 'PENDING_RECEIVE', NOW(), NOW()
    )
    ON CONFLICT (batch_code) DO NOTHING;
    RAISE NOTICE 'STEP 4 done: Today test source batches seeded.';
  ELSE
    RAISE NOTICE 'STEP 4 skip: pkg_source_batches not found — run API service first, then re-run this script.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: Terminal 角色（幂等）
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO sys_role (role_code, role_name_zh, role_name_en, status, created_at, updated_at)
VALUES
  ('ROLE_PKG_OPERATOR',    '包装操作员', 'Packaging Operator',  1, NOW(), NOW()),
  ('ROLE_QC_INSPECTOR',    '质检员',     'QC Inspector',        1, NOW(), NOW()),
  ('ROLE_WH_CLERK',        '仓管员',     'Warehouse Clerk',     1, NOW(), NOW()),
  ('ROLE_LINE_SUPERVISOR', '班组长',     'Line Supervisor',     1, NOW(), NOW())
ON CONFLICT (role_code) DO NOTHING;

DO $$ BEGIN RAISE NOTICE 'STEP 5 done: Terminal roles ensured.'; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: 清除旧包装相关库存数据（如有）
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'inv_ledger') THEN
    DELETE FROM inv_ledger WHERE ref_type IN ('PKG_TASK','PKG_GRADE','PKG_PACK');
    RAISE NOTICE 'STEP 6a done: inv_ledger cleaned.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'inv_batches') THEN
    DELETE FROM inv_batches WHERE source_module = 'PACKAGING';
    RAISE NOTICE 'STEP 6b done: inv_batches cleaned.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 验证结果
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE '=== 验证结果 ==='; END $$;

SELECT
  t.tablename,
  CASE
    WHEN t.tablename = 'pkg_work_shifts'      THEN (SELECT COUNT(*)::text FROM pkg_work_shifts)
    WHEN t.tablename = 'pkg_source_batches'   THEN (SELECT COUNT(*)::text FROM pkg_source_batches)
    WHEN t.tablename = 'pkg_grading_records'  THEN (SELECT COUNT(*)::text FROM pkg_grading_records)
    WHEN t.tablename = 'pkg_packing_records'  THEN (SELECT COUNT(*)::text FROM pkg_packing_records)
    WHEN t.tablename = 'pkg_handover_records' THEN (SELECT COUNT(*)::text FROM pkg_handover_records)
    ELSE '—'
  END AS row_count
FROM pg_tables t
WHERE t.tablename IN (
  'pkg_work_shifts','pkg_source_batches','pkg_grading_records',
  'pkg_packing_records','pkg_handover_records'
)
ORDER BY t.tablename;

-- 确认旧表已删除
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'pkg_shifts')        THEN '❌ 仍存在' ELSE '✅ 已删除' END AS pkg_shifts,
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'pkg_tasks')         THEN '❌ 仍存在' ELSE '✅ 已删除' END AS pkg_tasks,
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'pkg_grading_tasks') THEN '❌ 仍存在' ELSE '✅ 已删除' END AS pkg_grading_tasks,
  CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'pkg_label_prints')  THEN '❌ 仍存在' ELSE '✅ 已删除' END AS pkg_label_prints;
