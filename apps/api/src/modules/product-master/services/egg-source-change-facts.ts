import { eggSourceWarehouse } from './egg-source-change-policy';
import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { EggSourceOwner, EggShellClass, SHELL_TYPES, sourceClock } from './egg-source-change-policy';
import { EggSourceProfile, SkuAvailabilityService, SourceSkuBlocked, SourceSkuIssue, SkuResolveResult } from './sku-availability.service';

export type SourceSkuRequirement = { gradeCode: string; specCode: string };

export class SourcePlanBlocked extends ConflictException {
  constructor(readonly reasonCode: string, response: string|Record<string,unknown>) { super(response); }
}

export type SourcePrecheckRow = SourceSkuRequirement & {
  status:'PASSED'|'BLOCKED'|'NOT_CHECKED'; issues:SourceSkuIssue[];
  skuCode?:string;productCode?:string;domainVerified?:boolean;
};

/** New commercial approvals on a formal route require an active product with its original opening proof. */
export async function readEggProductDomainEvidence(m: EntityManager, owner: Pick<EggSourceOwner, 'companyCode'|'houseCode'>,
  scopeId: string, warehouseCode: string, productCode: string) {
  const rows = await m.query(`SELECT d.inventory_domain_id, s.state AS scope_state, d.product_code
    FROM production_inventory_domains d JOIN production_cutover_scopes s ON s.id=d.scope_id
    WHERE d.scope_id=$1 AND s.company_code=$2 AND s.house_code=$3
      AND d.company_code=$2 AND d.warehouse_code=$4 AND d.product_code=$5
    FOR SHARE OF d,s`, [scopeId, owner.companyCode, owner.houseCode, warehouseCode, productCode]);
  if (rows.length !== 1 || rows[0].scope_state !== 'ACTIVE') {
    throw new SourcePlanBlocked('EGG_SOURCE_PRODUCT_DOMAIN_REQUIRED',{ code:'EGG_SOURCE_PRODUCT_DOMAIN_REQUIRED', productCode, warehouseCode,
      message:'目标产品未纳入本舍正式库存范围，请先办理受控扩域' });
  }
  const [domain] = await m.query(`SELECT d.id,d.state,d.version,claim.opening_receipt_id,claim.manifest_id,claim.content_hash FROM production_inventory_domain_states d
    JOIN production_opening_domain_claims claim ON claim.domain_id=d.id
    JOIN production_opening_receipts receipt ON receipt.id=claim.opening_receipt_id AND receipt.cutover_manifest_id=claim.manifest_id
    JOIN production_cutover_manifests original ON original.id=claim.manifest_id AND original.state='APPLIED'
      AND original.content_hash=claim.content_hash AND receipt.evidence_sha256=claim.content_hash
    WHERE d.company_code=$1 AND d.warehouse_code=$2 AND d.product_code=$3 FOR SHARE OF d`, [owner.companyCode, warehouseCode, productCode]);
  const id = rows[0].inventory_domain_id;
  if (!id || !domain || domain.state !== 'ACTIVE' || domain.id !== id) {
    throw new SourcePlanBlocked('EGG_SOURCE_PRODUCT_DOMAIN_UNAVAILABLE',{ code:'EGG_SOURCE_PRODUCT_DOMAIN_UNAVAILABLE', productCode, warehouseCode,
      message:'目标产品库存域尚未启用、已暂停或成员身份不一致' });
  }
  return {
    productCode, domainId:String(id), version:Number(domain.version),
    openingReceiptId:String(domain.opening_receipt_id), manifestId:String(domain.manifest_id),
    evidenceSha256:String(domain.content_hash),
  };
}

export async function requireEggProductDomain(m: EntityManager, owner: Pick<EggSourceOwner, 'companyCode'|'houseCode'>,
  scopeId: string, warehouseCode: string, productCode: string): Promise<string> {
  return (await readEggProductDomainEvidence(m,owner,scopeId,warehouseCode,productCode)).domainId;
}

