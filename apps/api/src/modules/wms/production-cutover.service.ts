import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { DataSource, EntityManager } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { FileAccessService } from '../file/file-access.service';
import { randomUUID } from 'crypto';
import { hasPerm, PermCode } from '../../auth/permissions.util';
import { DataScopeContext, DataScopeService } from '../org/services/data-scope.service';
import { OrgOwnershipService } from '../org/services/org-ownership.service';
import { assertOfficialInventoryBatches } from './official-inventory';
import { cutoverEvidenceHash, CutoverEvidenceBoundary, inspectProductionCutoverEvidence, readProductionCutoverEvidence } from './production-cutover-evidence';

export interface CutoverCountLine {
  skuCode:string;productCode:string;gradeCode:string;specCode:string;locationCode:string;quantity:number;
  stockStatus:string;productionDate:string|null;expireDate:string|null;costStatus:'UNKNOWN'|'CONFIRMED';
  unitCost:number|null;qualityConfirmed:boolean;
}
export interface CutoverPreparation {
  boundary:CutoverEvidenceBoundary;intentKey:string;postingDate:string;evidenceFileIds:string[];
  physicalTotals:Array<{productCode:string;quantity:number}>;openingLines:CutoverCountLine[];
  decisions:Array<{batchNo:string;disposition:'ARCHIVED_TEST'|'CARRY_FORWARD';evidenceFileId:string;reason:string}>;
  referenceDecisions:Array<{table:string;rowSha256:string;classification:'TEST'|'RESOLVED';evidenceFileId:string;reason:string}>;
}
const text=(value:unknown,label:string,max=128):string=>{
  if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>max)throw new BadRequestException(`${label}无效`);return value;
};

