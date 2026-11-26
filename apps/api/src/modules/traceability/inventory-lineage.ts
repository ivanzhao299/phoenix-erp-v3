import { DataSource } from 'typeorm';
import { DataScopeContext } from '../org/services/data-scope.service';

/** Immediate, authorized edges. A mixed output contributes its event once, without allocating quantity to each parent. */
export async function readInventoryLineage(
  ds: Pick<DataSource, 'query'>, roots: string | string[], scope: DataScopeContext,
) {
  const rootBatchNos = Array.isArray(roots) ? roots : [roots];
  if (!rootBatchNos.length) return [];
  return ds.query(`
    WITH RECURSIVE visible AS NOT MATERIALIZED (
      SELECT batch_no::text AS batch_no,company_code,warehouse_code,source_no FROM inv_batches
       WHERE $2::boolean OR (company_code=ANY($3::text[]) AND warehouse_code=ANY($4::text[]))
    ), edges AS NOT MATERIALIZED (
      SELECT p.batch_no AS parent_batch_no,c.batch_no AS child_batch_no,
             'TRANSFER' AS kind,t.transfer_no AS document_no,false AS mixed,dst.qty::text AS quantity
        FROM wms_transfer_items i JOIN wms_transfer t ON t.transfer_no=i.transfer_no AND t.status IN ('RECEIVED','COMPLETED')
        JOIN LATERAL (VALUES (i.target_batch_no,i.received_qty),(i.damaged_batch_no,i.damaged_qty))
          dst(batch_no,qty) ON dst.batch_no IS NOT NULL AND dst.qty>0
        JOIN visible p ON p.batch_no=i.source_batch_no AND p.warehouse_code=t.from_warehouse
        JOIN visible c ON c.batch_no=dst.batch_no AND c.warehouse_code=t.to_warehouse AND c.source_no=t.transfer_no
      UNION ALL
      SELECT p.batch_no,c.batch_no,'CONVERSION',d.document_no,
             EXISTS(SELECT 1 FROM production_conversion_inputs other WHERE other.document_id=d.id AND other.id<>i.id),NULL::text
        FROM production_conversion_inputs i
        JOIN production_conversion_documents d ON d.id=i.document_id AND d.state='POSTED'
        JOIN production_conversion_outputs o ON o.document_id=d.id AND o.batch_no IS NOT NULL
        JOIN visible p ON p.batch_no=i.parent_batch_no AND p.company_code=d.company_code AND p.warehouse_code=d.warehouse_code
        JOIN visible c ON c.batch_no=o.batch_no AND c.company_code=d.company_code AND c.warehouse_code=d.warehouse_code
    ), downstream(batch_no) AS (
      SELECT batch_no FROM visible WHERE batch_no=ANY($1::text[])
      UNION SELECT e.child_batch_no FROM edges e JOIN downstream d ON e.parent_batch_no=d.batch_no
    ), upstream(batch_no) AS (
      SELECT batch_no FROM visible WHERE batch_no=ANY($1::text[])
      UNION SELECT e.parent_batch_no FROM edges e JOIN upstream u ON e.child_batch_no=u.batch_no
    )
    SELECT parent_batch_no,child_batch_no,kind,document_no,mixed,quantity,
           e.parent_batch_no IN (SELECT batch_no FROM downstream) AS downstream,
           e.child_batch_no IN (SELECT batch_no FROM upstream) AS upstream
      FROM edges e WHERE e.parent_batch_no IN (SELECT batch_no FROM downstream)
                       OR e.child_batch_no IN (SELECT batch_no FROM upstream)
    UNION ALL
    SELECT 'raw:'||segment.id::text,o.batch_no,'RAW_RECEIPT',receipt.document_no,
           EXISTS(SELECT 1 FROM production_conversion_inputs other WHERE other.document_id=d.id AND other.id<>i.id),
           NULL::text,false,true
      FROM production_conversion_inputs i
      JOIN production_conversion_documents d ON d.id=i.document_id AND d.state='POSTED'
      JOIN production_conversion_outputs o ON o.document_id=d.id
      JOIN visible c ON c.batch_no=o.batch_no AND c.company_code=d.company_code AND c.warehouse_code=d.warehouse_code
      JOIN production_raw_receipt_segments segment ON segment.id=i.raw_segment_id AND segment.company_code=d.company_code
      JOIN production_raw_receipts receipt ON receipt.id=segment.receipt_id AND receipt.state='POSTED' AND receipt.company_code=d.company_code
     WHERE o.batch_no IN (SELECT batch_no FROM upstream)
       AND ($2::boolean OR receipt.warehouse_code=ANY($4::text[]))
     ORDER BY kind,document_no,parent_batch_no,child_batch_no`,
    [rootBatchNos, scope.isGlobal, scope.allowedCompanyCodes, scope.allowedWarehouseCodes]);
}

export async function readOutboundTrace(
  ds: Pick<DataSource, 'query'>, scope: DataScopeContext, options: { batches?: string[]; orderNo?: string },
) {
  return ds.query(`
    SELECT act.id::text AS event_id,a.id::text AS allocation_id,oi.id::text AS order_line_id,
           o.order_no,o.customer_code,o.customer_name,o.status,o.company_code,act.qty::text AS allocated_qty,
           l.warehouse_code,l.unit,a.batch_no,d.delivery_no,d.status AS delivery_status,act.created_at
      FROM sal_order_item_batch_allocation_actions act
      JOIN sal_order_item_batch_allocations a ON a.id=act.allocation_id
      JOIN sal_order_items oi ON oi.id=a.sales_order_item_id
      JOIN sal_sales_orders o ON o.id=oi.sales_order_id AND o.id=act.sales_order_id
      JOIN inv_ledger l ON l.id=act.ledger_id AND l.batch_no=a.batch_no AND l.change_type='FIFO_OUT'
         AND l.qty_change=-act.qty AND l.company_code=o.company_code
      JOIN inv_batches b ON b.batch_no=a.batch_no AND b.company_code=o.company_code
      LEFT JOIN sal_delivery_orders d ON d.id=act.delivery_order_id AND d.company_code=o.company_code
     WHERE act.action_type='OUTBOUND' AND ($1::text[] IS NULL OR a.batch_no=ANY($1))
       AND ($2::text IS NULL OR o.order_no=$2)
       AND ($3::boolean OR (o.company_code=ANY($4::text[]) AND b.warehouse_code=ANY($5::text[])
                            AND l.warehouse_code=ANY($5::text[])))
     ORDER BY act.id`, [options.batches ?? null, options.orderNo ?? null,
    scope.isGlobal, scope.allowedCompanyCodes, scope.allowedWarehouseCodes]);
}
