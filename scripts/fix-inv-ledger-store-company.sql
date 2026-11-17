-- ============================================================
-- Phoenix ERP V3 — inv_ledger.store_code 误写公司码修复（INV-104 / INV-201d）
--
-- 背景：egg-inventory writeLedger 的 $5 参数位（store_code 列）在 2026-11-17
--       之前误传 companyCode（批次 1 commit e4f0b9409 已修代码侧）。存量行里
--       store_code 存了公司码，导致门店归因与 generic-crud.service.ts 的
--       mst_stores LEFT JOIN 失效。egg 引擎（农口销售/生产/过期核销）本就无
--       门店上下文，正确值是 NULL。
--
-- 甄别规则（sys_organizations 实际列：org_code 唯一 / org_type / company_code）：
--   store_code 命中 org_type='COMPANY' 行的 COALESCE(company_code, org_code)
--   或 org_code，且该值不是真实门店（mst_stores 无此 store_code），
--   且 change_type 属 egg 引擎写入集合。
--
-- 用法（默认 dry-run 只读预览，不写任何数据）：
--   psql -d <db> -f scripts/fix-inv-ledger-store-company.sql
-- 显式执行（等价 --apply，需人工审核预览输出后）：
--   psql -d <db> -v apply=on -f scripts/fix-inv-ledger-store-company.sql
--
-- 注意：生产执行前先备份（scripts/backup-db.sh）；apply 走单事务，
--       ON_ERROR_STOP 开启，失败整体回滚。
-- ============================================================
\set ON_ERROR_STOP on
\pset pager off

BEGIN;

-- ── 1. 只读预览：命中行分布 ──────────────────────────────────────────────────
\echo ''
\echo '【预览 1】待修复行按 change_type × store_code 分布'
SELECT l.change_type, l.store_code AS miswritten_company_code,
       COUNT(*) AS rows, MIN(l.created_at) AS first_log, MAX(l.created_at) AS last_log
  FROM inv_ledger l
 WHERE l.store_code IS NOT NULL
   AND l.store_code IN (
         SELECT COALESCE(o.company_code, o.org_code) FROM sys_organizations o WHERE o.org_type = 'COMPANY'
         UNION
         SELECT o.org_code FROM sys_organizations o WHERE o.org_type = 'COMPANY'
       )
   AND l.change_type IN ('INBOUND','OUTBOUND','FIFO_OUT','RESERVED','RELEASED',
                         'SALE_RETURN','DAMAGE_WRITEOFF','EXPIRE_WRITEOFF')
   AND NOT EXISTS (SELECT 1 FROM mst_stores s WHERE s.store_code = l.store_code)
 GROUP BY l.change_type, l.store_code
 ORDER BY l.change_type, l.store_code;

\echo ''
\echo '【预览 2】明细样例（前 100 行，供人工抽查 ref_no/note）'
SELECT l.id, l.batch_no, l.change_type, l.qty_change, l.store_code AS miswritten_company_code,
       l.company_code, l.ref_no, l.operator, l.created_at
  FROM inv_ledger l
 WHERE l.store_code IS NOT NULL
   AND l.store_code IN (
         SELECT COALESCE(o.company_code, o.org_code) FROM sys_organizations o WHERE o.org_type = 'COMPANY'
         UNION
         SELECT o.org_code FROM sys_organizations o WHERE o.org_type = 'COMPANY'
       )
   AND l.change_type IN ('INBOUND','OUTBOUND','FIFO_OUT','RESERVED','RELEASED',
                         'SALE_RETURN','DAMAGE_WRITEOFF','EXPIRE_WRITEOFF')
   AND NOT EXISTS (SELECT 1 FROM mst_stores s WHERE s.store_code = l.store_code)
 ORDER BY l.id
 LIMIT 100;

-- ── 2. 参数化执行：默认 dry-run（ROLLBACK），-v apply=on 才落盘 ─────────────
\if :{?apply}
\if :apply
  \echo ''
  \echo '【APPLY】置 NULL 修复 store_code 误写公司码的行...'
  UPDATE inv_ledger l
     SET store_code = NULL
    WHERE l.store_code IS NOT NULL
      AND l.store_code IN (
            SELECT COALESCE(o.company_code, o.org_code) FROM sys_organizations o WHERE o.org_type = 'COMPANY'
            UNION
            SELECT o.org_code FROM sys_organizations o WHERE o.org_type = 'COMPANY'
          )
      AND l.change_type IN ('INBOUND','OUTBOUND','FIFO_OUT','RESERVED','RELEASED',
                            'SALE_RETURN','DAMAGE_WRITEOFF','EXPIRE_WRITEOFF')
      AND NOT EXISTS (SELECT 1 FROM mst_stores s WHERE s.store_code = l.store_code);
  COMMIT;
  \echo '【APPLY】完成。复核：psql -d <db> -f scripts/check-inv-batches-invariants.sql'
\else
  ROLLBACK;
  \echo '【DRY-RUN】apply=false，仅预览，未写入。执行模式：psql -v apply=on -f 本脚本'
\endif
\else
  ROLLBACK;
  \echo '【DRY-RUN】未传 -v apply=on，仅预览，未写入。'
\endif
