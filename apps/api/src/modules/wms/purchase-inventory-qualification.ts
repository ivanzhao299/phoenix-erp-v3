import { ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';
import { EntityManager } from 'typeorm';

export const purchaseReceiptBatchNo=(receiptNo:string,itemId:string)=>`PRC-${createHash('sha256').update(`${receiptNo}:${itemId}`).digest('hex').slice(0,40)}`;

/** Actual confirmed procurement receipt and persisted line are the source, never a caller's source_type. */
export async function qualifyPurchaseInventory(m: EntityManager,p: {
  batchNo:string;companyCode:string;warehouseCode:string;productCode:string|null;skuCode:string|null;
  receiptNo:string;receiptItemId?:string;itemCode:string;quantity:number;unitCost:number;actor:string;baseUnit:string;
  admission?:{scopeId:string;companyCode:string;warehouseCode:string;productCode:string};
}) {
  // An unrelated purchase warehouse remains outside the house cutover. A later actual transfer into
  // an approved domain can admit its verified receipt root, binding the whole related lineage.
  const a=p.admission;
  const domains=await m.query(`SELECT DISTINCT d.scope_id FROM production_inventory_domains d
    JOIN production_cutover_scopes s ON s.id=d.scope_id WHERE d.company_code=$1
      AND d.warehouse_code=$2 AND d.product_code=$3 AND s.state='ACTIVE' ${a?'AND d.scope_id=$4':''} ORDER BY d.scope_id`,
    a?[a.companyCode,a.warehouseCode,a.productCode,a.scopeId]:[p.companyCode,p.warehouseCode,p.productCode]);
  if(!domains.length)return;
  if(!m.queryRunner?.isTransactionActive||!p.receiptItemId||!p.skuCode||!p.productCode)throw new ConflictException('正式采购库存须有可核验的收货单及原行');
  const [line]=await m.query(`SELECT i.id,i.item_code,i.actual_qty,i.unit,r.receipt_no,r.company_code,r.warehouse_code
    FROM prc2_receipt_items i JOIN prc2_receipts r ON r.id=i.receipt_id WHERE i.id=$1 AND r.receipt_no=$2
      AND r.company_code=$3 AND r.warehouse_code=$4 AND r.status='CONFIRMED' FOR SHARE OF i,r`,
  [p.receiptItemId,p.receiptNo,p.companyCode,p.warehouseCode]);
  if(!line||line.item_code!==p.itemCode||Number(line.actual_qty)!==p.quantity||line.unit!==p.baseUnit
    ||p.baseUnit==='枚'&&!Number.isSafeInteger(p.quantity))throw new ConflictException('正式采购来源与实际确认收货行不一致');
  const origin=`${p.receiptNo}:${p.receiptItemId}`;
  const [existing]=await m.query('SELECT * FROM production_batch_qualifications WHERE batch_no=$1',[p.batchNo]);
  if(existing) {
    if(existing.origin_kind!=='PURCHASE'||existing.origin_ref!==origin||existing.source_type!=='PURCHASE'
      ||existing.source_no!==p.receiptNo||existing.company_code!==p.companyCode||existing.product_code!==p.productCode
      ||existing.sku_code!==p.skuCode)throw new ConflictException('采购批次已被其他来源占用');
    return;
  }
  const digest=createHash('sha256').update(JSON.stringify({line,quantity:p.quantity,recordedUnitCost:p.unitCost})).digest('hex');
  await m.query(`INSERT INTO production_batch_qualifications(batch_no,scope_id,company_code,product_code,sku_code,
    disposition,origin_kind,origin_ref,source_type,source_no,cost_status,evidence_sha256,created_by)
    VALUES($1,$2,$3,$4,$5,'QUALIFIED','PURCHASE',$6,'PURCHASE',$7,$8,$9,$10)`,
  [p.batchNo,domains[0].scope_id,p.companyCode,p.productCode,p.skuCode,origin,p.receiptNo,p.unitCost>0?'CONFIRMED':'UNKNOWN',digest,p.actor]);
}
