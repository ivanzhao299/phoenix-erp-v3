import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { EggSourceOwner, EggShellClass, SHELL_TYPES, sourceClock } from './egg-source-change-policy';
import { EggSourceProfile, SkuAvailabilityService } from './sku-availability.service';

export type SourceSkuRequirement = { gradeCode: string; specCode: string };

/** Existing formal scopes may use legacy (domain row only) or explicit active product domains. */
export async function requireEggProductDomain(m: EntityManager, owner: Pick<EggSourceOwner, 'companyCode'|'houseCode'>,
  scopeId: string, warehouseCode: string, productCode: string): Promise<string | null> {
  const rows = await m.query(`SELECT d.inventory_domain_id, s.state AS scope_state, d.product_code
    FROM production_inventory_domains d JOIN production_cutover_scopes s ON s.id=d.scope_id
    WHERE d.scope_id=$1 AND s.company_code=$2 AND s.house_code=$3
      AND d.company_code=$2 AND d.warehouse_code=$4 AND d.product_code=$5
    FOR SHARE OF d,s`, [scopeId, owner.companyCode, owner.houseCode, warehouseCode, productCode]);
  if (rows.length !== 1 || rows[0].scope_state !== 'ACTIVE') {
    throw new ConflictException({ code:'EGG_SOURCE_PRODUCT_DOMAIN_REQUIRED', productCode, warehouseCode,
      message:'目标产品未纳入本舍正式库存范围，请先办理受控扩域' });
  }
  const [domain] = await m.query(`SELECT id,state FROM production_inventory_domain_states
    WHERE company_code=$1 AND warehouse_code=$2 AND product_code=$3 FOR SHARE`, [owner.companyCode, warehouseCode, productCode]);
  const id = rows[0].inventory_domain_id ?? null;
  if ((domain && (domain.state !== 'ACTIVE' || domain.id !== id)) || (id && !domain)) {
    throw new ConflictException({ code:'EGG_SOURCE_PRODUCT_DOMAIN_UNAVAILABLE', productCode, warehouseCode,
      message:'目标产品库存域尚未启用、已暂停或成员身份不一致' });
  }
  return id;
}

export async function sourceUseBlockers(m: EntityManager, owner: EggSourceOwner, date: string) {
  // These are real business rows. Drafts can be refreshed, signed/posted identities cannot.
  return m.query(`
    SELECT 'PHYSICAL_HANDOVER' AS kind, id::text FROM production_physical_handovers
      WHERE company_code=$1 AND house_code=$2 AND production_date >= $3 AND state='CONFIRMED'
    UNION ALL SELECT 'INBOUND_DOCUMENT',id::text FROM production_inbound_documents
      WHERE company_code=$1 AND house_code=$2 AND production_date >= $3 AND state IN ('READY','APPROVED','POSTED')
    UNION ALL SELECT 'RAW_RECEIPT',id::text FROM production_raw_receipts
      WHERE company_code=$1 AND house_code=$2 AND production_date >= $3 AND state IN ('READY','APPROVED','POSTED')
    UNION ALL SELECT 'DAILY_REPORT',id::text FROM brd_daily_logs
      WHERE company_code=$1 AND house_code=$2 AND log_date >= $3 AND COALESCE(eggs_produced,0)>0
    UNION ALL SELECT 'SOURCE_RECEIPT',source_key::text FROM brd_egg_source_receipts
      WHERE company_code=$1 AND house_code=$2 AND production_date >= $3
    UNION ALL SELECT 'PACKAGING_SOURCE',id::text FROM pkg_source_batches AS source
      WHERE house_code=$2 AND COALESCE(is_test,false)=false
        AND (production_date >= $3 OR lay_date >= $3)
        AND COALESCE(batch_status,'RECEIVED') NOT IN ('PENDING_RECEIVE','CANCELLED','VOID')
    UNION ALL SELECT 'BATCH',b.batch_no FROM inv_batches b
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(b.source_profile_snapshot)='array'
        THEN b.source_profile_snapshot ELSE '[]'::jsonb END) as source
      WHERE b.company_code=$1 AND b.egg_date >= $3 AND source->>'houseCode'=$2
    ORDER BY 1,2 LIMIT 31`, [owner.companyCode, owner.houseCode, date]);
}

