import { BadRequestException, ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { EggShellClass, readEggSourceOwner, requireShellClass, SHELL_TYPES, sourceDate, sourceText, sourceUuid } from '../product-master/services/egg-source-change-policy';
import { EggSourceProfile, SkuAvailabilityService } from '../product-master/services/sku-availability.service';
import { resolveQuantity } from '../product-master/services/quantity-contract';
import { CutoverEvidenceBoundary } from './production-cutover-evidence';

export type CutoverExtension = {
  kind:'ATTACH_EXISTING_SCOPE'|'INIT_EXISTING_SCOPE_ZERO';
  scopeId:string;
  scopeVersion:number;
  scopeManifestSha256:string;
  domainId?:string;
  domainVersion?:number;
  openingReceiptId?:string;
  targetClass:EggShellClass;
  effectiveDate:string;
  requirements:Array<{gradeCode:string;specCode:string}>;
};

export function normalizeCutoverExtension(input: CutoverExtension, boundary: CutoverEvidenceBoundary): CutoverExtension {
  if (!input || !['ATTACH_EXISTING_SCOPE','INIT_EXISTING_SCOPE_ZERO'].includes(input.kind) ||
      boundary.houses.length!==1 || boundary.productCodes.length!==1 ||
      !Number.isInteger(input.scopeVersion) || input.scopeVersion<1 || !/^[a-f0-9]{64}$/.test(input.scopeManifestSha256??'') ||
      !Array.isArray(input.requirements) || !input.requirements.length || input.requirements.length>96) {
    throw new BadRequestException('正式扩域每单限一个既有鸡舍和一个品目');
  }
  const normalized: CutoverExtension = { kind:input.kind,
    scopeId:sourceUuid(input.scopeId,'原正式范围'),scopeVersion:input.scopeVersion,scopeManifestSha256:input.scopeManifestSha256,
    targetClass:requireShellClass(input.targetClass),effectiveDate:sourceDate(input.effectiveDate),
    requirements:input.requirements.map(item=>({gradeCode:sourceText(item?.gradeCode,'等级',64),
      specCode:sourceText(item?.specCode,'规格',64)})).sort((a,b)=>a.gradeCode.localeCompare(b.gradeCode)||a.specCode.localeCompare(b.specCode)),
  };
  if (new Set(normalized.requirements.map(item=>JSON.stringify(item))).size!==normalized.requirements.length) {
    throw new BadRequestException('扩域所需等级与规格不能重复');
  }
  if (input.kind==='ATTACH_EXISTING_SCOPE') {
    if (!Number.isInteger(input.domainVersion) || input.domainVersion!<1) throw new BadRequestException('正式产品域版本无效');
    normalized.domainId=sourceUuid(input.domainId,'正式产品域');
    normalized.domainVersion=input.domainVersion;
    normalized.openingReceiptId=sourceUuid(input.openingReceiptId,'原开账回执');
  } else if (input.domainId||input.domainVersion||input.openingReceiptId) {
    throw new BadRequestException('零实盘新域不能引用另一已开账产品域');
  }
  return normalized;
}

export async function verifyCutoverExtension(m:EntityManager,boundary:CutoverEvidenceBoundary,input:CutoverExtension,hostExecution=false) {
  const { companyCode,warehouseCode,productCodes:[product],houses:[house] }=boundary;
  // The executor has native receipts but the API is entitled only to their filtered projection.
  const proof = hostExecution ? `SELECT 1 FROM production_cutover_apply_results r
      JOIN production_cutover_apply_admissions a ON a.id=r.admission_id AND a.consumed_xid IS NOT NULL
      JOIN production_inventory_domains edge ON edge.scope_id=s.id AND edge.inventory_domain_id=ANY(r.domain_ids)
      JOIN production_opening_domain_claims c ON c.domain_id=edge.inventory_domain_id
      JOIN production_cutover_apply_results initial ON initial.manifest_id=c.manifest_id AND initial.opening_receipt_id=c.opening_receipt_id
        AND edge.inventory_domain_id=ANY(initial.domain_ids)
      WHERE r.manifest_id=origin.id AND a.manifest_id=origin.id AND s.id=ANY(r.scope_ids)
        AND a.content_hash=origin.content_hash AND a.snapshot_sha256=origin.snapshot_sha256 AND r.result=origin.receipt`
    : 'SELECT 1 FROM production_cutover_state_origins proof WHERE proof.scope_id=s.id AND proof.manifest_id=origin.id';
  const [scope]=await m.query(`SELECT s.id,s.version,s.state,s.manifest_sha256,s.first_production_date::text,
    s.company_code,s.house_code,s.warehouse_code FROM production_cutover_scopes s
    JOIN production_cutover_manifests origin ON origin.id::text=s.evidence->>'manifestId'
      AND origin.state='APPLIED' AND origin.content_hash=s.manifest_sha256 AND origin.receipt IS NOT NULL
    WHERE s.id=$1 AND EXISTS(${proof})
    FOR SHARE OF s,origin`,[input.scopeId]);
  if (!scope||scope.state!=='ACTIVE'||scope.company_code!==companyCode||scope.warehouse_code!==warehouseCode
      ||scope.house_code!==house.houseCode||scope.first_production_date!==house.firstProductionDate
      ||scope.version!==input.scopeVersion||scope.manifest_sha256!==input.scopeManifestSha256) {
    throw new ConflictException('原正式鸡舍范围或生效凭证已变化');
  }
  if ((await m.query(`SELECT 1 FROM production_inventory_domains WHERE scope_id=$1 AND product_code=$2`,[scope.id,product])).length) {
    throw new ConflictException('目标产品已经关联该鸡舍');
  }
  const [domain]=await m.query(`SELECT d.id,d.state,d.version,c.opening_receipt_id
    FROM production_inventory_domain_states d LEFT JOIN production_opening_domain_claims c ON c.domain_id=d.id
    WHERE d.company_code=$1 AND d.warehouse_code=$2 AND d.product_code=$3 FOR SHARE OF d`,[companyCode,warehouseCode,product]);
  if (input.kind==='ATTACH_EXISTING_SCOPE') {
    if (!domain||domain.id!==input.domainId||domain.version!==input.domainVersion||domain.state!=='ACTIVE'
      ||domain.opening_receipt_id!==input.openingReceiptId) throw new ConflictException('产品域或原开账回执已变化');
  } else if (domain || (await m.query(`SELECT 1 FROM inv_batches b LEFT JOIN product_skus sku ON sku.sku_code=b.sku_code
    WHERE (sku.product_code=$1 OR b.material_code IS NULL AND b.product_code=$1) AND b.warehouse_code=$2
      AND (b.company_code=$3 OR b.company_code IS NULL OR b.company_code='ALL')
      AND (b.qty IS NULL OR b.qty<>0 OR b.qty_available IS NULL OR b.qty_available<>0) LIMIT 1`,[product,warehouseCode,companyCode])).length) {
    throw new ConflictException('目标产品已有域或库存，须先单独核实盘点');
  }
  const connected=await m.query(`WITH RECURSIVE edge AS (
    SELECT scope_id,inventory_domain_id AS domain_id FROM production_inventory_domains WHERE company_code=$1 AND warehouse_code=$2
    ), connected(id,kind) AS (
      SELECT seed.id,seed.kind FROM (VALUES($3::uuid,'scope'::text),($4::uuid,'domain'::text)) AS seed(id,kind) WHERE id IS NOT NULL
      UNION SELECT CASE WHEN c.kind='scope' THEN e.domain_id ELSE e.scope_id END,
        CASE WHEN c.kind='scope' THEN 'domain' ELSE 'scope' END FROM connected c JOIN edge e
        ON (c.kind='scope' AND e.scope_id=c.id) OR (c.kind='domain' AND e.domain_id=c.id)
    ) SELECT c.id FROM connected c
      LEFT JOIN production_cutover_scopes s ON c.kind='scope' AND s.id=c.id
      LEFT JOIN production_inventory_domain_states d ON c.kind='domain' AND d.id=c.id
    WHERE COALESCE(s.state,d.state) IS DISTINCT FROM 'ACTIVE'`,[companyCode,warehouseCode,scope.id,domain?.id??null]);
  if (connected.length) throw new ConflictException('共享正式库存范围存在暂停或未验证成员，不能扩域');
  const owner=await readEggSourceOwner(m,house.houseCode,true);
  if(owner.companyCode!==companyCode) throw new ConflictException('鸡舍公司已变化');
  const skus=new SkuAvailabilityService(m.connection);
  const profile:EggSourceProfile={...owner,...SHELL_TYPES[input.targetClass],
    eggDate:input.effectiveDate,effectiveDate:input.effectiveDate,profileCode:'PROPOSED'};
  const [eggProduct]=await m.query("SELECT 1 FROM mst_products WHERE product_code=$1 AND category_code='EGG' AND status='ACTIVE' FOR SHARE",[product]);
  if (!eggProduct) throw new ConflictException('正式扩域仅适用于已启用的蛋品');
  const items=[];
  for (const wanted of input.requirements) {
    const sku=await skus.resolveForProfile({...owner,...wanted,usage:'stock'},profile,m,input.effectiveDate);
    const measurement=await resolveQuantity(m,{qty:1,quantityBasis:'BASE',skuCode:sku.skuCode});
    if(sku.productCode!==product || measurement?.baseUnit!=='枚') throw new ConflictException('目标壳色的实际 SKU 与扩域品目不符');
    items.push(sku);
  }
  return { scope,domain:domain??null,items };
}
