import { ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';
import { EntityManager } from 'typeorm';
import { assertOfficialInventoryBatches } from './official-inventory';

/** Only callers resolving actual persisted parent rows may construct this internal input. */
export async function qualifyDerivedInventory(m: EntityManager, parents: Array<{ batch_no:string;official_scope_id?:string|null }>, target: {
  batchNo:string;companyCode:string;productCode:string|null;skuCode:string|null;sourceType:string;sourceNo:string;actor:string;
}): Promise<void> {
  const parentNos=[...new Set(parents.map(p=>p.batch_no))].sort();
  if(!parents.some(p=>p.official_scope_id)) {
    const known=await m.query(`SELECT q.batch_no,q.scope_id AS official_scope_id FROM production_batch_qualifications q
      JOIN production_cutover_scopes s ON s.id=q.scope_id WHERE q.batch_no=ANY($1::text[]) AND s.state<>'DRAFT'`,[parentNos]);
    if(!known.length)return;
  }
  if(!m.queryRunner?.isTransactionActive)throw new ConflictException('派生正式库存必须处于统一库存事务内');
  await assertOfficialInventoryBatches(m,parentNos);
  const qualified=await m.query(`SELECT q.* FROM production_batch_qualifications q WHERE q.batch_no=ANY($1::text[])
    AND q.disposition='QUALIFIED' ORDER BY q.batch_no`,[parentNos]);
  if (qualified.length!==parentNos.length || !target.productCode||!target.skuCode) throw new ConflictException('派生库存包含来源不明批次，请逐段核对，不能自动洗白');
  const roots=await m.query(`SELECT q.batch_no AS root FROM production_batch_qualifications q
    WHERE q.batch_no=ANY($1::text[]) AND q.origin_kind<>'DERIVED'
    UNION SELECT r.root_batch_no AS root FROM production_batch_roots r WHERE r.batch_no=ANY($1::text[]) ORDER BY root`,[parentNos]);
  if (!roots.length) throw new ConflictException('派生库存缺少完整原始根');
  const existing=await m.query('SELECT * FROM production_batch_qualifications WHERE batch_no=$1',[target.batchNo]);
  if (existing.length) {
    const q=existing[0]; const prior=await m.query('SELECT root_batch_no AS root FROM production_batch_roots WHERE batch_no=$1 ORDER BY root',[target.batchNo]);
    if (q.company_code!==target.companyCode||q.product_code!==target.productCode||q.sku_code!==target.skuCode
      ||q.origin_kind!=='DERIVED'||q.source_type!==target.sourceType||q.source_no!==target.sourceNo
      ||JSON.stringify(prior)!==JSON.stringify(roots)) throw new ConflictException('派生批次已被不同交接或根来源占用');
    return;
  }
  const evidence=createHash('sha256').update(JSON.stringify({ target,parentNos,roots })).digest('hex');
  await m.query(`INSERT INTO production_batch_qualifications(batch_no,scope_id,company_code,product_code,sku_code,
    disposition,origin_kind,origin_ref,source_type,source_no,evidence_sha256,created_by)
    VALUES($1,$2,$3,$4,$5,'QUALIFIED','DERIVED',$6,$7,$6,$8,$9)`,
  [target.batchNo,qualified[0].scope_id,target.companyCode,target.productCode,target.skuCode,target.sourceNo,target.sourceType,evidence,target.actor]);
  for (const { root } of roots) await m.query('INSERT INTO production_batch_roots(batch_no,root_batch_no) VALUES($1,$2)',[target.batchNo,root]);
}