/** Preparation records only. It deliberately has no activation/apply method. A signed count is not a release admission. */
@Injectable()
export class ProductionCutoverService {
  constructor(@InjectDataSource() private readonly db:DataSource,private readonly cls:ClsService,@Optional() private readonly files?:FileAccessService,@Optional() private readonly dataScopes?:DataScopeService){}
  private authorize(company:string,warehouse:string,operation:PermCode='V',finance=false,override?:DataScopeContext){
    const user=this.cls.get('user') as any,scope=override??this.cls.get('dataScope') as DataScopeContext|undefined;
    if(!(operation==='V'?(hasPerm(user?.permissions,'MENU_PROD_INBOUND','V')||hasPerm(user?.permissions,'MENU_PROD_INBOUND','A')||hasPerm(user?.permissions,'MENU_FIN2_AR_LEDGER','E')):hasPerm(user?.permissions,finance?'MENU_FIN2_AR_LEDGER':'MENU_PROD_INBOUND',operation)))throw new ForbiddenException('缺少盘点交接操作权限');
    if(!scope||!scope.isGlobal&&(!scope.allowedCompanyCodes?.includes(company)||!scope.allowedWarehouseCodes?.includes(warehouse)))
      throw new ForbiddenException('盘点交接不在实际公司及仓库授权范围内');
    const actor=String(user?.userId??user?.id??'');if(!actor||!user?.username)throw new ForbiddenException('缺少实名操作人');
    return {actor,username:String(user.username)};
  }
  private async identity(id:string){
    const [d]=await this.db.query('SELECT * FROM production_cutover_manifests WHERE id=$1',[id]);
    if(!d)throw new NotFoundException('盘点交接单不存在');return d;
  }
  private async boundaryAuthority(boundary:CutoverEvidenceBoundary){
    this.authorize(boundary.companyCode,boundary.warehouseCode);
    if(!Array.isArray(boundary.houses)||!boundary.houses.length)throw new BadRequestException('缺少实际鸡舍边界');
    for(const h of boundary.houses){const owner=await new OrgOwnershipService(this.db.manager).resolveHouseIdentity(h.houseCode);
      if(owner.companyCode!==boundary.companyCode)throw new ForbiddenException('鸡舍与盘点公司权威归属不一致');}
  }
  private evidenceAuthority(snapshot:any,override?:DataScopeContext){
    const scope=override??this.cls.get('dataScope') as DataScopeContext|undefined;
    if(!scope)throw new ForbiddenException('缺少有效盘点授权范围');
    if(snapshot.owners?.some((o:any)=>o.company_code!==snapshot.boundary.companyCode))throw new ForbiddenException('盘点鸡舍公司权威归属不一致');
    const facts=[...(snapshot.batches??[]),...(snapshot.sourceEvents??[]),...(snapshot.inventoryDomains??[]),...(snapshot.cutovers??[]),...(snapshot.domains??[])];
    if(!scope.isGlobal&&facts.some((f:any)=>!scope.allowedCompanyCodes.includes(f.company_code)
      ||!scope.allowedWarehouseCodes.includes(f.source_warehouse_code??f.warehouse_code)))
      throw new ConflictException('相关来源涉及尚未授权的公司或仓库，须先取得独立核验权限');
  }
  private normalize(input:CutoverPreparation):CutoverPreparation{
    if(!input||typeof input!=='object'||!input.boundary)throw new BadRequestException('缺少盘点范围');
    text(input.intentKey,'创建意图');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(input.postingDate)||!Number.isFinite(Date.parse(input.postingDate))
      ||new Date(input.postingDate).toISOString().slice(0,10)!==input.postingDate)throw new BadRequestException('盘点记账日无效');
    for(const key of ['physicalTotals','openingLines','decisions','referenceDecisions','evidenceFileIds'] as const)
      if(!Array.isArray(input[key])||input[key].length>5000)throw new BadRequestException('盘点明细或证据清单无效');
    if(!input.evidenceFileIds.length||input.evidenceFileIds.length>20)throw new BadRequestException('须提供实际盘点证据');
    const quantity=(n:unknown,zero=false)=>{if(typeof n!=='number'||!Number.isSafeInteger(n)||n<(zero?0:1)||n>2147483647)throw new BadRequestException('盘点数量须为基本单位枚的整数');return n;};
    const totals=input.physicalTotals.map(t=>({productCode:text(t.productCode,'盘点产品'),quantity:quantity(t.quantity,true)}));
    if(new Set(totals.map(t=>t.productCode)).size!==totals.length)throw new BadRequestException('盘点产品总数重复');
    const lines=input.openingLines.map(l=>{
      if(!['UNKNOWN','CONFIRMED'].includes(l.costStatus)||typeof l.qualityConfirmed!=='boolean'
        ||l.costStatus==='UNKNOWN'&&l.unitCost!==null||l.costStatus==='CONFIRMED'&&(typeof l.unitCost!=='number'||!Number.isFinite(l.unitCost)||l.unitCost<0))
        throw new BadRequestException('期初须明确未知成本或财务核定成本，零成本也须核定');
      for(const date of [l.productionDate,l.expireDate])if(date!==null&&(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)
        ||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))throw new BadRequestException('实物日期须为真实日期或明确未知');
      return {skuCode:text(l.skuCode,'SKU'),productCode:text(l.productCode,'产品'),gradeCode:text(l.gradeCode,'等级'),specCode:text(l.specCode,'规格'),
        locationCode:text(l.locationCode,'仓位'),quantity:quantity(l.quantity),stockStatus:text(l.stockStatus,'库存状态'),productionDate:l.productionDate,
        expireDate:l.expireDate,costStatus:l.costStatus,unitCost:l.unitCost,qualityConfirmed:l.qualityConfirmed};
    });
    const decisions=input.decisions.map(d=>{
      if(!['ARCHIVED_TEST','CARRY_FORWARD'].includes(d.disposition))throw new BadRequestException('批次处置无效');
      return {batchNo:text(d.batchNo,'批次'),disposition:d.disposition,evidenceFileId:text(d.evidenceFileId,'批次处置证据'),reason:text(d.reason,'处置依据',1000)};
    });
    if(new Set(decisions.map(d=>d.batchNo)).size!==decisions.length)throw new BadRequestException('批次处置重复');
    const refs=input.referenceDecisions.map(r=>{
      if(!['TEST','RESOLVED'].includes(r.classification)||!/^[a-f0-9]{64}$/.test(r.rowSha256))throw new BadRequestException('关联事实处置无效');
      return {table:text(r.table,'关联事实类型'),rowSha256:r.rowSha256,classification:r.classification,
        evidenceFileId:text(r.evidenceFileId,'关联处置证据'),reason:text(r.reason,'关联处置依据',1000)};
    });
    if(new Set(refs.map(r=>`${r.table}:${r.rowSha256}`)).size!==refs.length)throw new BadRequestException('关联事实处置重复');
    return {boundary:input.boundary,intentKey:input.intentKey,postingDate:input.postingDate,physicalTotals:totals,openingLines:lines,
      decisions,referenceDecisions:refs,evidenceFileIds:[...new Set(input.evidenceFileIds.map(f=>text(f,'盘点附件')))].sort()};
  }
  private async proofs(m:EntityManager,d:any,ids:string[],uploader?:string){
    if(!ids.length)throw new BadRequestException('缺少实际盘点证据');
    const files=await m.query(`SELECT file_id,checksum,uploaded_by FROM file_metadata WHERE file_id=ANY($1::text[])
      AND module_code='PRODUCTION_CUTOVER' AND owner_type='WAREHOUSE' AND owner_id=$2 AND company_code=$3
      AND status='ACTIVE' AND deleted_at IS NULL AND visibility IN ('PROTECTED','PRIVATE') AND checksum ~ '^[a-f0-9]{64}$' FOR SHARE`,
      [ids,d.warehouse_code,d.company_code]);
    if(files.length!==new Set(ids).size||uploader&&files.some((f:any)=>f.uploaded_by!==uploader))throw new ConflictException('盘点原保护附件无效或不属于实名签认人');
    return files.sort((a:any,b:any)=>a.file_id.localeCompare(b.file_id));
  }
  async inspect(boundary:CutoverEvidenceBoundary){
    await this.boundaryAuthority(boundary);
    return this.db.transaction('REPEATABLE READ',async m=>{
      await m.query('SET TRANSACTION READ ONLY');const e=await readProductionCutoverEvidence(m,boundary);
      // A company-scoped preparer must never receive another company's descendant stock or operational documents.
      if(e.snapshot.warnings.some(w=>w.startsWith('CROSS_COMPANY_')))
        throw new ConflictException('存在跨公司来源后代，须先按独立授权范围核验；当前范围未返回他公司资料');
      this.evidenceAuthority(e.snapshot);return {...e,references:Object.entries({...e.snapshot.obligations,...e.snapshot.finance}).flatMap(([table,rows])=>rows.map(fact=>({table,rowSha256:cutoverEvidenceHash(fact),fact})))};
    });
  }
  async locations(company:string,warehouse:string){
    this.authorize(company,warehouse);return this.db.query(`SELECT l.location_code,l.warehouse_code,l.status,
      to_jsonb(l)->>'location_name' AS location_name FROM wms_locations l JOIN wms_warehouses w ON w.warehouse_code=l.warehouse_code
      WHERE w.company_code=$1 AND w.warehouse_code=$2 AND w.status='ACTIVE' AND l.status IN ('ACTIVE','NORMAL') ORDER BY l.location_code`,[company,warehouse]);
  }
  async list(company:string,warehouse:string){
    this.authorize(company,warehouse);return this.db.query(`SELECT id,document_no,state,version,company_code,warehouse_code,
      created_by,created_at,content_hash,applied_at FROM production_cutover_manifests WHERE company_code=$1 AND warehouse_code=$2 ORDER BY created_at DESC LIMIT 100`,[company,warehouse]);
  }
  async get(id:string){
    const d=await this.identity(id);this.authorize(d.company_code,d.warehouse_code);if(d.snapshot)this.evidenceAuthority(d.snapshot);
    const signatures=await this.db.query(`SELECT signature_role,content_hash,snapshot_sha256,signed_by,signed_at,evidence_file_id,evidence_checksum,reason
      FROM production_cutover_signatures WHERE manifest_id=$1 ORDER BY signature_role`,[id]);
    return {...d,signatures,references:Object.entries({...d.snapshot?.obligations,...d.snapshot?.finance}).flatMap(([table,rows])=>(rows as Record<string,unknown>[]).map(fact=>({table,rowSha256:cutoverEvidenceHash(fact),fact}))),releaseAdmission:false,activationAuthorized:false};
  }
  async evidence(id:string,fileId:string){
    const d=await this.get(id);if(!this.files)throw new NotFoundException('附件不可访问');
    const ids=new Set([...d.payload.evidenceFileIds,...d.payload.decisions.map((r:any)=>r.evidenceFileId),
      ...d.payload.referenceDecisions.map((r:any)=>r.evidenceFileId),...d.signatures.map((r:any)=>r.evidence_file_id)]);
    if(!ids.has(fileId))throw new NotFoundException('附件不属于该盘点原单');
    const user=this.cls.get('user') as any;
    const menu=hasPerm(user?.permissions,'MENU_PROD_INBOUND','V')?'MENU_PROD_INBOUND':hasPerm(user?.permissions,'MENU_PROD_INBOUND','A')?'MENU_PROD_INBOUND':'MENU_FIN2_AR_LEDGER';
    const operation=hasPerm(user?.permissions,menu,'V')?'V':menu==='MENU_PROD_INBOUND'?'A':'E';
    return this.files.openProtectedFile(fileId,{moduleCode:'PRODUCTION_CUTOVER',ownerType:'WAREHOUSE',ownerId:d.warehouse_code,
      companyCode:d.company_code,requiredMenu:menu,requiredOperation:operation},'preview');
  }
  async create(raw:CutoverPreparation){
    const input=this.normalize(raw),actor=this.authorize(input.boundary.companyCode,input.boundary.warehouseCode,'C');
    await this.boundaryAuthority(input.boundary);const creationHash=cutoverEvidenceHash(input);
    return this.db.transaction(async m=>{
      await m.query("SELECT pg_advisory_xact_lock(hashtext('phoenix:cutover-intent'),hashtext($1))",[`${input.boundary.companyCode}:${input.intentKey}`]);
      const [prior]=await m.query('SELECT * FROM production_cutover_manifests WHERE company_code=$1 AND intent_key=$2',[input.boundary.companyCode,input.intentKey]);
      if(prior){if(prior.creation_hash!==creationHash)throw new ConflictException('相同创建意图已用于不同盘点内容');return prior;}
      const evidence=await readProductionCutoverEvidence(m,input.boundary);
      if(evidence.snapshot.warnings.some(w=>['CROSS_COMPANY_DESCENDANTS_REQUIRE_SEPARATE_AUTHORITY','HOUSE_COMPANY_IDENTITY_UNRESOLVED','WAREHOUSE_COMPANY_IDENTITY_UNRESOLVED'].includes(w)||w.startsWith('CROSS_COMPANY_')))
        throw new ConflictException('盘点边界归属未确认或涉及他公司后代，请先分别核验');
      await this.proofs(m,{company_code:input.boundary.companyCode,warehouse_code:input.boundary.warehouseCode},input.evidenceFileIds);
      const id=randomUUID(),no=`CUT-${id}`;
      const {boundary,...payload}=input;
      const [d]=await m.query(`INSERT INTO production_cutover_manifests(id,document_no,company_code,warehouse_code,intent_key,creation_hash,boundary,payload,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[id,no,boundary.companyCode,boundary.warehouseCode,input.intentKey,creationHash,
          JSON.stringify(evidence.snapshot.boundary),JSON.stringify(payload),actor.actor]);return d;
    });
  }
  async edit(id:string,version:number,raw:CutoverPreparation){
    const input=this.normalize(raw),identity=await this.identity(id);this.authorize(identity.company_code,identity.warehouse_code,'E');
    if(input.boundary.companyCode!==identity.company_code||input.boundary.warehouseCode!==identity.warehouse_code||input.intentKey!==identity.intent_key)
      throw new ConflictException('公司、仓库和原创建意图不可改动，请另建盘点单');
    return this.db.transaction(async m=>{
      const [d]=await m.query('SELECT * FROM production_cutover_manifests WHERE id=$1 FOR UPDATE',[id]);
      if(d.state!=='DRAFT'||d.version!==version)throw new ConflictException('盘点版本或状态已变化');
      const e=await readProductionCutoverEvidence(m,input.boundary);this.evidenceAuthority(e.snapshot);
      if(e.snapshot.warnings.some(w=>w.startsWith('CROSS_COMPANY_')||w.includes('IDENTITY_UNRESOLVED')))throw new ConflictException('盘点归属或他公司关联须先独立核验');
      await this.proofs(m,d,input.evidenceFileIds);const {boundary,...payload}=input;
      const [updated]=await m.query(`WITH changed AS(UPDATE production_cutover_manifests SET version=version+1,boundary=$2,payload=$3 WHERE id=$1 RETURNING *) SELECT * FROM changed`,
        [id,JSON.stringify(e.snapshot.boundary),JSON.stringify(payload)]);return updated;
    });
  }
  async freeze(id:string,version:number){
    const identity=await this.identity(id);this.authorize(identity.company_code,identity.warehouse_code,'E');
    const captured=await inspectProductionCutoverEvidence(this.db,identity.boundary);
    return this.db.transaction(async m=>{
      const [d]=await m.query('SELECT * FROM production_cutover_manifests WHERE id=$1 FOR UPDATE',[id]);
      if(d.version!==version||d.state!=='DRAFT')throw new ConflictException('盘点版本或状态已变化');
      const e=captured;this.evidenceAuthority(e.snapshot);
      if(e.snapshot.missingTables.length)throw new ConflictException('必查资料尚未齐备，禁止冻结或签认空盘点');
      if(e.snapshot.warnings.length)throw new ConflictException({code:'CUTOVER_BOUNDARY_HOLD',warnings:e.snapshot.warnings});
      const ids=[...new Set<string>([...d.payload.evidenceFileIds,...d.payload.decisions.map((r:any)=>r.evidenceFileId),...d.payload.referenceDecisions.map((r:any)=>r.evidenceFileId)])];
      const proofs=await this.proofs(m,d,ids);
      const batches=e.snapshot.batches,decisions=d.payload.decisions as CutoverPreparation['decisions'];
      if(batches.length!==decisions.length||batches.some(b=>!decisions.some(r=>r.batchNo===b.batch_no)))throw new ConflictException('须逐一确认范围内原批及全部后代的测试归档或合法接续');
      const q=new Map(e.snapshot.qualification.map(row=>[row.batch_no,row]));
      for(const b of batches){const decision=decisions.find(r=>r.batchNo===b.batch_no)!;
        if(decision.disposition==='CARRY_FORWARD'&&(q.get(b.batch_no)?.disposition!=='QUALIFIED'||!b.company_code||b.qty==null||Number(b.qty)<0))
          throw new ConflictException('合法接续须有已存在的实际来源资格，待核实批次不能自动准入');
        if(decision.disposition==='ARCHIVED_TEST'&&q.has(b.batch_no)&&q.get(b.batch_no)?.disposition!=='ARCHIVED_TEST')
          throw new ConflictException('原正式资格不可改写为测试，须先处理该来源控制');
        if(b.qty==null||!Number.isSafeInteger(Number(b.qty))||Number(b.qty)<0||b.qty_available==null||Number(b.qty_available)<0||Number(b.qty_available)>Number(b.qty))throw new ConflictException('原库存可用量异常，须先核验');
        if(b.status==='RESERVED'||b.status==='AVAILABLE'&&Number(b.qty)!==Number(b.qty_available))throw new ConflictException('尚有真实预占或受限数量，须先核对和处理该实物边界');
      }
      await assertOfficialInventoryBatches(m,decisions.filter(r=>r.disposition==='CARRY_FORWARD').map(r=>r.batchNo),false);
      for(const product of d.boundary.productCodes){
        const totals=d.payload.physicalTotals.filter((t:any)=>t.productCode===product);
        const carry=batches.filter(b=>b.warehouse_code===d.warehouse_code&&b.product_code===product&&decisions.find(r=>r.batchNo===b.batch_no)?.disposition==='CARRY_FORWARD')
          .reduce((n,b)=>n+Number(b.qty),0);
        const opening=d.payload.openingLines.filter((l:any)=>l.productCode===product).reduce((n:number,l:any)=>n+l.quantity,0);
        if(totals.length!==1||totals[0].quantity!==carry+opening)throw new ConflictException('实盘总数必须等于合法接续实物及本次独立期初；零开账也须明确确认');
      }
      if(d.payload.physicalTotals.length!==d.boundary.productCodes.length||d.payload.openingLines.some((l:any)=>!d.boundary.productCodes.includes(l.productCode)))
        throw new ConflictException('实盘产品范围不完整或超出边界');
      for(const line of d.payload.openingLines){
        const [master]=await m.query(`SELECT sku.product_code,sku.grade_code,sku.spec_code,spec.base_unit,g.default_stock_status
          FROM product_skus sku JOIN mst_products p ON p.product_code=sku.product_code JOIN product_grades g ON g.grade_code=sku.grade_code
          JOIN packaging_specs spec ON spec.spec_code=sku.spec_code WHERE sku.sku_code=$1 AND sku.status='ACTIVE' AND p.status='ACTIVE'
            AND g.status='ACTIVE' AND spec.status='ACTIVE' FOR SHARE OF sku,p,g,spec`,[line.skuCode]);
        const [location]=await m.query("SELECT 1 FROM wms_locations WHERE location_code=$1 AND warehouse_code=$2 AND status IN ('ACTIVE','NORMAL') FOR SHARE",[line.locationCode,d.warehouse_code]);
        const [status]=await m.query("SELECT 1 FROM sys_dict WHERE dict_type='INV_STOCK_STATUS' AND dict_code=$1 AND status='ACTIVE'",[line.stockStatus]);
        if(!master||master.product_code!==line.productCode||master.grade_code!==line.gradeCode||master.spec_code!==line.specCode
          ||master.base_unit!=='枚'||!location||!status||line.stockStatus==='RESERVED')throw new ConflictException('期初实物的 SKU、产品、等级、规格、仓位或状态不匹配');
        if(line.productionDate&&line.productionDate>d.payload.postingDate||line.productionDate&&line.expireDate&&line.expireDate<line.productionDate)
          throw new ConflictException('期初实物生产日或效期不合理');
        if(line.stockStatus==='AVAILABLE'&&(line.costStatus!=='CONFIRMED'||line.qualityConfirmed!==true||!line.productionDate||!line.expireDate
          ||line.expireDate<d.payload.postingDate||master.default_stock_status&&master.default_stock_status!=='AVAILABLE'))
          throw new ConflictException('成本、质检或日期未核定的实物期初须受限登记');
      }
      const facts={...e.snapshot.obligations,...e.snapshot.finance};
      for(const [table,rows] of Object.entries(facts))for(const row of rows){
        const hash=cutoverEvidenceHash(row),decision=d.payload.referenceDecisions.find((r:any)=>r.table===table&&r.rowSha256===hash);
        if(!decision)throw new ConflictException(`关联事实 ${table} 尚未有据分类与处置`);
        if(decision.classification==='RESOLVED'&&!this.resolvedReference(table,row,e.snapshot.obligations))
          throw new ConflictException(`关联事实 ${table} 仍未实际终结，不能仅声明已处理`);
      }
      const payload={...d.payload,proofs},contentHash=cutoverEvidenceHash({boundary:d.boundary,payload,snapshotSha256:e.snapshotSha256});
      const [frozen]=await m.query(`WITH changed AS(UPDATE production_cutover_manifests SET state='READY',version=version+1,payload=$2,snapshot=$3,snapshot_sha256=$4,content_hash=$5 WHERE id=$1 RETURNING *) SELECT * FROM changed`,
        [id,JSON.stringify(payload),JSON.stringify(e.snapshot),e.snapshotSha256,contentHash]);return {...frozen,releaseAdmission:false,activationAuthorized:false};
    });
  }
  private resolvedReference(table:string,row:Record<string,unknown>,facts:Record<string,Record<string,unknown>[]>):boolean{
    if(table==='sal_order_item_batch_allocations')return Number(row.reserved_qty)>0&&Number(row.outbound_qty)===0&&Number(row.released_qty)===Number(row.reserved_qty);
    if(table==='sal_order_items')return (facts.sal_sales_orders??[]).some(h=>String(h.id)===String(row.sales_order_id)&&['CANCELLED','CANCELED','CLOSED'].includes(String(h.status)))
      &&(facts.sal_order_item_batch_allocations??[]).filter(a=>String(a.sales_order_item_id)===String(row.id)).every(a=>Number(a.outbound_qty)===0&&Number(a.reserved_qty)===Number(a.released_qty));
    if(table==='store_sale_allocations')return Number(row.allocated_qty)>0&&Number(row.returned_qty)===Number(row.allocated_qty)
      &&(facts.sal_store_sales??[]).some(s=>String(s.id)===String(row.sale_id)&&['CANCELLED','REFUNDED','VOIDED'].includes(String(s.status)));
    if(table==='wms_transfer_items')return Number(row.in_transit_qty??0)===0&&(facts.wms_transfer??[]).some(t=>t.transfer_no===row.transfer_no
      &&['CANCELLED','RECEIVED','COMPLETED'].includes(String(t.status)));
    return ['CANCELLED','CANCELED','COMPLETED','CLOSED','VOIDED'].includes(String(row.status??''));
  }
  async sign(id:string,input:{role:'BUSINESS'|'FINANCE';contentHash:string;snapshotSha256:string;evidenceFileId:string;reason:string}){
    if(!['BUSINESS','FINANCE'].includes(input.role))throw new BadRequestException('签认角色无效');
    text(input.reason,'签认依据',1000);const identity=await this.identity(id);
    if(!this.dataScopes)throw new ForbiddenException('缺少签认角色的实际授权范围解析');
    const user=this.cls.get('user') as any,roles=user?.roles??(user?.role?[user.role]:[]);
    const roleScope=await this.dataScopes.resolve(String(user?.userId??user?.id??''),roles,input.role==='FINANCE'?'MENU_FIN2_AR_LEDGER':'MENU_PROD_INBOUND',user?.perms_version);
    const actor=this.authorize(identity.company_code,identity.warehouse_code,input.role==='FINANCE'?'E':'A',input.role==='FINANCE',roleScope);
    return this.db.transaction(async m=>{
      const [d]=await m.query('SELECT * FROM production_cutover_manifests WHERE id=$1 FOR UPDATE',[id]);
      if(d.content_hash!==input.contentHash||d.snapshot_sha256!==input.snapshotSha256)throw new ConflictException('签认摘要与冻结盘点不一致');
      const [prior]=await m.query('SELECT * FROM production_cutover_signatures WHERE manifest_id=$1 AND signature_role=$2 AND content_hash=$3',[id,input.role,input.contentHash]);
      if(prior){if(prior.signed_by!==actor.actor||prior.evidence_file_id!==input.evidenceFileId||prior.reason!==input.reason)throw new ConflictException('该角色已由不同实名依据签认');return prior;}
      this.evidenceAuthority(d.snapshot,roleScope);
      if(d.state!=='READY'||d.created_by===actor.actor)throw new ConflictException('须由盘点制单人以外的业务及财务负责人签认');
      const originals=await this.proofs(m,d,d.payload.proofs.map((f:any)=>f.file_id));
      if(cutoverEvidenceHash(originals)!==cutoverEvidenceHash(d.payload.proofs))throw new ConflictException('冻结盘点的原始附件身份或摘要已改变');
      const [file]=await this.proofs(m,d,[input.evidenceFileId],actor.username);
      const [signature]=await m.query(`INSERT INTO production_cutover_signatures(id,manifest_id,signature_role,content_hash,snapshot_sha256,signed_by,evidence_file_id,evidence_checksum,reason)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[randomUUID(),id,input.role,input.contentHash,input.snapshotSha256,actor.actor,file.file_id,file.checksum,input.reason]);
      const [{n}]=await m.query('SELECT COUNT(DISTINCT signature_role)::int AS n FROM production_cutover_signatures WHERE manifest_id=$1 AND content_hash=$2',[id,d.content_hash]);
      if(n===2)await m.query("UPDATE production_cutover_manifests SET state='APPROVED',version=version+1 WHERE id=$1",[id]);
      return signature;
    });
  }
  async cancel(id:string,version:number){
    const identity=await this.identity(id);this.authorize(identity.company_code,identity.warehouse_code,'E');
    const rows=await this.db.query(`WITH changed AS(UPDATE production_cutover_manifests SET state='CANCELLED',version=version+1
      WHERE id=$1 AND version=$2 AND state IN ('DRAFT','READY','APPROVED') RETURNING id,state,version) SELECT * FROM changed`,[id,version]);
    if(!rows.length)throw new ConflictException('原盘点已变更或已应用');return rows[0];
  }
}