export async function checkHouseInventoryReadiness(m: EntityManager, owner: EggSourceOwner, date: string,
  items: readonly Pick<SkuResolveResult,'productCode'>[]) {
  const scopes: Array<{id:string;version:number;state:string;warehouse_code:string;first_production_date:string;manifest_sha256:string}> =
    await m.query(`SELECT id,version,state,warehouse_code,first_production_date::text,manifest_sha256
    FROM production_cutover_scopes WHERE company_code=$1 AND house_code=$2
    ORDER BY state,id FOR SHARE`, [owner.companyCode,owner.houseCode]);
  const formal = scopes.filter(scope => scope.state!=='DRAFT');
  try {
    if (!formal.length) {
      if (scopes.some(scope => scope.first_production_date<=date)) {
        throw new SourcePlanBlocked('CUTOVER_DRAFT_CONFLICT','存在与来源生效日冲突的正式切换草稿');
      }
      return { status:'NOT_CUT_OVER' as const, scope:null, domains:[] };
    }
    const [scope] = formal;
    if (formal.length!==1 || scope.state!=='ACTIVE' || scope.first_production_date>date) {
      throw new SourcePlanBlocked('CUTOVER_NOT_READY','鸡舍的正式库存范围未就绪或首个正式日尚未达到');
    }
    if (!await eggSourceWarehouse(m,owner,scope.warehouse_code)) {
      throw new SourcePlanBlocked('WAREHOUSE_UNAVAILABLE','正式范围的交库仓不可用');
    }
    const domains = [];
    for (const code of [...new Set(items.map(item=>item.productCode))].sort()) {
      domains.push(await readEggProductDomainEvidence(m,owner,scope.id,scope.warehouse_code,code));
    }
    return { status:'READY' as const, scope, domains };
  } catch (error) {
    if (!(error instanceof SourcePlanBlocked)) throw error;
    return { status:'BLOCKED' as const, code:error.reasonCode };
  }
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
  date: string, kind: EggShellClass, warehouseCode: string|null, requirements: SourceSkuRequirement[], planDocument?: string, diagnostics?: SourcePrecheckRow[]) {
  if (warehouseCode!==null && !await eggSourceWarehouse(m,owner,warehouseCode)) {
    throw new SourcePlanBlocked('WAREHOUSE_UNAVAILABLE','目标仓须为本公司、适用场站的启用操作仓');
  }
  const scopes = warehouseCode===null ? [] : await m.query(`SELECT id,state,first_production_date::text FROM production_cutover_scopes
    WHERE company_code=$1 AND house_code=$2 AND state<>'DRAFT' FOR SHARE`, [owner.companyCode, owner.houseCode]);
  if (scopes.length > 1 || scopes.some((s: any) => s.state !== 'ACTIVE' || s.first_production_date > date)) {
    throw new SourcePlanBlocked('CUTOVER_NOT_READY','鸡舍的正式库存范围未就绪');
  }
  let planned: EggSourceFlockApproval | null = null;
  if (planDocument) {
    const [plan] = await m.query(`SELECT id,version,kind,status,payload,flock_no,house_code,business_date::text
      FROM brd_flock_documents WHERE id=$1 AND company_code=$2 FOR SHARE`, [planDocument, owner.companyCode]);
    if (!plan || !['ADMIT','TRANSFER'].includes(plan.kind) || !['DRAFT','SUBMITTED','APPROVED','POSTED'].includes(plan.status)
      || (plan.kind === 'ADMIT' ? plan.house_code : plan.payload.targetHouseCode) !== owner.houseCode
      || plan.business_date !== date) throw new SourcePlanBlocked('PLAN_MISMATCH','换群计划与鸡舍或产蛋生效日不一致');
    planned = { documentId:plan.id, version:plan.version, flockNo:plan.flock_no };
  }
  const profile: EggSourceProfile = { ...owner, ...SHELL_TYPES[kind], eggDate:date, effectiveDate:date, profileCode:'PROPOSED' };
  const items: Array<SkuResolveResult & {domainId?:string|null}> = [];
  for (const requirement of requirements) {
    let selected:SkuResolveResult|undefined;
    try {
      selected = await skus.resolveForProfile({ ...owner, ...requirement, usage:'stock' }, profile, m, date,!!diagnostics);
      const domainId = warehouseCode!==null && scopes.length ? await requireEggProductDomain(m, owner, scopes[0].id, warehouseCode, selected.productCode) : null;
      items.push(warehouseCode===null ? selected : { ...selected, domainId });
      diagnostics?.push({ ...requirement,status:'PASSED',issues:[],skuCode:selected.skuCode,productCode:selected.productCode,domainVerified:!!domainId });
    } catch (error) {
      if (!diagnostics) throw error;
      const issues: SourceSkuIssue[] = error instanceof SourceSkuBlocked ? error.issues
        : error instanceof SourcePlanBlocked ? [{ layer:'INVENTORY',code:error.reasonCode }] : [];
      if (!issues.length) throw error;
      diagnostics.push({ ...requirement,status:'BLOCKED',issues,skuCode:selected?.skuCode,productCode:selected?.productCode });
    }
  }
  return warehouseCode===null ? { items, planned } : { items, scopeId:scopes[0]?.id ?? null, planned };
}

export type EggSourceFlockApproval = { documentId:string; version:number; flockNo:string; originalEffectiveDate?:string };

