import { BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException,Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource,EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { randomUUID } from 'crypto';
import { hasPerm,PermCode } from '../../../auth/permissions.util';
import { DataScopeContext } from '../../org/services/data-scope.service';
import { SkuPolicy } from '../../product-master/services/sku-policy';
import { WmsService } from '../../wms/wms.service';
import { withApprovedInventoryConversion } from '../../wms/official-conversion-context';
import { writeInvLedger } from '../../wms/inventory-ledger.writer';
import { INV_LEDGER_CHANGE_TYPE } from '../../wms/inv-ledger-change-types';
import { singaporeBusinessDate } from '../../wms/temp-production-reversal';
import { productionContentHash } from './production-source-facts';
import { assertEggDate } from './egg-inventory.service';
import { FileAccessService } from '../../file/file-access.service';

type Fact=Record<string,any>;
export interface ConversionInput {rawSegmentId?:string;parentBatchNo?:string;quantity:number}
export interface ConversionOutput {
  outputKind:'STOCK'|'WIP'|'LOSS';gradeCode:string;quantity:number;evidenceFileId:string;
  skuCode?:string;locationCode?:string;lossReason?:string;
}
export interface InventoryConversionDraft {
  companyCode:string;warehouseCode:string;productCode:string;operationKind:'GRADING'|'PACKING'|'REPACKING';
  physicalGroupRef:string;operationDate:string;intentKey:string;inputs:ConversionInput[];outputs:ConversionOutput[];
}
const text=(v:unknown):string=>{
  if(typeof v!=='string'||!v.trim()||v!==v.trim()||v.length>128)throw new BadRequestException('实际转换身份须完整且无首尾空格');return v;
};
const count=(v:unknown):number=>{
  if(typeof v!=='number'||!Number.isSafeInteger(v)||v<=0||v>2147483647)throw new BadRequestException('投入和产出须为实际正整数枚');return v;
};
const uuid=(v:unknown):string=>{const s=text(v);if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(s))throw new BadRequestException('实际来源ID无效');return s;};

/** One signed physical mixing group. No inferred yield, parent allocation, financial allocation or production re-credit. */
@Injectable()
export class OfficialInventoryConversionService {
  constructor(@InjectDataSource() private readonly db:DataSource,private readonly cls:ClsService,private readonly wms:WmsService,
    @Optional() private readonly files?:FileAccessService){}

