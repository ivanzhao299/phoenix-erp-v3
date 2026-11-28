import { ConflictException } from '@nestjs/common';

export type InventoryQueryable = { query(sql: string, args?: unknown[]): Promise<any> };

/** Same database predicate for lists, FIFO, valuation, exports and direct-batch operations. */
export function officialInventoryPredicate(alias = 'b'): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) throw new Error('Invalid SQL batch alias');
  return `official_inventory_allows(${alias}.batch_no,${alias}.company_code,${alias}.warehouse_code,`
    + `${alias}.product_code,${alias}.sku_code,${alias}.material_code)`;
}

export function officialInventoryWritablePredicate(alias = 'b'): string {
  return officialInventoryPredicate(alias).replace('official_inventory_allows(', 'official_inventory_writable(');
}

/** A numeric zero placeholder is not a confirmed cost for a newly qualified source. */
export function officialInventoryCostKnownPredicate(alias = 'b'): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) throw new Error('Invalid SQL batch alias');
  return `(${alias}.unit_cost IS NOT NULL
    AND (COALESCE(to_jsonb(${alias})->>'source_type','') NOT IN ('TRANSFER','TRANSFER_DAMAGE') OR to_jsonb(${alias})->>'transfer_cost_currency' IS NOT NULL)
    AND (COALESCE(to_jsonb(${alias})->>'source_type','') <> 'PACKAGING' OR EXISTS(
      SELECT 1 FROM production_batch_qualifications packaging_cost_q
      WHERE packaging_cost_q.batch_no=${alias}.batch_no AND packaging_cost_q.disposition='QUALIFIED'
        AND packaging_cost_q.cost_status='CONFIRMED'))
    AND NOT EXISTS(SELECT 1 FROM production_batch_qualifications cost_q JOIN production_cutover_scopes cost_scope ON cost_scope.id=cost_q.scope_id
    WHERE cost_q.batch_no=${alias}.batch_no AND cost_q.disposition='QUALIFIED' AND cost_q.cost_status='UNKNOWN'
      AND (official_inventory_qualification_controlled(cost_q.batch_no) OR cost_scope.state<>'DRAFT' OR to_jsonb(cost_q)->>'receipt_item_id' IS NOT NULL OR to_jsonb(cost_q)->>'opening_manifest_id' IS NOT NULL
        OR EXISTS(SELECT 1 FROM production_batch_roots cost_roots JOIN production_batch_qualifications cost_root ON cost_root.batch_no=cost_roots.root_batch_no
          JOIN production_cutover_scopes root_cost_scope ON root_cost_scope.id=cost_root.scope_id WHERE cost_roots.batch_no=cost_q.batch_no
            AND (root_cost_scope.state<>'DRAFT' OR to_jsonb(cost_root)->>'receipt_item_id' IS NOT NULL OR to_jsonb(cost_root)->>'opening_manifest_id' IS NOT NULL)))))`;
}

/** Never present incomplete qualified inventory as a fully valued zero-cost total. */
export function officialInventoryCostAggregate(alias='inv_batches'):string {
  const known=officialInventoryCostKnownPredicate(alias);
  return `CASE WHEN COUNT(*) FILTER(WHERE ${alias}.qty>0 AND NOT ${known})>0 THEN NULL
    ELSE COALESCE(SUM(${alias}.qty*${alias}.unit_cost),0) END::text AS value,
    COUNT(*) FILTER(WHERE ${alias}.qty>0 AND NOT ${known})::int AS cost_pending_batches,
    COALESCE(SUM(${alias}.qty) FILTER(WHERE ${alias}.qty>0 AND NOT ${known}),0)::text AS cost_pending_quantity`;
}

/** Caller retains its normal company/warehouse authorization and transaction/lock order. */
export async function assertOfficialInventoryBatches(db: InventoryQueryable, batchNos: string[], operation = true): Promise<void> {
  const nos = [...new Set(batchNos.filter(Boolean))].sort();
  if (!nos.length) return;
  if (operation) await db.query('SELECT batch_no FROM inv_batches WHERE batch_no=ANY($1::text[]) ORDER BY batch_no FOR SHARE',[nos]);
  const rejected = await db.query(`SELECT b.batch_no FROM inv_batches b
    WHERE b.batch_no=ANY($1::text[]) AND NOT (${operation ? officialInventoryWritablePredicate('b') : officialInventoryPredicate('b')}) LIMIT 1`, [nos]);
  if (rejected.length) throw new ConflictException({ code: 'OFFICIAL_INVENTORY_SOURCE_REJECTED',
    message: '测试期或来源待核实的批次不能参与正式业务，请查询历史资料或联系交接负责人', batchNo: rejected[0].batch_no });
}

/** Keep missing-batch historical ledger facts; hide only a batch with a rejected qualification. */
export function officialLedgerPredicate(alias = 'inv_ledger'): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) throw new Error('Invalid SQL ledger alias');
  return `NOT EXISTS(SELECT 1 FROM inv_batches official_batch WHERE official_batch.batch_no=${alias}.batch_no AND NOT (${officialInventoryPredicate('official_batch')}))`;
}
