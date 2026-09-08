\echo '=== loss movement distribution (last 30 days) ==='
SELECT change_type,
       COUNT(*) AS record_count,
       COUNT(DISTINCT batch_no) AS batch_count,
       COALESCE(SUM(qty_change), 0) AS signed_qty,
       COALESCE(SUM(ABS(qty_change)), 0) AS absolute_qty,
       COUNT(*) FILTER (WHERE qty_change < 0) AS negative_rows,
       COUNT(*) FILTER (WHERE qty_change > 0) AS positive_rows,
       COUNT(*) FILTER (WHERE COALESCE(company_code, 'ALL') = 'ALL') AS all_company_rows
  FROM inv_ledger
 WHERE created_at >= NOW() - INTERVAL '30 days'
 GROUP BY change_type
 ORDER BY absolute_qty DESC, change_type;

\echo '=== candidate loss movements by company (last 30 days) ==='
SELECT COALESCE(company_code, 'ALL') AS company_code,
       change_type,
       COUNT(*) AS record_count,
       COUNT(DISTINCT batch_no) AS batch_count,
       COALESCE(SUM(ABS(qty_change)), 0) AS absolute_qty
  FROM inv_ledger
 WHERE change_type IN (
         'LOSS', 'WRITE_OFF', 'DAMAGE_WRITEOFF',
         'EXPIRE_WRITEOFF', 'QC_REJECT', 'EGG_WRITE_OFF',
         'STOCKTAKE_DOWN', 'INBOUND_BROKEN'
       )
   AND created_at >= NOW() - INTERVAL '30 days'
 GROUP BY COALESCE(company_code, 'ALL'), change_type
 ORDER BY company_code, absolute_qty DESC, change_type;

\echo '=== repeated loss ledgers grouped by batch (last 30 days) ==='
SELECT COALESCE(company_code, 'ALL') AS company_code,
       batch_no,
       COUNT(*) AS ledger_count,
       STRING_AGG(DISTINCT change_type, ',' ORDER BY change_type) AS change_types,
       COALESCE(SUM(ABS(qty_change)), 0) AS total_loss,
       MAX(created_at) AS last_event
  FROM inv_ledger
 WHERE change_type IN ('EXPIRE_WRITEOFF','DAMAGE_WRITEOFF','WRITE_OFF','QC_REJECT')
   AND created_at >= NOW() - INTERVAL '30 days'
 GROUP BY COALESCE(company_code, 'ALL'), batch_no
HAVING COUNT(*) > 1
 ORDER BY total_loss DESC, last_event DESC
 LIMIT 20;

\echo '=== loss batch aggregation sample (last 30 days) ==='
SELECT COALESCE(il.company_code, 'ALL') AS company_code,
       il.batch_no,
       COUNT(*) AS ledger_count,
       STRING_AGG(DISTINCT il.change_type, ',' ORDER BY il.change_type) AS change_types,
       COALESCE(SUM(ABS(il.qty_change)), 0) AS total_loss,
       MAX(il.created_at) AS last_event,
       MAX(COALESCE(il.sku_code, b.sku_code)) AS sku_code,
       MAX(b.product_code) AS product_code
  FROM inv_ledger il
  LEFT JOIN inv_batches b
    ON b.batch_no = il.batch_no
   AND b.company_code = il.company_code
 WHERE il.change_type IN ('EXPIRE_WRITEOFF','DAMAGE_WRITEOFF','WRITE_OFF','QC_REJECT')
   AND il.created_at >= NOW() - INTERVAL '30 days'
 GROUP BY COALESCE(il.company_code, 'ALL'), il.batch_no
 ORDER BY total_loss DESC, last_event DESC
 LIMIT 20;
