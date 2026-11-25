import { verifyCutoverExtension } from './production-cutover-extension';
import { sourceDigest } from '../product-master/services/egg-source-change-policy';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { QueryRunner } from 'typeorm';
import { singaporeBusinessDate } from './temp-production-reversal';
import { lockDailyFlock } from '../farm/daily-stock-policy';
import { resolveQuantity } from '../product-master/services/quantity-contract';
import { SkuAvailabilityService } from '../product-master/services/sku-availability.service';
import { OrgOwnershipService } from '../org/services/org-ownership.service';
import type { CutoverProvenanceSigner } from './cutover-cross-company-proof';
import { withCutoverOperator } from './production-cutover-operator';
import { ProductionCutoverService } from './production-cutover.service';
import { WmsService } from './wms.service';

/** Internal compiled execution body. The trusted host owns this runner, both session locks,
 * DEFERRED constraints, COMMIT and uncertain-outcome reconciliation. No standalone CLI or HTTP registration. */
export async function applyApprovedProductionCutover(q:QueryRunner,request:{admissionId:string;admissionDigest:string},
  options:{provenanceSigner?:CutoverProvenanceSigner}={}):Promise<Record<string,unknown>>{
  if(!q.isTransactionActive)throw new ConflictException('CUTOVER_EXECUTOR_TRANSACTION_REQUIRED');
  await q.query('SET CONSTRAINTS ALL DEFERRED');
  const [{manifest_id:manifestId}]=await q.query('SELECT consume_production_cutover_admission($1,$2) AS manifest_id',[request.admissionId,request.admissionDigest]);
  return withCutoverOperator(q.manager,request.admissionId,async({cls,dataScopes,operatorId})=>{
    const service=new ProductionCutoverService(q.connection,cls,undefined,dataScopes,options.provenanceSigner);
    const [target]=await q.query(`SELECT warehouse.company_code,warehouse.status,warehouse.domain FROM wms_warehouses warehouse
      JOIN production_cutover_manifests manifest ON manifest.warehouse_code=warehouse.warehouse_code AND manifest.id=$1 FOR SHARE OF warehouse NOWAIT`,[manifestId]);
    const [owner]=await q.query('SELECT company_code FROM production_cutover_manifests WHERE id=$1',[manifestId]);
    if(!target||target.company_code!==owner?.company_code||target.status!=='ACTIVE'||target.domain!=='OPERATIONAL')
      throw new ConflictException('CUTOVER_EXECUTOR_WAREHOUSE_HOLD');

    let document=await service.verifyForControlledApply(q.manager,manifestId,request.admissionId);
    if(document.payload.postingDate!==singaporeBusinessDate())throw new ConflictException('CUTOVER_EXECUTOR_BUSINESS_DAY_HOLD');
    const eligibilityDate=document.payload.postingDate as string;
    const [permit]=await q.query('SELECT mode FROM production_cutover_apply_admissions WHERE id=$1',[request.admissionId]);
    const mode=permit.mode as 'INIT'|'ATTACH';
    const extension=document.payload.extension;
    if (extension && (mode!==(extension.kind==='ATTACH_EXISTING_SCOPE'?'ATTACH':'INIT') ||
        document.payload.openingLines.length || document.payload.decisions.some((decision:{disposition:string})=>decision.disposition!=='CARRY_FORWARD'))) {
      throw new ConflictException('CUTOVER_EXTENSION_ADMISSION_HOLD');
    }
    const products=document.boundary.productCodes as string[];
    const houses=document.boundary.houses as Array<{houseCode:string;firstProductionDate:string}>;
    if(mode==='ATTACH'&&document.payload.openingLines.length)throw new ConflictException('CUTOVER_ATTACH_CANNOT_REOPEN');
    const existing=await q.query(`SELECT * FROM production_inventory_domain_states WHERE company_code=$1 AND warehouse_code=$2
      AND product_code=ANY($3::text[]) ORDER BY product_code FOR UPDATE NOWAIT`,[document.company_code,document.warehouse_code,products]);
    if(mode==='INIT'&&existing.some((domain:{state:string})=>domain.state!=='DRAFT')
      ||mode==='ATTACH'&&(existing.length!==products.length||existing.some((domain:{state:string})=>domain.state!=='ACTIVE')))
      throw new ConflictException('CUTOVER_EXECUTOR_DOMAIN_MODE_HOLD');
    const [business]=await q.query(`SELECT * FROM production_cutover_signatures WHERE manifest_id=$1 AND signature_role='BUSINESS'
      AND content_hash=$2 AND snapshot_sha256=$3`,[document.id,document.content_hash,document.snapshot_sha256]);
    if(!business)throw new ConflictException('CUTOVER_EXECUTOR_BUSINESS_SIGNATURE_REQUIRED');
    const flockNos=document.snapshot.flocks.map((flock:{flock_no:string})=>flock.flock_no);
    await q.query('SELECT flock_no FROM brd_flocks WHERE flock_no=ANY($1::text[]) ORDER BY flock_no FOR UPDATE NOWAIT',[flockNos]);
    await q.query(`SELECT house.house_code FROM brd_houses house JOIN ${OrgOwnershipService.FARM_TABLE} farm ON farm.farm_code=house.farm_code
      WHERE house.house_code=ANY($1::text[]) ORDER BY house.house_code FOR SHARE OF house,farm NOWAIT`,[houses.map(house=>house.houseCode)]);
    await q.query(`SELECT org_code FROM sys_organizations WHERE org_type='COMPANY' AND COALESCE(company_code,org_code)=$1 ORDER BY org_code FOR SHARE NOWAIT`,[document.company_code]);
    const masterSkus=document.snapshot.masters.skus as Array<{sku_code:string;product_code:string;grade_code:string;spec_code:string;variety_code:string|null;status:string}>;
    const varieties=[...new Set([...masterSkus.map(sku=>sku.variety_code),...document.snapshot.masters.profiles.map((profile:{variety_code?:string})=>profile.variety_code)].filter(Boolean))];
    await q.query('SELECT variety_code FROM md_product_varieties WHERE variety_code=ANY($1::text[]) ORDER BY variety_code FOR SHARE NOWAIT',[varieties]);
    const candidates=await q.query(`SELECT sku.sku_code,sku.grade_code,sku.spec_code FROM product_skus sku JOIN mst_products product ON product.product_code=sku.product_code
      WHERE sku.variety_code=ANY($1::text[]) OR product.variety_code=ANY($1::text[]) OR($2::boolean AND(sku.variety_code IS NULL OR product.variety_code IS NULL))
      ORDER BY sku.sku_code FOR SHARE OF sku,product NOWAIT`,[varieties,document.snapshot.masters.profiles.some((profile:{product_mode:string})=>profile.product_mode==='STANDARD')]);
    await q.query('SELECT grade_code FROM product_grades WHERE grade_code=ANY($1::text[]) ORDER BY grade_code FOR SHARE NOWAIT',[candidates.map((sku:{grade_code:string})=>sku.grade_code)]);
    await q.query('SELECT spec_code FROM packaging_specs WHERE spec_code=ANY($1::text[]) ORDER BY spec_code FOR SHARE NOWAIT',[candidates.map((sku:{spec_code:string})=>sku.spec_code)]);
    await q.query('SELECT sku_code FROM md_sku_org_scope WHERE sku_code=ANY($1::text[]) ORDER BY sku_code,scope_type,scope_code FOR SHARE NOWAIT',[candidates.map((sku:{sku_code:string})=>sku.sku_code)]);
    const ownership=new OrgOwnershipService(q.manager),skus=new SkuAvailabilityService(q.connection);
    const sources:Array<{houseCode:string;date:string;flockNo:string;profileCode:string}>=[];
    for(const house of extension ? [] : [...houses].sort((a,b)=>a.houseCode.localeCompare(b.houseCode))){
      const [profileLock]=await q.query("SELECT pg_try_advisory_xact_lock_shared(hashtext('phoenix:egg-source-profile'),hashtext($1)) AS locked",[`${document.company_code}:${house.houseCode}`]);
      const [reportLock]=await q.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked',[`${document.company_code}|TEMP_PRODUCTION_DAILY|${house.firstProductionDate}|HOUSE-${house.houseCode}`]);
      if(!profileLock.locked||!reportLock.locked)throw new ConflictException('CUTOVER_EXECUTOR_SOURCE_BUSY');
      const owner=await ownership.resolveHouse(house.houseCode);
      if(owner.companyCode!==document.company_code)throw new ConflictException('CUTOVER_EXECUTOR_HOUSE_OWNER_HOLD');
      const flock=await lockDailyFlock(q.manager,{house_code:house.houseCode,log_date:house.firstProductionDate,farm_code:owner.farmCode,company_code:owner.companyCode});
      const profile=await skus.resolveSourceProfile({companyCode:owner.companyCode,houseCode:house.houseCode,eggDate:house.firstProductionDate,
        farmCode:owner.farmCode,siteCode:owner.siteCode},q.manager);
      if(!document.snapshot.flocks.some((f:{flock_no:string;house_code:string})=>f.flock_no===flock.flock_no&&f.house_code===house.houseCode)
        ||!document.snapshot.masters.profiles.some((p:{profile_code:string})=>p.profile_code===profile.profileCode))
        throw new ConflictException('CUTOVER_EXECUTOR_FROZEN_SOURCE_HOLD');
      let acceptsProduction=false;
      const matching=masterSkus.filter(sku=>sku.status==='ACTIVE'&&sku.variety_code===profile.varietyCode
        &&document.snapshot.masters.products.some((product:{product_code:string;variety_code:string|null})=>product.product_code===sku.product_code&&product.variety_code===profile.varietyCode));
      for(const sku of matching){
        try{const resolved=await skus.resolve({companyCode:owner.companyCode,houseCode:house.houseCode,eggDate:house.firstProductionDate,
          farmCode:owner.farmCode,siteCode:owner.siteCode,sourceProfileCode:profile.profileCode,gradeCode:sku.grade_code,specCode:sku.spec_code,usage:'stock'},q.manager,eligibilityDate);
          if(matching.some(candidate=>candidate.sku_code===resolved.skuCode)){
            const measurement=await resolveQuantity(q.manager,{qty:1,quantityBasis:'BASE',skuCode:resolved.skuCode});
            if(measurement?.baseUnit==='枚'){acceptsProduction=true;break;}
          }}
        catch(error){if(!(error instanceof BadRequestException))throw error;}
      }
      if(!acceptsProduction)throw new ConflictException('CUTOVER_EXECUTOR_SOURCE_PRODUCT_HOLD');
      sources.push({houseCode:house.houseCode,date:house.firstProductionDate,flockNo:flock.flock_no,profileCode:profile.profileCode});
    }
    // The first check acquires boundary barriers. Recheck after the actual flock/profile locks before any business insert.
    document=await service.verifyForControlledApply(q.manager,manifestId,request.admissionId);
    const scopes:string[]=[];
    if (extension) {
      const actual=await verifyCutoverExtension(q.manager,document.boundary,extension,true);
      if (sourceDigest(actual)!==sourceDigest(document.payload.extensionProof)) throw new ConflictException('CUTOVER_EXTENSION_PROOF_MOVED');
      scopes.push(actual.scope.id);
    } else if((await q.query(`SELECT 1 FROM production_cutover_scopes WHERE company_code=$1 AND house_code=ANY($2::text[]) AND state<>'DRAFT' LIMIT 1`,
      [document.company_code,houses.map(house=>house.houseCode)])).length)throw new ConflictException('CUTOVER_EXECUTOR_EXISTING_HOUSE_HOLD');
    for(const source of sources){
      const [{version}]=await q.query('SELECT COALESCE(max(version),0)+1 AS version FROM production_cutover_scopes WHERE company_code=$1 AND house_code=$2',[document.company_code,source.houseCode]);
      if(!Number.isSafeInteger(Number(version))||Number(version)>2147483647)throw new ConflictException('CUTOVER_EXECUTOR_SCOPE_VERSION_HOLD');
      const id=randomUUID();await q.query(`INSERT INTO production_cutover_scopes(id,company_code,house_code,version,first_production_date,state,warehouse_code,
        flock_id,source_profile_code,manifest_sha256,evidence,confirmed_by) VALUES($1,$2,$3,$4,$5,'DRAFT',$6,$7,$8,$9,$10,$11)`,
        [id,document.company_code,source.houseCode,version,source.date,document.warehouse_code,source.flockNo,source.profileCode,document.content_hash,
          JSON.stringify({manifestId:document.id,snapshotSha256:document.snapshot_sha256}),operatorId]);
      scopes.push(id);
    }
    const domains:Array<{id:string;product_code:string;version:number}>=[...existing];
    if(mode==='INIT')for(const product of products)if(!domains.some(domain=>domain.product_code===product)){
      const id=randomUUID();await q.query('INSERT INTO production_inventory_domain_states(id,company_code,warehouse_code,product_code,created_by) VALUES($1,$2,$3,$4,$5)',
        [id,document.company_code,document.warehouse_code,product,operatorId]);domains.push({id,product_code:product,version:0});
    }
    for(const scope of scopes)for(const domain of domains)await q.query(`INSERT INTO production_inventory_domains(scope_id,company_code,warehouse_code,product_code,inventory_domain_id)
      VALUES($1,$2,$3,$4,$5)`,[scope,document.company_code,document.warehouse_code,domain.product_code,domain.id]);
    for(const decision of document.payload.decisions){
      if(decision.disposition!=='ARCHIVED_TEST')continue;
      const [qualification]=await q.query('SELECT disposition FROM production_batch_qualifications WHERE batch_no=$1',[decision.batchNo]);
      if(qualification){if(qualification.disposition!=='ARCHIVED_TEST')throw new ConflictException('CUTOVER_EXECUTOR_ARCHIVE_ORIGINAL_HOLD');continue;}
      const batch=document.snapshot.batches.find((fact:{batch_no:string})=>fact.batch_no===decision.batchNo);
      if(!batch)throw new ConflictException('CUTOVER_EXECUTOR_ARCHIVE_ORIGINAL_HOLD');
      const [sku]=await q.query('SELECT product_code FROM product_skus WHERE sku_code=$1',[batch.sku_code]);
      await q.query(`INSERT INTO production_batch_qualifications(batch_no,scope_id,company_code,product_code,sku_code,disposition,origin_kind,
        origin_ref,source_type,source_no,evidence_sha256,created_by) VALUES($1,$2,$3,$4,$5,'ARCHIVED_TEST','EXISTING_VERIFIED',$6,$7,$8,$9,$10)`,
        [batch.batch_no,scopes[0],document.company_code,sku?.product_code??batch.product_code??'',batch.sku_code??'',
          `${document.document_no}:${batch.batch_no}`,batch.source_type??'',batch.source_no??'',document.content_hash,operatorId]);
    }
    if(!extension)for(const scope of scopes)await q.query("UPDATE production_cutover_scopes SET state='FENCED' WHERE id=$1",[scope]);
    const openingId=mode==='INIT'?randomUUID():null;
    if(mode==='INIT')for(const domain of domains){
      for(const state of ['FENCED','ACTIVE']){
        const version=Number(domain.version)+1,id=randomUUID();
        await q.query(`INSERT INTO production_inventory_domain_events(id,domain_id,state,version,manifest_id,intent_key,content_hash,reason,signed_by,evidence_file_id,evidence_checksum)
          VALUES($1::uuid,$2,$3,$4,$5,$1::text,$6,$7,$8,$9,$10)`,[id,domain.id,state,version,document.id,document.content_hash,business.reason,
            business.signed_by,business.evidence_file_id,business.evidence_checksum]);
        await q.query('UPDATE production_inventory_domain_states SET state=$2,version=$3 WHERE id=$1',[domain.id,state,version]);domain.version=version;
        if(state==='FENCED')await q.query(`INSERT INTO production_opening_domain_claims(domain_id,manifest_id,opening_receipt_id,scope_id,content_hash,claimed_by)
          VALUES($1,$2,$3,$4,$5,$6)`,[domain.id,document.id,openingId,scopes[0],document.content_hash,operatorId]);
      }
    }
    if(!extension)for(const scope of scopes)await q.query("UPDATE production_cutover_scopes SET state='ACTIVE',activated_at=clock_timestamp() WHERE id=$1",[scope]);
    let receipt:Record<string,unknown>;
    if(mode==='INIT'){
      const lines=document.payload.openingLines as Array<{gradeCode:string;specCode:string;skuCode:string;locationCode:string}>;
      await q.query('SELECT grade_code FROM product_grades WHERE grade_code=ANY($1::text[]) ORDER BY grade_code FOR SHARE NOWAIT',[lines.map(line=>line.gradeCode)]);
      await q.query('SELECT spec_code FROM packaging_specs WHERE spec_code=ANY($1::text[]) ORDER BY spec_code FOR SHARE NOWAIT',[lines.map(line=>line.specCode)]);
      await q.query('SELECT sku_code FROM md_sku_org_scope WHERE sku_code=ANY($1::text[]) ORDER BY sku_code,scope_type,scope_code FOR SHARE NOWAIT',[lines.map(line=>line.skuCode)]);
      await q.query('SELECT variety_code FROM md_product_varieties WHERE variety_code=ANY($1::text[]) ORDER BY variety_code FOR SHARE NOWAIT',
        [document.snapshot.masters.skus.map((sku:{variety_code?:string})=>sku.variety_code).filter(Boolean)]);
      await q.query('SELECT location_code FROM wms_locations WHERE location_code=ANY($1::text[]) ORDER BY location_code FOR SHARE NOWAIT',[lines.map(line=>line.locationCode)]);
      receipt=await new WmsService(q.manager,cls).postApprovedOpening(q.manager,document.id);
      await q.query(`INSERT INTO production_opening_receipts(id,handover_ref,company_code,warehouse_code,scope_id,evidence_sha256,manifest,created_by,receipt,cutover_manifest_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[openingId,document.document_no,document.company_code,document.warehouse_code,scopes[0],document.content_hash,
          JSON.stringify(document.payload),operatorId,JSON.stringify(receipt),document.id]);
    }else{
      const claims=await q.query('SELECT domain_id,opening_receipt_id FROM production_opening_domain_claims WHERE domain_id=ANY($1::uuid[]) ORDER BY domain_id',[domains.map(domain=>domain.id)]);
      if(claims.length!==domains.length)throw new ConflictException('CUTOVER_EXECUTOR_ORIGINAL_OPENING_REQUIRED');
      receipt={manifestId:document.id,documentNo:document.document_no,contentHash:document.content_hash,postingDate:document.payload.postingDate,mode:'ATTACH',
        totalOpening:0,batches:[],domains:domains.map(domain=>({domainId:domain.id,productCode:domain.product_code,
          openingReceiptId:claims.find((claim:{domain_id:string})=>claim.domain_id===domain.id).opening_receipt_id}))};
    }
    await q.query("UPDATE production_cutover_manifests SET state='APPLIED',version=version+1,applied_at=clock_timestamp(),receipt=$2 WHERE id=$1",[document.id,JSON.stringify(receipt)]);
    const [{result}]=await q.query('SELECT record_production_cutover_apply_result($1) AS result',[request.admissionId]);
    return result;
  });
}
