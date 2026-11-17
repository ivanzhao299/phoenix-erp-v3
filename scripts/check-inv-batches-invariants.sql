-- ============================================================
-- Phoenix ERP V3 — inv_batches / inv_ledger 完整性预检（INV-201，只读）
--
-- 用途：在执行 InvBatchesIntegrityConstraints 迁移（ck_inv_batches_qty CHECK +
--       fk_inv_ledger_batch FK，均 NOT VALID）之前与之后盘点存量违例。
--       NOT VALID 约束只挡新增写入，不校验存量；本脚本回答"存量是否干净、
--       何时可以 VALIDATE"。
--
-- dry-run 用法（纯只读，可反复执行）：
--   psql -d <db> -f scripts/check-inv-batches-invariants.sql
--
-- 三项计数全部为 0 = 存量干净，可在运维窗口执行：
--   ALTER TABLE inv_batches    VALIDATE CONSTRAINT ck_inv_batches_qty;
--   ALTER TABLE inv_ledger     VALIDATE CONSTRAINT fk_inv_ledger_batch;
-- 任一计数非 0 → 先出数据修复脚本（scripts/，含 dry-run），人工审核后执行。
-- ============================================================
\pset pager off
BEGIN TRANSACTION READ ONLY;
SELECT 'READONLY_GUARD' AS section, current_setting('transaction_read_only') AS read_only;

-- ── 1. 三项违例计数（预期全 0） ────────────────────────────────────────────────
\echo ''
\echo '【INV-201 预检】三项计数（全部为 0 才可 VALIDATE 约束）'
SELECT 'neg_qty'        AS invariant, COUNT(*) AS violations
  FROM inv_batches WHERE qty < 0 OR qty_available < 0
UNION ALL
SELECT 'over_available', COUNT(*)
  FROM inv_batches WHERE qty_available > qty
UNION ALL
SELECT 'ledger_orphans', COUNT(*)
  FROM inv_ledger l WHERE l.batch_no IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM inv_batches b WHERE b.batch_no = l.batch_no);

-- ── 2. 违例明细（LIMIT 200，供修复脚本编写参考） ─────────────────────────────
\echo ''
\echo '【明细】负数量 / 可用量超总量（前 200 行）'
SELECT b.batch_no, b.company_code, b.product_code, b.sku_code, b.status,
       b.qty, b.qty_available
  FROM inv_batches b
 WHERE b.qty < 0 OR b.qty_available < 0 OR b.qty_available > b.qty
 ORDER BY b.batch_no
 LIMIT 200;

\echo ''
\echo '【明细】inv_ledger 孤儿 batch_no（按批次聚合，前 200 组；历史 DMG-* 伪批次预期出现在此）'
SELECT l.batch_no, l.change_type, COUNT(*) AS ledger_rows,
       MIN(l.created_at) AS first_log, MAX(l.created_at) AS last_log
  FROM inv_ledger l
 WHERE l.batch_no IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM inv_batches b WHERE b.batch_no = l.batch_no)
 GROUP BY l.batch_no, l.change_type
 ORDER BY l.batch_no, l.change_type
 LIMIT 200;

ROLLBACK;
