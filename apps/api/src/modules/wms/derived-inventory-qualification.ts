import { ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';
import { EntityManager } from 'typeorm';
import { qualifyPurchaseInventory,purchaseReceiptBatchNo } from './purchase-inventory-qualification';
import { assertOfficialInventoryBatches } from './official-inventory';

/** Only callers resolving actual persisted parent rows may construct this internal input. */
export async function qualifyDerivedInventory(m: EntityManager, parents: Array<{ batch_no:string;official_scope_id?:string|null }>, target: {
  batchNo:string;companyCode:string;warehouseCode:string;productCode:string|null;skuCode:string|null;sourceType:string;sourceNo:string;actor:string;ownershipTransfer?:boolean;allowSkuConversion?:boolean;costStatus?:'CONFIRMED'|'UNKNOWN';
}): Promise<void> {
  const parentNos=[...new Set(parents.map(p=>p.batch_no))].sort();
  const metadata=await m.query("SELECT to_regclass('production_inventory_domain_states') AS domains,to_regclass('production_batch_raw_roots') AS raw_roots");
  const modern=Array.isArray(metadata)&&!!metadata[0]?.domains;
  const rawEnabled=Array.isArray(metadata)&&!!metadata[0]?.raw_roots;
  const known=await m.query(`SELECT q.batch_no,q.scope_id AS official_scope_id FROM production_batch_qualifications q
    JOIN production_cutover_scopes s ON s.id=q.scope_id WHERE q.batch_no=ANY($1::text[]) AND ${modern?'official_inventory_qualification_controlled(q.batch_no)':"s.state<>'DRAFT'"}`,[parentNos]);
  if(!parentNos.length||known.length!==parentNos.length) {
    const [domain]=await m.query(`SELECT d.scope_id FROM production_inventory_domains d JOIN production_cutover_scopes s ON s.id=d.scope_id
      ${modern?'LEFT JOIN production_inventory_domain_states domain ON domain.company_code=d.company_code AND domain.warehouse_code=d.warehouse_code AND domain.product_code=d.product_code':''}
      WHERE d.company_code=$1 AND d.warehouse_code=$2 AND d.product_code=$3 AND ${modern?"(domain.id IS NULL AND s.state='ACTIVE' OR domain.state='ACTIVE')":"s.state='ACTIVE'"} ORDER BY d.scope_id LIMIT 1`,
      [target.companyCode,target.warehouseCode,target.productCode]);
    if(!domain&&!known.length)return;
    if(domain) {
      if(!m.queryRunner?.isTransactionActive)throw new ConflictException('正式采购根准入必须处于实际下游事务内');
      for(const batchNo of parentNos.filter(no=>!known.some((p:any)=>p.batch_no===no))) {
        const [batch]=await m.query('SELECT * FROM inv_batches WHERE batch_no=$1 FOR SHARE',[batchNo]);
        if(!batch||batch.source_type!=='PURCHASE')throw new ConflictException('来源不明的库存不能经下游进入正式范围');
        const [schema]=await m.query("SELECT to_regclass('prc2_receipts') AS receipts,to_regclass('prc2_receipt_items') AS lines");
        if(!schema?.receipts||!schema?.lines)throw new ConflictException('无法核验原始采购收货行');
        const candidates=await m.query(`SELECT i.id,i.item_code,i.actual_qty,i.unit FROM prc2_receipt_items i JOIN prc2_receipts r ON r.id=i.receipt_id
          WHERE r.receipt_no=$1 AND r.company_code=$2 AND r.warehouse_code=$3 AND r.status='CONFIRMED'
          AND i.item_code=ANY($4::text[]) FOR SHARE OF i,r`,[batch.source_no,batch.company_code,batch.warehouse_code,
          [batch.sku_code,batch.product_code,batch.material_code].filter(Boolean)]);
        const exact=candidates.filter((i:any)=>purchaseReceiptBatchNo(batch.source_no,String(i.id))===batchNo);
        const line=exact.length===1?exact[0]:null;
        if(!line||Number(batch.qty)<0||Number(batch.qty)>Number(line.actual_qty)||batch.product_code!==target.productCode)throw new ConflictException('采购根原行、数量或商品不明确，请取得逐行实际来源证据');
        // The source may already have been dispatched. Check the complete original ledger, not only the deducted remainder.
        const [flow]=await m.query(`SELECT
          COALESCE(SUM(qty_change) FILTER(WHERE change_type='PURCHASE_INBOUND' AND ref_no=$2),0)::numeric AS admitted,
          COALESCE(SUM(qty_change) FILTER(WHERE change_type NOT IN ('RESERVED','RELEASED')),0)::numeric AS balance,
          COUNT(*) FILTER(WHERE qty_change>0 AND change_type NOT IN ('PURCHASE_INBOUND','RELEASED'))::int AS other_credits,
          COUNT(*) FILTER(WHERE change_type='PURCHASE_INBOUND' AND ref_no IS DISTINCT FROM $2)::int AS other_receipts
          FROM inv_ledger WHERE batch_no=$1`,[batchNo,batch.source_no]);
        if(!flow||Number(flow.admitted)!==Number(line.actual_qty)||Number(flow.balance)!==Number(batch.qty)
          ||Number(flow.other_credits)!==0||Number(flow.other_receipts)!==0||Number(batch.qty_available)<0
          ||batch.qty_available==null||Number(batch.qty_available)>Number(batch.qty))
          throw new ConflictException('采购原批的初始入库、余额或额外入账无法与收货行核对，须先独立核验');
        await qualifyPurchaseInventory(m,{batchNo,companyCode:batch.company_code,warehouseCode:batch.warehouse_code,
          productCode:batch.product_code,skuCode:batch.sku_code,receiptNo:batch.source_no,receiptItemId:String(line.id),itemCode:line.item_code,
          quantity:Number(line.actual_qty),unitCost:Number(batch.unit_cost),actor:target.actor,baseUnit:batch.unit,
          admission:{scopeId:domain.scope_id,companyCode:target.companyCode,warehouseCode:target.warehouseCode,productCode:target.productCode!}});
      }
    }
  }
  if(!m.queryRunner?.isTransactionActive)throw new ConflictException('派生正式库存必须处于统一库存事务内');
  await assertOfficialInventoryBatches(m,parentNos);
  const qualified=await m.query(`SELECT q.* FROM production_batch_qualifications q WHERE q.batch_no=ANY($1::text[])
    AND q.disposition='QUALIFIED' ORDER BY q.batch_no`,[parentNos]);
  if (!parentNos.length||qualified.length!==parentNos.length||qualified.some((q:any)=>q.product_code!==target.productCode||!target.ownershipTransfer&&q.company_code!==target.companyCode
      ||!target.allowSkuConversion&&q.sku_code!==target.skuCode) || !target.productCode||!target.skuCode) throw new ConflictException('派生库存包含来源不明批次，请逐段核对，不能自动洗白');
  const roots=await m.query(`SELECT q.batch_no AS root FROM production_batch_qualifications q
    WHERE q.batch_no=ANY($1::text[]) AND q.origin_kind<>'DERIVED'
    UNION SELECT r.root_batch_no AS root FROM production_batch_roots r WHERE r.batch_no=ANY($1::text[]) ORDER BY root`,[parentNos]);
  const rawRoots=rawEnabled?await m.query(`SELECT DISTINCT r.raw_segment_id FROM production_batch_raw_roots r
    WHERE r.batch_no=ANY($1::text[]) ORDER BY r.raw_segment_id`,[parentNos]):[];
  if(!roots.length&&!rawRoots.length)throw new ConflictException('派生库存缺少完整原始根');
  if(rawRoots.length&&(await m.query(`SELECT 1 FROM production_raw_receipt_segments segment JOIN production_raw_receipts receipt ON receipt.id=segment.receipt_id
    WHERE segment.id=ANY($1::uuid[]) AND receipt.company_code<>$2 LIMIT 1`,[rawRoots.map((r:any)=>r.raw_segment_id),target.companyCode])).length)
    throw new ConflictException('原始收蛋的跨公司派生须先完成独立接收证明与受控转换，不能使用旧派生入口');
  const processingStage=qualified.some((q:any)=>q.processing_stage==='WIP')?'WIP':'FINISHED';
  const conversionRelated=rawEnabled&&(await m.query('SELECT 1 FROM production_batch_qualifications WHERE batch_no=ANY($1::text[]) AND official_inventory_conversion_related(batch_no) LIMIT 1',[parentNos])).length>0;
  if(conversionRelated&&qualified.some((q:any)=>q.company_code!==target.companyCode))throw new ConflictException('加工来源的跨公司派生尚缺独立接收证明，不能使用原派生入口');
  const existing=await m.query('SELECT * FROM production_batch_qualifications WHERE batch_no=$1',[target.batchNo]);
  if (existing.length) {
    const q=existing[0]; const prior=await m.query('SELECT root_batch_no AS root FROM production_batch_roots WHERE batch_no=$1 ORDER BY root',[target.batchNo]);
    if (q.company_code!==target.companyCode||q.product_code!==target.productCode||q.sku_code!==target.skuCode
      ||q.origin_kind!=='DERIVED'||q.source_type!==target.sourceType||q.source_no!==target.sourceNo
      ||JSON.stringify(prior)!==JSON.stringify(roots)) throw new ConflictException('派生批次已被不同交接或根来源占用');
    if(rawEnabled){
      const priorRaw=await m.query('SELECT raw_segment_id FROM production_batch_raw_roots WHERE batch_no=$1 ORDER BY raw_segment_id',[target.batchNo]);
      if(q.processing_stage!==processingStage||JSON.stringify(priorRaw)!==JSON.stringify(rawRoots))throw new ConflictException('派生批次加工阶段或原始收蛋根已被另一转换占用');
      if(rawRoots.length||processingStage==='WIP'||conversionRelated){const priorParents=await m.query('SELECT parent_batch_no FROM production_batch_derivation_parents WHERE batch_no=$1 ORDER BY parent_batch_no',[target.batchNo]);
        if(JSON.stringify(priorParents.map((p:any)=>p.parent_batch_no))!==JSON.stringify(parentNos))throw new ConflictException('派生批次实际父批与原交接不一致');}
    }
    return;
  }
  const evidence=createHash('sha256').update(JSON.stringify({ target,parentNos,roots,...(rawEnabled?{rawRoots,processingStage}:{}) })).digest('hex');
  await m.query(`INSERT INTO production_batch_qualifications(batch_no,scope_id,company_code,product_code,sku_code,
    disposition,origin_kind,origin_ref,source_type,source_no,evidence_sha256,created_by,cost_status${rawEnabled?',processing_stage':''})
    VALUES($1,$2,$3,$4,$5,'QUALIFIED','DERIVED',$6,$7,$6,$8,$9,$10${rawEnabled?',$11':''})`,
  [target.batchNo,qualified[0].scope_id,target.companyCode,target.productCode,target.skuCode,target.sourceNo,target.sourceType,evidence,target.actor,target.costStatus??'UNKNOWN',...(rawEnabled?[processingStage]:[])]);
  for (const { root } of roots) await m.query('INSERT INTO production_batch_roots(batch_no,root_batch_no) VALUES($1,$2)',[target.batchNo,root]);
  for(const root of rawRoots)await m.query('INSERT INTO production_batch_raw_roots(batch_no,raw_segment_id) VALUES($1,$2)',[target.batchNo,root.raw_segment_id]);
  if(rawEnabled&&(rawRoots.length||processingStage==='WIP'||conversionRelated))for(const parent of parentNos)await m.query('INSERT INTO production_batch_derivation_parents(batch_no,parent_batch_no) VALUES($1,$2)',[target.batchNo,parent]);
}