export async function verifySourceChangePlan(m: EntityManager, skus: SkuAvailabilityService, owner: EggSourceOwner,
  date: string, kind: EggShellClass, warehouseCode: string, requirements: SourceSkuRequirement[], planDocument?: string) {
  const [warehouse] = await m.query(`SELECT warehouse_code FROM wms_warehouses WHERE warehouse_code=$1 AND company_code=$2
    AND status='ACTIVE' AND domain='OPERATIONAL' FOR SHARE`, [warehouseCode, owner.companyCode]);
  if (!warehouse) throw new ConflictException('目标仓须为本公司启用的操作仓');
  const scopes = await m.query(`SELECT id,state,first_production_date::text FROM production_cutover_scopes
    WHERE company_code=$1 AND house_code=$2 AND state<>'DRAFT' FOR SHARE`, [owner.companyCode, owner.houseCode]);
  if (scopes.length > 1 || scopes.some((s: any) => s.state !== 'ACTIVE' || s.first_production_date > date)) {
    throw new ConflictException('鸡舍的正式库存范围未就绪');
  }
  let planned: { documentId:string; version:number; flockNo:string } | null = null;
  if (planDocument) {
    const [plan] = await m.query(`SELECT id,version,kind,status,payload,flock_no,house_code,business_date::text
      FROM brd_flock_documents WHERE id=$1 AND company_code=$2 FOR SHARE`, [planDocument, owner.companyCode]);
    if (!plan || !['ADMIT','TRANSFER'].includes(plan.kind) || !['DRAFT','SUBMITTED','APPROVED','POSTED'].includes(plan.status)
      || (plan.kind === 'ADMIT' ? plan.house_code : plan.payload.targetHouseCode) !== owner.houseCode
      || plan.business_date !== date) throw new ConflictException('换群计划与鸡舍或产蛋生效日不一致');
    planned = { documentId:plan.id, version:plan.version, flockNo:plan.flock_no };
  }
  const profile: EggSourceProfile = { ...owner, ...SHELL_TYPES[kind], eggDate:date, effectiveDate:date, profileCode:'PROPOSED' };
  const items = [];
  for (const requirement of requirements) {
    const selected = await skus.resolveForProfile({ ...owner, ...requirement, usage:'stock' }, profile, m, date);
    const domainId = scopes.length ? await requireEggProductDomain(m, owner, scopes[0].id, warehouseCode, selected.productCode) : null;
    items.push({ ...selected, domainId });
  }
  return { items, scopeId:scopes[0]?.id ?? null, planned };
}

/** Bound schedules protect fresh provenance without reinterpreting historical receipts. */
export async function checkApprovedEggSource(m: Pick<EntityManager,'query'>, profile: EggSourceProfile) {
  if (!profile.profileCode.startsWith('ESP-CHANGE-')) return null;
  const [record] = await m.query(`SELECT c.id AS "approvalId", c.approval->'snapshot' AS snapshot, c.payload->>'warehouseCode' AS warehouse
    FROM md_egg_source_changes c WHERE c.new_profile_code=$1 AND state IN ('APPROVED','REVOKE_REQUESTED')
    AND company_code=$2 AND house_code=$3 FOR SHARE`, [profile.profileCode,profile.companyCode,profile.houseCode]);
  if (!record?.snapshot?.items?.length) throw new ConflictException('来源档案缺少正式批准回执');
  const clock = await sourceClock(m,profile);
  if (profile.eggDate > clock.day) throw new ConflictException('未来产蛋日期只能预览，尚不能收蛋或入库');
  const planned = record.snapshot.planned;
  if (planned) {
    const rows = await m.query(`SELECT o.id,o.flock_no,o.opened_document_id,d.version,d.status
      FROM brd_flock_occupancies o JOIN brd_flock_documents d ON d.id=o.opened_document_id
      WHERE o.company_code=$1 AND o.house_code=$2 AND o.began_on <= $3
        AND (o.ended_on IS NULL OR o.ended_on > $3)
      FOR SHARE OF o,d`, [profile.companyCode,profile.houseCode,profile.effectiveDate]);
    if (rows.length !== 1 || rows[0].status !== 'POSTED' || rows[0].opened_document_id !== planned.documentId ||
        rows[0].flock_no !== planned.flockNo || rows[0].version < planned.version) {
      throw new ConflictException({code:'EGG_SOURCE_FLOCK_DEFERRED',message:'计划换群与当日实际占栏不一致，暂缓新收蛋和入库'});
    }
    if (profile.eggDate === profile.effectiveDate) {
      const [mismatch] = await m.query(`SELECT 1 FROM brd_daily_logs d WHERE d.house_code=$1 AND d.log_date=$2
        AND (d.occupancy_id IS DISTINCT FROM $3 OR d.flock_no IS DISTINCT FROM $4)
        UNION ALL
        SELECT 1 FROM pkg_source_batches s WHERE s.house_code=$1 AND COALESCE(s.lay_date,s.production_date)=$2
          AND s.is_test=false AND s.batch_status='RECEIVED' AND s.flock_code IS DISTINCT FROM $4 LIMIT 1`,
      [profile.houseCode,profile.eggDate,rows[0].id,rows[0].flock_no]);
      if (mismatch) throw new ConflictException({code:'EGG_SOURCE_MIXED_TRANSITION',message:'改色日已有不同或未确认的实际生产来源'});
    }
  }
  return record as { approvalId:string; warehouse:string; snapshot:{ items:Array<{ skuCode:string; productCode:string; gradeCode:string;
    specCode:string; domainId:string|null }>; scopeId:string|null } };
}

export function assertApprovedEggSku(approval: Awaited<ReturnType<typeof checkApprovedEggSource>>,
  sku:{skuCode?:string|null;productCode?:string|null;gradeCode?:string|null;specCode?:string|null}, warehouse?:string) {
  if (approval && (warehouse !== undefined && approval.warehouse !== warehouse || !approval.snapshot.items.some(item =>
    item.skuCode===sku.skuCode && item.productCode===sku.productCode && item.gradeCode===sku.gradeCode && item.specCode===sku.specCode))) {
    throw new ConflictException({ code:'EGG_SOURCE_APPROVAL_SKU_NOT_COVERED',
      message:'本次使用的仓库或 SKU 不在已批准来源档案范围内，请核对生效配置' });
  }
}