  private authorize(company:string,warehouse:string,operation:PermCode='V'){
    const actor=this.cls.get<Fact>('user'),scope=this.cls.get<DataScopeContext>('dataScope');
    const permitted=operation==='V'?(['V','C','E','A'] as PermCode[]).some(p=>hasPerm(actor?.permissions,'MENU_PROD_INBOUND',p))
      :hasPerm(actor?.permissions,'MENU_PROD_INBOUND',operation);
    if(!permitted||!scope||typeof scope.isGlobal!=='boolean'||!scope.isGlobal&&(!Array.isArray(scope.allowedCompanyCodes)
      ||!Array.isArray(scope.allowedWarehouseCodes)||!scope.allowedCompanyCodes.includes(company)||!scope.allowedWarehouseCodes.includes(warehouse)))
      throw new ForbiddenException('缺少该公司及仓库实际转换权限');
    const id=String(actor?.userId??actor?.id??'');if(!id||!actor?.username)throw new ForbiddenException('缺少实名转换操作人');return id;
  }
  private async document(id:string,m:Pick<DataSource,'query'>=this.db,lock=false){
    const [d]=await m.query(`SELECT *,operation_date::text AS operation_date,expected_posting_date::text AS expected_posting_date
      FROM production_conversion_documents WHERE id=$1${lock?' FOR UPDATE':''}`,[uuid(id)]);
    if(!d)throw new NotFoundException('实际转换单不存在');this.authorize(d.company_code,d.warehouse_code);return d;
  }
  private normalize(input:InventoryConversionDraft):InventoryConversionDraft{
    for(const k of ['companyCode','warehouseCode','productCode','physicalGroupRef','intentKey'] as const)text(input[k]);
    assertEggDate(input.operationDate);
    if(!['GRADING','PACKING','REPACKING'].includes(input.operationKind)||input.operationDate>singaporeBusinessDate()
      ||!Array.isArray(input.inputs)||!input.inputs.length||input.inputs.length>200
      ||!Array.isArray(input.outputs)||!input.outputs.length||input.outputs.length>200)throw new BadRequestException('须逐实际作业组填写完整投入及实际产出');
    const inputs=input.inputs.map((i):ConversionInput=>{
      const raw=i.rawSegmentId?uuid(i.rawSegmentId):null,parent=i.parentBatchNo?text(i.parentBatchNo):null;
      if(Boolean(raw)===Boolean(parent))throw new BadRequestException('每条投入须且只能选择一个实际原始段或库存父批');
      return {...(raw?{rawSegmentId:raw}:{parentBatchNo:parent!}),quantity:count(i.quantity)};
    }).sort((a,b)=>String(a.rawSegmentId??a.parentBatchNo).localeCompare(String(b.rawSegmentId??b.parentBatchNo)));
    if(new Set(inputs.map(i=>`${i.rawSegmentId?'RAW':'INV'}:${i.rawSegmentId??i.parentBatchNo}`)).size!==inputs.length)throw new BadRequestException('实际投入不可重复列示');
    const outputs=input.outputs.map(o=>{
      text(o.gradeCode);text(o.evidenceFileId);count(o.quantity);
      if(!['STOCK','WIP','LOSS'].includes(o.outputKind))throw new BadRequestException('产出须明确为成品、实际在制或实际损耗');
      if(o.outputKind==='LOSS'){
        if(o.skuCode||o.locationCode)throw new BadRequestException('损耗不能同时创建实物库存');
        return {outputKind:o.outputKind,gradeCode:o.gradeCode,quantity:o.quantity,evidenceFileId:o.evidenceFileId,lossReason:text(o.lossReason)};
      }
      if(o.lossReason)throw new BadRequestException('实际库存不可声明为损耗');
      return {outputKind:o.outputKind,gradeCode:o.gradeCode,quantity:o.quantity,evidenceFileId:o.evidenceFileId,
        skuCode:text(o.skuCode),locationCode:text(o.locationCode)};
    });
    if(inputs.reduce((n,i)=>n+i.quantity,0)!==outputs.reduce((n,o)=>n+o.quantity,0))throw new BadRequestException('实际投入枚数须等于库存产出与实际损耗之和');
    return {companyCode:input.companyCode,warehouseCode:input.warehouseCode,productCode:input.productCode,operationKind:input.operationKind,
      physicalGroupRef:input.physicalGroupRef,operationDate:input.operationDate,intentKey:input.intentKey,inputs,outputs};
  }
  private async lockBoundary(m:EntityManager,d:Fact){
    await m.query('SELECT official_inventory_lock_operation(NULL,$1,$2,$3,NULL,NULL,\'{}\')',[d.company_code,d.warehouse_code,d.product_code]);
    await m.query("SELECT pg_advisory_xact_lock_shared(hashtext('phoenix:inventory-product'),hashtext($1))",[`${d.company_code}:${d.product_code}`]);
    const [warehouse]=await m.query("SELECT * FROM wms_warehouses WHERE warehouse_code=$1 AND company_code=$2 AND status='ACTIVE' AND domain='OPERATIONAL' FOR SHARE",[d.warehouse_code,d.company_code]);
    const domains=await m.query(`SELECT domain.scope_id FROM production_inventory_domains domain JOIN production_cutover_scopes scope ON scope.id=domain.scope_id
      WHERE domain.company_code=$1 AND domain.warehouse_code=$2 AND domain.product_code=$3 AND scope.state IN('ACTIVE','SUSPENDED')
      ORDER BY scope.id FOR SHARE OF scope`,[d.company_code,d.warehouse_code,d.product_code]);
    const [state]=await m.query('SELECT state FROM production_inventory_domain_states WHERE company_code=$1 AND warehouse_code=$2 AND product_code=$3 FOR SHARE',
      [d.company_code,d.warehouse_code,d.product_code]);
    if(!warehouse||!domains.length||state&&state.state!=='ACTIVE')throw new ConflictException('转换目标实物域未受控启用或已经暂停');
    if(!state&&!(await m.query(`SELECT 1 FROM production_cutover_scopes WHERE id=ANY($1::uuid[]) AND state='ACTIVE'`,[domains.map((r:Fact)=>r.scope_id)])).length)
      throw new ConflictException('转换目标来源范围已暂停');
    this.authorize(d.company_code,d.warehouse_code);
  }
  private async facts(m:EntityManager,d:Fact,request:InventoryConversionDraft,postingDate:string,requirePeriod=false){
    let postingPeriod:Fact|null=null;
    if(requirePeriod){
      await m.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`production-period:${d.company_code}:${postingDate.slice(0,7)}`]);
      const [period]=await m.query(`SELECT p.* FROM production_posting_periods p JOIN file_metadata f ON f.file_id=p.evidence_file_id
        AND f.checksum=p.evidence_checksum AND f.status='ACTIVE' AND f.deleted_at IS NULL AND f.company_code=p.company_code
        AND f.module_code='PRODUCTION_INBOUND' AND f.owner_type='HOUSE' AND f.owner_id=p.owner_house_code AND f.visibility IN('PROTECTED','PRIVATE')
        JOIN sys_user u ON u.user_id::text=p.signed_by AND u.username=f.uploaded_by AND u.status::text IN('1','ACTIVE')
        WHERE p.company_code=$1 AND p.period_month=$2 AND p.state='OPEN' FOR SHARE OF p,f,u`,[d.company_code,postingDate.slice(0,7)]);
      if(!period)throw new ConflictException('实际转换记账期间须经财务实名签认开放');
      postingPeriod={periodMonth:period.period_month,version:period.version,evidenceChecksum:period.evidence_checksum};
    }
    const [product]=await m.query("SELECT * FROM mst_products WHERE product_code=$1 AND status='ACTIVE' FOR SHARE",[d.product_code]);
    if(!product)throw new ConflictException('实际品目未启用');
    const inputs:Fact[]=[];
    for(const line of request.inputs){
      if(line.rawSegmentId){
        const [r]=await m.query(`SELECT s.*,receipt.state,receipt.company_code,receipt.warehouse_code,receipt.scope_id,receipt.payload->'profile' AS profile,
          receipt.production_date::text AS production_date,(receipt.production_date+30)::text AS expire_date
          FROM production_raw_receipt_segments s JOIN production_raw_receipts receipt ON receipt.id=s.receipt_id WHERE s.id=$1 FOR UPDATE OF s`,[line.rawSegmentId]);
        if(!r)throw new ConflictException('实际原始收蛋分段不存在');
        const [scope]=await m.query("SELECT * FROM production_cutover_scopes WHERE id=$1 FOR SHARE",[r.scope_id]);
        const [{used}]=await m.query(`SELECT COALESCE(SUM(input.quantity),0)::int AS used FROM production_conversion_inputs input
          JOIN production_conversion_documents doc ON doc.id=input.document_id WHERE input.raw_segment_id=$1 AND doc.state='POSTED'`,[r.id]);
        if(r.state!=='POSTED'||scope?.state!=='ACTIVE'||r.company_code!==d.company_code||r.warehouse_code!==d.warehouse_code
          ||r.profile?.varietyCode!==product.variety_code||r.production_date>d.operation_date||r.expire_date<postingDate
          ||Number(used)+line.quantity>Number(r.quantity))throw new ConflictException('原始分段归属、品种、效期、来源状态或实际剩余数量不符');
        inputs.push({rawSegmentId:r.id,parentBatchNo:null,rawReceiptId:r.receipt_id,companyCode:d.company_code,warehouseCode:d.warehouse_code,
          quantity:line.quantity,gradeCode:r.grade_code,productionDate:r.production_date,expireDate:r.expire_date,sourceKey:r.source_key,
          actualSourceSnapshot:r.snapshot,sourceSnapshotHash:productionContentHash(r.snapshot),reportHash:r.report_hash,costStatus:'UNKNOWN',unitCost:null,knownAmount:null,
          currencyCode:null,recordedUnitCost:null,recordedAmount:null});
      }else{
        const [b]=await m.query(`SELECT *,egg_date::text AS egg_date,expire_date::text AS expire_date FROM inv_batches WHERE batch_no=$1 FOR UPDATE`,[line.parentBatchNo]);
        const [{available_on:availableOn}]=await m.query('SELECT official_conversion_parent_available_on($1)::text AS available_on',[line.parentBatchNo]);
        if(!b||b.company_code!==d.company_code||b.warehouse_code!==d.warehouse_code||b.product_code!==d.product_code||b.unit!=='枚'
          ||b.status!=='AVAILABLE'||Number(b.qty)<line.quantity||Number(b.qty_available)<line.quantity||!b.egg_date||!b.expire_date
          ||b.egg_date>d.operation_date||b.expire_date<postingDate||!availableOn||availableOn>d.operation_date)throw new ConflictException('实际库存父批归属、品目、可用量、实际取得日期或效期不符');
        await m.query('SELECT official_inventory_lock_operation($1,$2,$3,$4,$5,$6,NULL)',[b.batch_no,b.company_code,b.warehouse_code,b.product_code,b.sku_code,b.material_code]);
        const [qualification]=await m.query("SELECT * FROM production_batch_qualifications WHERE batch_no=$1 AND disposition='QUALIFIED' FOR SHARE",[b.batch_no]);
        const [cost]=await m.query(`SELECT official_inventory_writable($1,$2,$3,$4,$5,$6) AS writable,official_inventory_cost_known($1) AS known,
          official_inventory_proven_currency($1) AS currency,$7::numeric AS price,($7::numeric*$8::integer)::text AS amount`,
          [b.batch_no,b.company_code,b.warehouse_code,b.product_code,b.sku_code,b.material_code,b.unit_cost,line.quantity]);
        if(!qualification||!cost.writable)throw new ConflictException('实际父批未获得完整正式资格或已暂停');
        inputs.push({rawSegmentId:null,parentBatchNo:b.batch_no,rawReceiptId:null,companyCode:d.company_code,warehouseCode:d.warehouse_code,
          quantity:line.quantity,gradeCode:b.grade_code_std??b.quality_grade,productCode:b.product_code,skuCode:b.sku_code,
          productionDate:b.egg_date,expireDate:b.expire_date,availableOn,qualificationHash:productionContentHash(qualification),
          costStatus:cost.known&&cost.currency?'CONFIRMED':'UNKNOWN',unitCost:cost.known&&cost.currency?cost.price:null,
          knownAmount:cost.known&&cost.currency?cost.amount:null,currencyCode:cost.known?cost.currency:null,
          recordedUnitCost:cost.known?cost.price:null,recordedAmount:cost.known?cost.amount:null});
      }
    }
    const eggDate=inputs.map(i=>i.productionDate).sort()[0],expireDate=inputs.map(i=>i.expireDate).sort()[0],outputs:Fact[]=[];
    for(const line of request.outputs){
      const [file]=await m.query(`SELECT checksum FROM file_metadata WHERE file_id=$1 AND company_code=$2 AND owner_type='WAREHOUSE' AND owner_id=$3
        AND module_code='PRODUCTION_CONVERSION' AND status='ACTIVE' AND deleted_at IS NULL AND visibility IN('PROTECTED','PRIVATE')
        AND mime_type IN('application/pdf','image/jpeg','image/png','image/webp') FOR SHARE`,
        [line.evidenceFileId,d.company_code,d.warehouse_code]);
      if(!file?.checksum||!/^[a-f\d]{64}$/.test(file.checksum))throw new ConflictException('产出或损耗缺少本公司本仓实际保护附件及校验摘要');
      const [grade]=await m.query("SELECT * FROM product_grades WHERE grade_code=$1 AND status='ACTIVE' FOR SHARE",[line.gradeCode]);
      if(!grade)throw new ConflictException('实际分级已停用');
      if(line.outputKind==='LOSS'){
        if(!(await m.query("SELECT 1 FROM sys_dict WHERE dict_type='PRODUCTION_CONVERSION_LOSS_REASON' AND dict_code=$1 AND status='ACTIVE' FOR SHARE",[line.lossReason])).length)
          throw new ConflictException('须选择有效的实际损耗原因');
        outputs.push({...line,skuCode:null,locationCode:null,evidenceChecksum:file.checksum});
      }else{
        const sku=await SkuPolicy.requireUsable(m,line.skuCode,'stock',d.company_code);
        const [location]=await m.query("SELECT 1 FROM wms_locations WHERE location_code=$1 AND warehouse_code=$2 AND status IN('ACTIVE','NORMAL') FOR SHARE",[line.locationCode,d.warehouse_code]);
        if(!location||sku.product_code!==d.product_code||sku.grade_code!==line.gradeCode||sku.base_unit!=='枚')throw new ConflictException('产出SKU、基本枚数、分级或实际仓位不符');
        const inventoryStatus=grade.default_stock_status??(line.gradeCode==='BROKEN'?'DAMAGED':line.gradeCode==='DIRTY'?'QUARANTINE':'AVAILABLE');
        if(!['AVAILABLE','QUARANTINE','DAMAGED'].includes(inventoryStatus))throw new ConflictException('该档库存状态须先经实际质检核验');
        outputs.push({...line,lossReason:null,specCode:sku.spec_code,inventoryStatus,eggDate,expireDate,evidenceChecksum:file.checksum});
      }
    }
    for(const grade of ['DIRTY','BROKEN'])if(inputs.filter(i=>i.gradeCode===grade).reduce((n,i)=>n+i.quantity,0)!==outputs.filter(o=>o.gradeCode===grade).reduce((n,o)=>n+o.quantity,0))
      throw new ConflictException('脏蛋和破蛋须逐档守恒，不可转成正常档或猜测替代');
    return {request,productCode:d.product_code,postingPeriod,inputs,outputs};
  }
  async create(input:InventoryConversionDraft){
    const request=this.normalize(input),actor=this.authorize(request.companyCode,request.warehouseCode,'C'),hash=productionContentHash(request);
    return this.db.transaction(async m=>{
      await m.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`production-conversion-intent:${request.companyCode}:${request.intentKey}`]);
      const [prior]=await m.query('SELECT * FROM production_conversion_documents WHERE company_code=$1 AND intent_key=$2',[request.companyCode,request.intentKey]);
      if(prior){if(prior.creation_hash!==hash)throw new ConflictException('实际转换创建意图内容已改变');return prior;}
      await m.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`production-conversion-group:${request.companyCode}:${request.physicalGroupRef}`]);
      if((await m.query("SELECT 1 FROM production_conversion_documents WHERE company_code=$1 AND physical_group_ref=$2 AND state<>'CANCELLED'",[request.companyCode,request.physicalGroupRef])).length)
        throw new ConflictException('该实际作业组已有原转换单，不能换意图重复创建');
      const d={company_code:request.companyCode,warehouse_code:request.warehouseCode,product_code:request.productCode,operation_date:request.operationDate};
      await this.lockBoundary(m,d);await this.facts(m,d,request,singaporeBusinessDate());const id=randomUUID();
      const [created]=await m.query(`INSERT INTO production_conversion_documents(id,document_no,company_code,warehouse_code,product_code,operation_kind,
        physical_group_ref,operation_date,intent_key,creation_hash,payload,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [id,`CVT-${id}`,request.companyCode,request.warehouseCode,request.productCode,request.operationKind,request.physicalGroupRef,request.operationDate,
          request.intentKey,hash,JSON.stringify({request,productCode:request.productCode}),actor]);return created;
    });
  }
  async get(id:string){const d=await this.document(id);return {...d,actualInputs:await this.db.query('SELECT * FROM production_conversion_inputs WHERE document_id=$1 ORDER BY line_no',[id]),
    actualOutputs:await this.db.query('SELECT * FROM production_conversion_outputs WHERE document_id=$1 ORDER BY line_no',[id])};}
  async list(company:string,warehouse:string,product:string,date?:string){
    this.authorize(text(company),text(warehouse));text(product);if(date)assertEggDate(date);
    return this.db.query(`SELECT id,document_no,company_code,warehouse_code,product_code,operation_kind,physical_group_ref,operation_date::text,
      state,version,created_by,content_hash,receipt,created_at FROM production_conversion_documents WHERE company_code=$1 AND warehouse_code=$2
        AND product_code=$3 AND($4::date IS NULL OR operation_date=$4) ORDER BY created_at DESC,id LIMIT 200`,[company,warehouse,product,date??null]);
  }
  async recover(company:string,warehouse:string,intent?:string,group?:string){
    this.authorize(text(company),text(warehouse));if(!intent&&!group)throw new BadRequestException('须提供原创建意图或实际作业组号');
    if(intent)text(intent);if(group)text(group);
    const rows=await this.db.query(`SELECT id FROM production_conversion_documents WHERE company_code=$1 AND warehouse_code=$2
      AND($3::text IS NOT NULL AND intent_key=$3 OR $4::text IS NOT NULL AND physical_group_ref=$4) ORDER BY created_at DESC,id LIMIT 20`,[company,warehouse,intent??null,group??null]);
    return Promise.all(rows.map((r:Fact)=>this.get(r.id)));
  }
  async edit(id:string,version:number,input:InventoryConversionDraft){
    const request=this.normalize(input),identity=await this.document(id),actor=this.authorize(identity.company_code,identity.warehouse_code,'E');
    return this.db.transaction(async m=>{
      await this.lockBoundary(m,identity);const d=await this.document(id,m,true);
      if(actor!==d.created_by)throw new ForbiddenException('仅原制单人可修改实测草稿，独立审核人不能改写待审实测数据');
      if(d.state!=='DRAFT'||d.version!==version)throw new ConflictException('实际转换已冻结或版本已变化，请查询原单');
      const identities=[['companyCode','company_code'],['warehouseCode','warehouse_code'],['productCode','product_code'],['operationKind','operation_kind'],
        ['physicalGroupRef','physical_group_ref'],['operationDate','operation_date'],['intentKey','intent_key']] as const;
      if(identities.some(([key,column])=>request[key]!==d[column]))throw new ConflictException('原单作业身份不能换配；须保留原单并显式建立新意图');
      await this.facts(m,d,request,singaporeBusinessDate());
      const [changed]=await m.query(`WITH changed AS(UPDATE production_conversion_documents SET version=version+1,payload=$2 WHERE id=$1 RETURNING *) SELECT * FROM changed`,
        [id,JSON.stringify({request,productCode:d.product_code})]);return changed;
    });
  }
  async sources(company:string,warehouse:string,product:string){
    this.authorize(text(company),text(warehouse));text(product);
    return this.db.transaction(async m=>{
      const d={company_code:company,warehouse_code:warehouse,product_code:product};
      const [master]=await m.query("SELECT variety_code FROM mst_products WHERE product_code=$1 AND status='ACTIVE' FOR SHARE",[product]);
      if(!master)throw new NotFoundException('实际品目未启用');
      const [domain]=await m.query(`SELECT 1 FROM production_inventory_domains domain JOIN production_cutover_scopes scope ON scope.id=domain.scope_id
        LEFT JOIN production_inventory_domain_states state ON state.company_code=domain.company_code AND state.warehouse_code=domain.warehouse_code AND state.product_code=domain.product_code
        WHERE domain.company_code=$1 AND domain.warehouse_code=$2 AND domain.product_code=$3 AND scope.state IN('ACTIVE','SUSPENDED')
          AND(scope.state='ACTIVE' AND state.id IS NULL OR state.state='ACTIVE') LIMIT 1`,[company,warehouse,product]);
      if(!domain)return {available:false,raw:[],inventory:[]};
      await this.lockBoundary(m,d);const day=singaporeBusinessDate();
      const raw=await m.query(`SELECT segment.id AS raw_segment_id,receipt.id AS raw_receipt_id,receipt.document_no,receipt.house_code,
        receipt.production_date::text AS production_date,segment.grade_code,segment.quantity::text AS received_quantity,
        (segment.quantity-COALESCE(used.quantity,0))::text AS remaining_quantity
        FROM production_raw_receipt_segments segment JOIN production_raw_receipts receipt ON receipt.id=segment.receipt_id
        JOIN production_cutover_scopes scope ON scope.id=receipt.scope_id
        JOIN product_grades grade ON grade.grade_code=segment.grade_code AND grade.status='ACTIVE'
        LEFT JOIN LATERAL(SELECT SUM(input.quantity) AS quantity FROM production_conversion_inputs input
          JOIN production_conversion_documents document ON document.id=input.document_id AND document.state='POSTED' WHERE input.raw_segment_id=segment.id) used ON true
        WHERE receipt.company_code=$1 AND receipt.warehouse_code=$2 AND receipt.state='POSTED' AND scope.state='ACTIVE'
          AND(receipt.payload->'profile'->>'varietyCode') IS NOT DISTINCT FROM $3::text AND receipt.production_date+30>=$4::date
          AND segment.quantity>COALESCE(used.quantity,0) ORDER BY receipt.production_date,receipt.document_no,segment.grade_code,segment.id LIMIT 500`,[company,warehouse,master.variety_code,day]);
      const inventory=await m.query(`SELECT b.batch_no,b.sku_code,COALESCE(b.grade_code_std,b.quality_grade) AS grade_code,b.inventory_class,
        b.qty_available::text AS remaining_quantity,b.egg_date::text AS production_date,b.expire_date::text AS expire_date,
        CASE WHEN official_inventory_cost_known(b.batch_no) AND official_inventory_proven_currency(b.batch_no) IS NOT NULL THEN 'CONFIRMED' ELSE 'UNKNOWN' END AS cost_status
        FROM inv_batches b JOIN production_batch_qualifications qualification ON qualification.batch_no=b.batch_no AND qualification.disposition='QUALIFIED'
        WHERE b.company_code=$1 AND b.warehouse_code=$2 AND b.product_code=$3 AND b.unit='枚' AND b.status='AVAILABLE' AND b.qty_available>0
          AND b.egg_date IS NOT NULL AND b.expire_date>=$4::date AND official_conversion_parent_available_on(b.batch_no)<=$4::date
          AND official_inventory_writable(b.batch_no,b.company_code,b.warehouse_code,b.product_code,b.sku_code,b.material_code)
        ORDER BY b.expire_date,b.inbound_date,b.batch_no LIMIT 500`,[company,warehouse,product,day]);
      return {available:true,raw,inventory};
    });
  }
  async evidence(id:string,fileId:string){
    const d=await this.document(id);text(fileId);if(!this.files)throw new NotFoundException('保护附件不可访问');
    const outputs=d.payload.outputs??d.payload.request?.outputs??[];
    const bound=outputs.filter((o:Fact)=>o.evidenceFileId===fileId);
    if(!bound.length)throw new NotFoundException('附件不属于实际转换原单');
    const [file]=await this.db.query(`SELECT checksum FROM file_metadata WHERE file_id=$1 AND module_code='PRODUCTION_CONVERSION'
      AND owner_type='WAREHOUSE' AND owner_id=$2 AND company_code=$3 AND status='ACTIVE' AND deleted_at IS NULL`,[fileId,d.warehouse_code,d.company_code]);
    if(!file||bound.some((o:Fact)=>o.evidenceChecksum&&o.evidenceChecksum!==file.checksum))throw new ConflictException('原单签认证据已变化，请保留原单核验');
    const permissions=this.cls.get<Fact>('user')?.permissions;
    const requiredOperation=(['V','C','E','A'] as PermCode[]).find(operation=>hasPerm(permissions,'MENU_PROD_INBOUND',operation))!;
    return this.files.openProtectedFile(fileId,{moduleCode:'PRODUCTION_CONVERSION',ownerType:'WAREHOUSE',ownerId:d.warehouse_code,
      companyCode:d.company_code,requiredMenu:'MENU_PROD_INBOUND',requiredOperation},'preview');
  }
  async ready(id:string,version:number,submitKey:string){
    text(submitKey);const identity=await this.document(id),actor=this.authorize(identity.company_code,identity.warehouse_code,'E');
    return this.db.transaction(async m=>{
      await this.lockBoundary(m,identity);const d=await this.document(id,m,true);
      if(d.state!=='DRAFT'||d.version!==version)throw new ConflictException('实际转换版本或状态已变化');
      const postingDate=singaporeBusinessDate(),payload=await this.facts(m,d,d.payload.request,postingDate,true);
      const hash=productionContentHash({id,companyCode:d.company_code,warehouseCode:d.warehouse_code,operationDate:d.operation_date,postingDate,payload});
      const [frozen]=await m.query(`WITH changed AS(UPDATE production_conversion_documents SET state='READY',version=version+1,payload=$2,content_hash=$3,
        submit_key=$4,expected_posting_date=$5,ready_by=$6,ready_at=now() WHERE id=$1 RETURNING *) SELECT * FROM changed`,
        [id,JSON.stringify(payload),hash,submitKey,postingDate,actor]);return frozen;
    });
  }
  async approve(id:string,version:number,hash:string){
    const identity=await this.document(id),actor=this.authorize(identity.company_code,identity.warehouse_code,'A');
    return this.db.transaction(async m=>{
      await this.lockBoundary(m,identity);const d=await this.document(id,m,true);
      if(d.state!=='READY'||d.version!==version||d.content_hash!==hash||[d.created_by,d.ready_by].includes(actor))throw new ConflictException('须独立审核人签认同一冻结实际转换摘要');
      const [approved]=await m.query(`WITH changed AS(UPDATE production_conversion_documents SET state='APPROVED',version=version+1,approved_by=$2,
        approved_hash=content_hash,approved_at=now() WHERE id=$1 RETURNING *) SELECT * FROM changed`,[id,actor]);return approved;
    });
  }
  async post(id:string,submitKey:string,hash:string){
    const identity=await this.document(id);
    if(identity.submit_key!==submitKey||identity.content_hash!==hash)throw new ConflictException('实际转换原提交身份或摘要不符');
    if(identity.state==='POSTED')return identity.receipt;
    const actor=this.authorize(identity.company_code,identity.warehouse_code,'E');
    return this.db.transaction(async m=>{
      await this.lockBoundary(m,identity);const d=await this.document(id,m,true);
      if(d.state==='POSTED')return d.receipt;
      if(d.state!=='APPROVED'||d.approved_hash!==hash||d.submit_key!==submitKey||d.content_hash!==hash||d.expected_posting_date!==singaporeBusinessDate())
        throw new ConflictException('实际转换未独立审核、原摘要不符或已跨记账日');
      const fresh=await this.facts(m,d,d.payload.request,d.expected_posting_date,true);
      if(productionContentHash(fresh)!==productionContentHash(d.payload))throw new ConflictException('实际来源、产出或保护附件已变化，请保留原单重新核对');
      for(const [index,input] of d.payload.inputs.entries()){
        const inputId=randomUUID();await m.query(`INSERT INTO production_conversion_inputs(id,document_id,line_no,raw_segment_id,parent_batch_no,quantity,grade_code,
          source_snapshot,cost_status,unit_cost,known_amount,currency_code,recorded_unit_cost,recorded_amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [inputId,id,index+1,input.rawSegmentId,input.parentBatchNo,input.quantity,input.gradeCode,JSON.stringify(input),input.costStatus,input.unitCost,
            input.knownAmount,input.currencyCode,input.recordedUnitCost,input.recordedAmount]);
        if(input.parentBatchNo){
          await m.query('UPDATE inv_batches SET qty=qty-$2,qty_available=qty_available-$2,updated_at=now() WHERE batch_no=$1',[input.parentBatchNo,input.quantity]);
          const [{cost}]=await m.query('SELECT (-$1::numeric)::text AS cost',[input.recordedAmount]);
          const ledgerId=await writeInvLedger(m,{batchNo:input.parentBatchNo,changeType:INV_LEDGER_CHANGE_TYPE.CONVERSION_OUT,qtyChange:-input.quantity,
            refNo:d.document_no,operator:String(this.cls.get<Fact>('user').username),companyCode:d.company_code,warehouseCode:d.warehouse_code,
            skuCode:input.skuCode,qualityGrade:input.gradeCode,unit:'枚',businessType:'PRODUCTION_CONVERSION',logDate:d.expected_posting_date,costChange:cost,
            note:`Actual conversion ${d.document_no} input ${index+1}`});
          if(!ledgerId)throw new ConflictException('实际转换父批扣减缺少原流水');
          await m.query('UPDATE production_conversion_inputs SET inventory_ledger_id=$2 WHERE id=$1',[inputId,ledgerId]);
        }
      }
      const batches:Fact[]=[];
      await withApprovedInventoryConversion(m,id,actor,async()=>{
        for(const [index,output] of d.payload.outputs.entries()){
          const stock=output.outputKind==='LOSS'?null:await this.wms.postApprovedConversionOutput(m,id,index+1);
          await m.query(`INSERT INTO production_conversion_outputs(id,document_id,line_no,output_kind,grade_code,quantity,batch_no,sku_code,location_code,
            inventory_ledger_id,loss_reason,evidence_file_id,source_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [randomUUID(),id,index+1,output.outputKind,output.gradeCode,output.quantity,stock?.batchNo??null,output.skuCode,output.locationCode,
              stock?.inventoryLedgerId??null,output.lossReason,output.evidenceFileId,JSON.stringify(output)]);
          if(stock){const {inventoryLedgerId:_,...publicBatch}=stock;batches.push(publicBatch);}
        }
      });
      const receipt={documentId:id,documentNo:d.document_no,postingDate:d.expected_posting_date,
        inputQuantity:d.payload.inputs.reduce((n:number,i:Fact)=>n+i.quantity,0),outputQuantity:batches.reduce((n,b)=>n+b.quantity,0),
        lossQuantity:d.payload.outputs.filter((o:Fact)=>o.outputKind==='LOSS').reduce((n:number,o:Fact)=>n+o.quantity,0),costStatus:'PENDING_ALLOCATION',batches};
      await m.query(`UPDATE production_conversion_documents SET state='POSTED',version=version+1,posting_date=$2,receipt=$3,posted_by=$4,posted_at=now() WHERE id=$1`,
        [id,receipt.postingDate,JSON.stringify(receipt),actor]);return receipt;
    });
  }
  async cancel(id:string,version:number){
    const d=await this.document(id),actor=this.authorize(d.company_code,d.warehouse_code,'E');
    const [cancelled]=await this.db.query(`WITH changed AS(UPDATE production_conversion_documents SET state='CANCELLED',version=version+1,cancelled_by=$3,cancelled_at=now()
      WHERE id=$1 AND version=$2 AND state IN('DRAFT','READY','APPROVED') RETURNING *) SELECT * FROM changed`,[id,version,actor]);
    if(!cancelled)throw new ConflictException('实际转换已过账或版本已变化，不能直接作废');return cancelled;
  }
}