export async function assertApprovedFlock(m: Pick<EntityManager,'query'>, owner: Pick<EggSourceOwner,'companyCode'|'houseCode'>,
  planned: EggSourceFlockApproval, anchor: string, checkMixed: boolean): Promise<void> {
  const rows = await m.query(`SELECT o.id,o.flock_no,o.opened_document_id,d.version,d.status
    FROM brd_flock_occupancies o JOIN brd_flock_documents d ON d.id=o.opened_document_id
    WHERE o.company_code=$1 AND o.house_code=$2 AND o.began_on <= $3
      AND (o.ended_on IS NULL OR o.ended_on > $3)
    FOR SHARE OF o,d`, [owner.companyCode,owner.houseCode,anchor]);
  if (rows.length !== 1 || rows[0].status !== 'POSTED' || rows[0].opened_document_id !== planned.documentId ||
      rows[0].flock_no !== planned.flockNo || rows[0].version < planned.version) {
    throw new ConflictException({code:'EGG_SOURCE_FLOCK_DEFERRED',message:'计划换群与当日实际占栏不一致，暂缓新收蛋和入库'});
  }
  if (checkMixed) {
    const [mismatch] = await m.query(`SELECT 1 FROM brd_daily_logs d WHERE d.house_code=$1 AND d.log_date=$2
      AND (d.occupancy_id IS DISTINCT FROM $3 OR d.flock_no IS DISTINCT FROM $4)
      UNION ALL
      SELECT 1 FROM pkg_source_batches s WHERE s.house_code=$1 AND COALESCE(s.lay_date,s.production_date)=$2
        AND s.is_test=false AND s.batch_status='RECEIVED' AND s.flock_code IS DISTINCT FROM $4 LIMIT 1`,
    [owner.houseCode,anchor,rows[0].id,rows[0].flock_no]);
    if (mismatch) throw new ConflictException({code:'EGG_SOURCE_MIXED_TRANSITION',message:'改色日已有不同或未确认的实际生产来源'});
  }
}

/** Bound schedules protect fresh provenance without reinterpreting historical receipts. */
export async function checkApprovedEggSource(m: Pick<EntityManager,'query'>, profile: EggSourceProfile) {
  if (!profile.profileCode.startsWith('ESP-CHANGE-')) return null;
  const [record] = await m.query(`SELECT c.id AS "approvalId", c.approval->'snapshot' AS snapshot, c.payload->>'warehouseCode' AS warehouse,
      c.contract_version AS "contractVersion"
    FROM md_egg_source_changes c WHERE c.new_profile_code=$1 AND state IN ('APPROVED','REVOKE_REQUESTED')
    AND company_code=$2 AND house_code=$3 FOR SHARE`, [profile.profileCode,profile.companyCode,profile.houseCode]);
  if (!record?.snapshot?.items?.length) throw new ConflictException('来源档案缺少正式批准回执');
  const clock = await sourceClock(m,profile);
  if (profile.eggDate > clock.day) throw new ConflictException('未来产蛋日期只能预览，尚不能收蛋或入库');
  const contractVersion = record.contractVersion ?? 1;
  if (contractVersion!==1 && contractVersion!==2 || contractVersion===1 && !record.warehouse) {
    throw new ConflictException('来源批准口径或原审批仓无法确认');
  }
  const planned: EggSourceFlockApproval|undefined = record.snapshot.planned;
  if (planned) {
    const anchor = contractVersion===2 ? planned.originalEffectiveDate ?? profile.effectiveDate : profile.effectiveDate;
    await assertApprovedFlock(m,profile,planned,anchor,anchor!==profile.effectiveDate || profile.eggDate===anchor);
  }
  return { ...record, contractVersion } as { approvalId:string; contractVersion:1|2; warehouse:string|null;
    snapshot:{ items:Array<{ skuCode:string; productCode:string; gradeCode:string; specCode:string; domainId?:string|null }>; scopeId?:string|null } };
}

export function assertApprovedEggSku(approval: Awaited<ReturnType<typeof checkApprovedEggSource>>,
  sku:{skuCode?:string|null;productCode?:string|null;gradeCode?:string|null;specCode?:string|null}, warehouse?:string) {
  if (approval && (approval.contractVersion===1 && warehouse !== undefined && approval.warehouse !== warehouse || !approval.snapshot.items.some(item =>
    item.skuCode===sku.skuCode && item.productCode===sku.productCode && item.gradeCode===sku.gradeCode && item.specCode===sku.specCode))) {
    throw new ConflictException({ code:'EGG_SOURCE_APPROVAL_SKU_NOT_COVERED',
      message:'本次使用的仓库或 SKU 不在已批准来源档案范围内，请核对生效配置' });
  }
}
