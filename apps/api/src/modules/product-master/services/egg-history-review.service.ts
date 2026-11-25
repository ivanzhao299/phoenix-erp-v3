import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { FileAccessService } from '../../file/file-access.service';
import { DataSource, EntityManager } from 'typeorm';
import type { OrgScope } from '../../farm/farm.service';
import { hasPerm } from '../../../auth/permissions.util';
import { DataScopeContext, DataScopeService } from '../../org/services/data-scope.service';
import { INV_LEDGER_CHANGE_TYPE as Ledger } from '../../wms/inv-ledger-change-types';
import {
  assertEggSourceScope, commercialShellClass, EggSourceOwner, readEggSourceOwner, requireShellClass,
  sourceClock, sourceDate, sourceDigest, sourceText, sourceUuid,
} from './egg-source-change-policy';

type Context = { scope:OrgScope; dataScope:DataScopeContext; user?:{
  userId?:string|number; permissions?:any; roles?:string[]; role?:string; perms_version?:number
} };
type Input = { houseCode?:unknown; warehouseCode?:unknown; productionDate?:unknown; batchNo?:unknown;
  ledgerId?:unknown; actionKey?:unknown; targetClass?:unknown; quantity?:unknown; reason?:unknown; evidenceIds?:unknown };
type HistoryDisposition = {kind:string;[key:string]:unknown};
type HistoryLedger = {id:string;ref_no:string;change_type:string;qty_change:string;original_module:string|null};
const intake:string[] = [Ledger.TEMP_PRODUCTION_INBOUND,Ledger.PACKAGING_INBOUND,Ledger.PRODUCTION_INBOUND,'FARM_IN'];

@Injectable()
export class EggHistoryReviewService {
  constructor(private readonly db: DataSource, private readonly files: FileAccessService,
    private readonly dataScopes: DataScopeService) {}

  async read(input: Input, context: Context) {
    return this.db.transaction('REPEATABLE READ',async m => {
      await m.query('SET TRANSACTION READ ONLY');
      const owner = await readEggSourceOwner(m,sourceText(input.houseCode,'鸡舍',64));
      const warehouse = sourceText(input.warehouseCode,'仓库',64);
      this.authorize(context,owner,warehouse);
      const date = sourceDate(input.productionDate);
      const batch = sourceText(input.batchNo,'实际库存批次',128);
      const evidence = await this.evidence(m,owner,warehouse,date,batch);
      const reviews: Array<Record<string,unknown>&{dispositions:HistoryDisposition[]}> = await m.query(`SELECT id,state,source_line,quantity,target_class,reviewed_at,
        review->>'reason' AS decision,review->>'disposition' AS disposition,
        payload->>'reason' AS reason,payload->'attachments' AS attachments,
        ARRAY(SELECT d.receipt FROM md_egg_history_dispositions d WHERE d.review_id=md_egg_history_reviews.id
          ORDER BY d.recorded_at,d.inventory_ledger_id) AS dispositions
        FROM md_egg_history_reviews WHERE company_code=$1 AND house_code=$2 AND production_date=$3
          AND batch_no=$4 AND payload->>'warehouse'=$5 ORDER BY created_at`,[owner.companyCode,owner.houseCode,date,batch,warehouse]);
      const originalMenus=[...new Set(evidence.ledger.map(line=>line.original_module).filter((value):value is string=>!!value))];
      const visible=new Set((await Promise.all(originalMenus.map(async menu=>
        await this.canViewOriginal(context,menu,owner.companyCode,warehouse)?menu:null))).filter(Boolean));
      const canReadReturn=reviews.some(row=>row.dispositions.some(receipt=>receipt.kind==='POSTED_SALES_RETURN'))
        && await this.canViewOriginal(context,'MENU_SALES2_RETURN',owner.companyCode,warehouse);
      return { evidence:{...evidence,ledger:evidence.ledger.map(line =>
        intake.includes(line.change_type) || visible.has(line.original_module) ? line : {...line,ref_no:null}) },
        reviews:reviews.map(row=>({...row,dispositions:row.dispositions.map(receipt=>this.dispositionForActor(canReadReturn,receipt))})) };
    });
  }

  async submit(input: Input, context: Context, actor: string) {
    const key = sourceUuid(input.actionKey,'创建请求号');
    const targetClass = requireShellClass(input.targetClass);
    const reason = sourceText(input.reason,'核认依据',2000);
    const ledgerId = sourceText(input.ledgerId,'原库存流水号',20);
    if (!/^\d+$/.test(ledgerId) || BigInt(ledgerId) > 9223372036854775807n) throw new BadRequestException('原库存流水号无效');
    const quantity = input.quantity ?? null;
    if (quantity !== null && (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 2147483647)) {
      throw new BadRequestException('数量必须是实证的正整数枚');
    }
    if (!Array.isArray(input.evidenceIds) || !input.evidenceIds.length || input.evidenceIds.length>10) {
      throw new BadRequestException('须提交核认附件');
    }
    const evidenceIds = [...new Set(input.evidenceIds.map(value => sourceText(value,'凭据附件',128)))].sort();
    return this.db.transaction(async m => {
      const owner = await readEggSourceOwner(m,sourceText(input.houseCode,'鸡舍',64));
      const warehouse = sourceText(input.warehouseCode,'仓库',64);
      this.authorize(context,owner,warehouse);
      const date = sourceDate(input.productionDate);
      const batch = sourceText(input.batchNo,'实际库存批次',128);
      await m.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`egg-history:${owner.companyCode}:${batch}`]);
      const request = { ...owner,date,batch,warehouse,ledgerId,quantity,targetClass,reason,evidenceIds };
      const requestHash = sourceDigest(request);
      const [prior] = await m.query('SELECT id,state,created_by,payload FROM md_egg_history_reviews WHERE company_code=$1 AND request_key=$2',
        [owner.companyCode,key]);
      if (prior) {
        if (prior.created_by !== actor || prior.payload.requestHash !== requestHash) throw new ConflictException('请求号已绑定其他核认');
        return { id:prior.id,state:prior.state };
      }
      if (date >= (await sourceClock(m,owner)).day) throw new ConflictException('历史核认仅适用于过去的产蛋日');
      const evidence = await this.evidence(m,owner,warehouse,date,batch);
      const selected = evidence.ledger.find((line: {id:string}) => line.id === ledgerId);
      if (!selected) throw new ConflictException('未找到与本批匹配的原入库或销售事实');
      if (quantity !== null && (evidence.exactQuantity === null ||
          quantity > Math.min(evidence.exactQuantity,Math.abs(Number(selected.qty_change))))) {
        throw new ConflictException('不能把混批或未核实的来源关系登记为可归属数量');
      }
      const attachments = await this.attachments(m,evidenceIds,owner,actor);
      const payload = { requestHash, warehouse, reason, evidenceIds, attachments, selected, evidenceHash:this.evidenceDigest(evidence,selected) };
      const id = randomUUID();
      await m.query(`INSERT INTO md_egg_history_reviews(id,request_key,company_code,farm_code,site_code,house_code,production_date,
        batch_no,source_line,quantity,target_class,created_by,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id,key,owner.companyCode,owner.farmCode,owner.siteCode,owner.houseCode,date,batch,ledgerId,quantity,targetClass,actor,JSON.stringify(payload)]);
      return { id,state:'SUBMITTED' };
    });
  }

  async review(idInput: string, input: { decision?:unknown; reason?:unknown; disposition?:unknown }, context: Context, actor: string) {
    const id = sourceUuid(idInput,'历史核认单');
    const reason = sourceText(input.reason,'审核依据',2000);
    const decision = input.decision;
    if (decision !== 'APPROVED' && decision !== 'REJECTED') throw new BadRequestException('审核结论无效');
    const disposition = decision==='APPROVED' ? input.disposition ?? 'ANNOTATION' : null;
    if (disposition!==null && disposition!=='ANNOTATION' && disposition!=='REFER_TO_ORIGINAL') {
      throw new BadRequestException('历史核认处置类型无效');
    }
    return this.db.transaction(async m => {
      const [row] = await m.query('SELECT *,production_date::text FROM md_egg_history_reviews WHERE id=$1 FOR UPDATE',[id]);
      if (!row) throw new NotFoundException('历史核认单不存在');
      const owner = await readEggSourceOwner(m,row.house_code);
      this.authorize(context,owner,row.payload.warehouse);
      if (owner.companyCode !== row.company_code || owner.farmCode !== row.farm_code || owner.siteCode !== row.site_code) {
        throw new ConflictException('原核认单的组织归属已变化');
      }
      if (row.created_by === actor) throw new ForbiddenException('须由独立审核人核认');
      if (row.state === decision && row.reviewed_by === actor && row.review?.reason === reason && row.review?.disposition===disposition) return row.review;
      if (row.state !== 'SUBMITTED') throw new ConflictException('历史核认已审核');
      if (decision === 'APPROVED') {
        await m.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`egg-history:${owner.companyCode}:${row.batch_no}`]);
        const fresh = await this.evidence(m,owner,row.payload.warehouse,row.production_date,row.batch_no);
        const attachments = await this.attachments(m,row.payload.evidenceIds,owner,row.created_by);
        const selected=fresh.ledger.find(line=>line.id===row.source_line);
        if (!selected || this.evidenceDigest(fresh,selected) !== row.payload.evidenceHash || sourceDigest(attachments) !== sourceDigest(row.payload.attachments)) {
          throw new ConflictException('原事实或证据已变化，请重新核实');
        }
        const [approved] = await m.query(`SELECT COALESCE(SUM(quantity),0)::text AS total,
          COALESCE(SUM(quantity) FILTER (WHERE source_line=$3),0)::text AS line_total FROM md_egg_history_reviews
          WHERE company_code=$1 AND batch_no=$2 AND state='APPROVED' AND quantity IS NOT NULL`,[owner.companyCode,row.batch_no,row.source_line]);
        if (row.quantity !== null && (Number(approved.total)+Number(row.quantity) > (fresh.exactQuantity ?? 0)
          || Number(approved.line_total)+Number(row.quantity)>Math.abs(Number(selected.qty_change)))) {
          throw new ConflictException('累计核认数量超出原事实可证明的数量');
        }
      }
      const [clock] = await m.query('SELECT clock_timestamp()::text AS at');
      const receipt = { id,state:decision,reason,reviewedBy:actor,reviewedAt:clock.at,
        evidenceHash:row.payload.evidenceHash,disposition,
        ...(disposition==='REFER_TO_ORIGINAL' ? { referralModule:intake.includes(row.payload.selected.change_type)
          ? 'PRODUCTION_INBOUND' : 'SALES', referralStatus:'PENDING_ORIGINAL_ACTION' } : {}) };
      await m.query(`UPDATE md_egg_history_reviews SET state=$2,reviewed_by=$3,reviewed_at=$4,review=$5 WHERE id=$1`,
        [id,decision,actor,clock.at,JSON.stringify(receipt)]);
      return receipt;
    });
  }

  async recordDisposition(idInput: string, input: { ledgerId?: unknown }, context: Context, actor: string) {
    const id = sourceUuid(idInput,'历史核认单');
    const ledgerId = sourceText(input.ledgerId,'已办理的原单冲销流水号',20);
    if (!/^\d+$/.test(ledgerId) || BigInt(ledgerId) > 9223372036854775807n) throw new BadRequestException('冲销流水号无效');
    return this.db.transaction(async m => {
      const [row] = await m.query('SELECT * FROM md_egg_history_reviews WHERE id=$1 FOR UPDATE',[id]);
      if (!row) throw new NotFoundException('历史核认单不存在');
      const owner = await readEggSourceOwner(m,row.house_code);
      this.authorize(context,owner,row.payload.warehouse);
      if (row.company_code!==owner.companyCode || row.farm_code!==owner.farmCode || row.site_code!==owner.siteCode
          || row.state!=='APPROVED' || row.review?.disposition!=='REFER_TO_ORIGINAL') throw new ConflictException('须核对原归属及通过独立审批的历史核认');
      const [existing] = await m.query('SELECT receipt FROM md_egg_history_dispositions WHERE review_id=$1 AND inventory_ledger_id=$2',[id,ledgerId]);
      const canReadReturn=await this.canViewOriginal(context,'MENU_SALES2_RETURN',owner.companyCode,row.payload.warehouse);
      if (existing) return this.dispositionForActor(canReadReturn,existing.receipt);
      const [official] = await m.query(`SELECT l.id::text,l.ref_no,d.original_document_id,origin.inventory_ledger_id::text AS original_ledger_id,
        l.qty_change,l.log_date::text FROM inv_ledger l
        JOIN production_inbound_lines reversed ON reversed.inventory_ledger_id=l.id AND reversed.batch_no=l.batch_no
        JOIN production_inbound_documents d ON d.id=reversed.document_id AND d.document_no=l.ref_no
        JOIN production_inbound_lines origin ON origin.document_id=d.original_document_id AND origin.batch_no=l.batch_no
        WHERE l.id=$1 AND l.batch_no=$2 AND l.company_code=$3 AND l.warehouse_code=$4
          AND d.company_code=$3 AND d.house_code=$5 AND d.state='POSTED'
          AND l.change_type=$6 AND l.qty_change<0 AND origin.inventory_ledger_id=$7`,
      [ledgerId,row.batch_no,row.company_code,row.payload.warehouse,row.house_code,Ledger.PRODUCTION_INBOUND_REVERSAL,row.source_line]);
      let posted=official;
      let kind='POSTED_INBOUND_REVERSAL';
      if (!posted && canReadReturn) {
        // Original delivery allocation and returned batch must point to the same sold lot and order item.
        [posted]=await m.query(`SELECT returned.id::text,returned.ref_no,original.id::text AS original_ledger_id,
          ret.id AS original_document_id,returned.qty_change,returned.log_date::text
          FROM inv_ledger returned JOIN sal_return_orders ret ON ret.return_no=returned.ref_no AND ret.company_code=returned.company_code
          JOIN sal_return_items item ON item.return_order_id=ret.id AND returned.batch_no='RET-'||ret.return_no||'-'||item.id
          JOIN sal_order_item_batch_allocations allocation ON allocation.sales_order_item_id=item.sales_order_item_id
            AND allocation.batch_no=$2
          JOIN sal_order_item_batch_allocation_actions action ON action.allocation_id=allocation.id AND action.action_type='OUTBOUND'
          JOIN inv_ledger original ON original.id=action.ledger_id AND original.batch_no=allocation.batch_no
          WHERE returned.id=$1 AND returned.company_code=$3 AND returned.warehouse_code=$4
            AND returned.change_type=$5 AND returned.qty_change>0 AND original.id=$6
            AND NOT EXISTS(SELECT 1 FROM vet_egg_parent_batches(returned.batch_no) parent WHERE parent.parent IS DISTINCT FROM $2)
            AND EXISTS(SELECT 1 FROM vet_egg_parent_batches(returned.batch_no) parent WHERE parent.parent=$2)`,
          [ledgerId,row.batch_no,row.company_code,row.payload.warehouse,Ledger.SALE_RETURN,row.source_line]);
        kind='POSTED_SALES_RETURN';
      }
      if (!posted) throw new ConflictException('未找到与核认原流水匹配且已过账的业务处置');
      const receipt = { ...posted, kind, recordedBy:actor };
      await m.query('INSERT INTO md_egg_history_dispositions(review_id,inventory_ledger_id,recorded_by,receipt) VALUES($1,$2,$3,$4)',
        [id,ledgerId,actor,JSON.stringify(receipt)]);
      return this.dispositionForActor(canReadReturn,receipt);
    });
  }

  async preview(idInput:string,fileId:string,context:Context) {
    const id=sourceUuid(idInput,'历史核认单');
    const [row]=await this.db.query('SELECT * FROM md_egg_history_reviews WHERE id=$1',[id]);
    const frozen=row?.payload.attachments?.find((item:{file_id:string;checksum:string})=>item.file_id===fileId);
    if (!frozen) throw new NotFoundException('附件不属于该历史核认单');
    const owner=await readEggSourceOwner(this.db.manager,row.house_code);
    this.authorize(context,owner,row.payload.warehouse);
    if (row.company_code!==owner.companyCode || row.farm_code!==owner.farmCode || row.site_code!==owner.siteCode) {
      throw new ConflictException('原核认单的组织归属已变化');
    }
    return this.files.openProtectedFile(fileId,{moduleCode:'PRODUCTION_INBOUND',ownerType:'HOUSE',ownerId:owner.houseCode,
      companyCode:owner.companyCode,storeCode:owner.siteCode,requiredMenu:'MENU_PROD_INBOUND',expectedChecksum:frozen.checksum},'preview');
  }

  private dispositionForActor(canReadReturn:boolean,receipt:HistoryDisposition) {
    return receipt.kind==='POSTED_SALES_RETURN' && !canReadReturn
      ? {kind:receipt.kind,restricted:true} : receipt;
  }

  private async canViewOriginal(context:Context,menu:string,company:string,warehouse:string) {
    const user=context.user;
    if (!user?.userId || !hasPerm(user.permissions,menu,'V')) return false;
    const rawRoles=user.roles ?? (user.role?[user.role]:[]);
    const scope=await this.dataScopes.resolve(String(user.userId),rawRoles,menu,user.perms_version);
    return scope.isGlobal || (scope.allowedCompanyCodes.includes(company) && scope.allowedWarehouseCodes.includes(warehouse));
  }

  private evidenceDigest(evidence:Awaited<ReturnType<EggHistoryReviewService['evidence']>>,selected:HistoryLedger) {
    const {ledger,...source}=evidence;
    return sourceDigest({source,selected});
  }

  private authorize(context: Context, owner: EggSourceOwner, warehouse: string) {
    assertEggSourceScope(context.scope,owner);
    if (!context.dataScope.isGlobal && (!context.dataScope.allowedCompanyCodes?.includes(owner.companyCode)
      || !context.dataScope.allowedWarehouseCodes?.includes(warehouse))) throw new ForbiddenException('无权查看该公司及仓库凭证');
  }

  private async attachments(m: EntityManager, ids: string[], owner: EggSourceOwner, actor: string) {
    const rows = await m.query(`SELECT f.file_id,f.checksum FROM file_metadata f JOIN sys_user u ON u.username=f.uploaded_by
      WHERE f.file_id=ANY($1::text[]) AND f.company_code=$2 AND u.user_id::text=$3 AND f.status='ACTIVE'
      AND f.deleted_at IS NULL AND f.visibility IN ('PRIVATE','PROTECTED') AND f.checksum ~ '^[a-f0-9]{64}$'
      AND f.module_code='PRODUCTION_INBOUND' AND f.owner_type='HOUSE' AND f.owner_id=$4 AND f.store_code=$5
      AND f.mime_type IN ('application/pdf','image/jpeg','image/png','image/webp')
      ORDER BY f.file_id FOR SHARE OF f`,[ids,owner.companyCode,actor,owner.houseCode,owner.siteCode]);
    if (rows.length !== ids.length) throw new ConflictException('缺少本人上传、归属正确且校验有效的受保护附件');
    return rows;
  }

  private async evidence(m: EntityManager, owner: EggSourceOwner, warehouse: string, date: string, batchNo: string) {
    const [batch] = await m.query(`SELECT b.batch_no,b.product_code,b.sku_code,b.variety_code,b.source_profile_snapshot,
      b.collection_batch_ref,b.egg_date::text, b.unit
      FROM inv_batches b WHERE b.batch_no=$1 AND b.company_code=$2 AND b.warehouse_code=$3`,
    [batchNo,owner.companyCode,warehouse]);
    if (!batch || batch.unit !== '枚') throw new NotFoundException('所选范围没有可验证的蛋品批次');
    const links: Array<{ id:string; house_code:string; company_code:string; production_date:string; precision:string; allocated_output_qty:string|null; origin_batch_no:string }> = await m.query(`SELECT l.id,l.daily_log_id::text,l.occupancy_id,l.flock_no,l.house_code,l.company_code,
      l.production_date::text,l.precision,l.allocated_output_qty::text,l.origin_batch_no
      FROM inv_flock_source_links l WHERE l.batch_no=$1 ORDER BY l.id`,[batchNo]);
    const belongs = (r: {house_code:string;company_code:string;production_date:string}) =>
      r.house_code === owner.houseCode && r.company_code === owner.companyCode && r.production_date === date;
    const local = links.filter(belongs);
    const snapshots = Array.isArray(batch.source_profile_snapshot) ? batch.source_profile_snapshot : [];
    const legacy = !links.length && batch.egg_date === date && batch.collection_batch_ref === 'HOUSE-' + owner.houseCode
      && snapshots.length <= 1 && (!snapshots.length || snapshots[0].houseCode === owner.houseCode)
      && (await m.query(`SELECT vet_egg_old_temp_flock(b) AS flock FROM inv_batches b WHERE b.batch_no=$1`,[batchNo]))[0]?.flock;
    if (!local.length && !legacy) throw new ConflictException('无法证明原批与该舍产蛋日期的关系');
    const ledger:HistoryLedger[] = await m.query(`SELECT l.id::text,l.ref_no,l.change_type,l.qty_change::text,
      CASE WHEN l.change_type='SALE_OUTBOUND' THEN 'MENU_WMS_OUTBOUND'
        WHEN l.change_type='FIFO_OUT' AND EXISTS(SELECT 1 FROM sal_order_item_batch_allocation_actions a
          JOIN sal_delivery_orders d ON d.id=a.delivery_order_id
          WHERE a.ledger_id=l.id AND a.action_type='OUTBOUND' AND d.delivery_no=l.ref_no
            AND d.company_code=l.company_code AND d.fulfillment_warehouse_code=l.warehouse_code)
        THEN 'MENU_SALES2_DELIVERY' END AS original_module
      FROM inv_ledger l WHERE l.batch_no=$1 AND l.company_code=$2 AND l.warehouse_code=$3 AND
      ((l.change_type=ANY($4::text[]) AND l.qty_change>0 AND (
        (l.change_type IN ('PRODUCTION_INBOUND','TEMP_PRODUCTION_INBOUND') AND EXISTS(SELECT 1 FROM production_inbound_lines item
          JOIN production_inbound_documents doc ON doc.id=item.document_id
          WHERE item.inventory_ledger_id=l.id AND item.batch_no=l.batch_no AND item.warehouse_code=l.warehouse_code
            AND item.quantity=l.qty_change AND item.sku_code=l.sku_code AND doc.company_code=l.company_code
            AND doc.document_no=l.ref_no AND doc.state='POSTED'))
        OR (l.change_type='PACKAGING_INBOUND' AND EXISTS(SELECT 1 FROM pkg_packing_records p
          JOIN pkg_packing_events e ON e.packing_id=p.id AND e.event_type='COMMIT_RECEIPT'
          CROSS JOIN LATERAL jsonb_array_elements(e.payload->'groups') g
          WHERE p.code=l.ref_no AND NOT p.is_test AND g->>'ledgerId'=l.id::text AND g->>'batchNo'=l.batch_no
            AND g->>'skuCode'=l.sku_code AND g->>'companyCode'=l.company_code AND g->>'warehouseCode'=l.warehouse_code
            AND CASE WHEN jsonb_typeof(g->'qty')='number' THEN (g->>'qty')::numeric=l.qty_change ELSE false END))
        OR (l.change_type IN ('TEMP_PRODUCTION_INBOUND','FARM_IN') AND $7::boolean AND
          EXISTS(SELECT 1 FROM inv_batches b WHERE b.batch_no=l.batch_no AND b.source_type='TEMP_PRODUCTION'
            AND b.sku_code IS NOT DISTINCT FROM l.sku_code AND b.source_no=l.ref_no
            AND NOT EXISTS(SELECT 1 FROM production_inbound_lines formal WHERE formal.batch_no=l.batch_no)
            AND (SELECT count(*) FROM inv_ledger source WHERE source.batch_no=l.batch_no
              AND source.change_type IN ('TEMP_PRODUCTION_INBOUND','FARM_IN') AND source.qty_change>0)=1))
        OR (l.change_type='TEMP_PRODUCTION_INBOUND' AND $8::boolean
          AND NOT EXISTS(SELECT 1 FROM production_inbound_lines formal WHERE formal.batch_no=l.batch_no)
          AND EXISTS(SELECT 1 FROM inv_batches b WHERE b.batch_no=l.batch_no AND b.source_type='TEMP_PRODUCTION'
            AND b.source_no=l.ref_no AND b.sku_code IS NOT DISTINCT FROM l.sku_code)
          AND (SELECT count(*) FROM inv_ledger source WHERE source.batch_no=l.batch_no
            AND source.change_type='TEMP_PRODUCTION_INBOUND' AND source.qty_change>0)=1
          AND EXISTS(SELECT 1 FROM inv_flock_source_links linked JOIN brd_egg_source_receipts source
            ON source.company_code=linked.company_code AND source.daily_log_id=linked.daily_log_id AND source.source_key=linked.source_key
            WHERE source.company_code=l.company_code AND source.production_date=$10 AND source.house_code=$9
              AND linked.batch_no=l.batch_no AND linked.origin_batch_no=l.batch_no))
        )) OR
        (l.change_type=$5 AND l.qty_change<0 AND (
          EXISTS(SELECT 1 FROM sal_order_item_batch_allocation_actions a
            JOIN sal_order_item_batch_allocations allocated ON allocated.id=a.allocation_id
            JOIN sal_delivery_orders d ON d.id=a.delivery_order_id
            WHERE a.ledger_id=l.id AND a.action_type='OUTBOUND' AND a.qty=-l.qty_change
            AND d.delivery_no=l.ref_no AND d.company_code=l.company_code AND d.fulfillment_warehouse_code=l.warehouse_code
            AND allocated.batch_no=l.batch_no)
          OR EXISTS(SELECT 1 FROM sal_store_sales sale
            JOIN store_sale_allocations allocation ON allocation.sale_id=sale.id
            WHERE sale.company_code=l.company_code AND sale.sale_no=l.ref_no AND sale.status IN ('COMPLETED','RETURNED')
              AND allocation.batch_no=l.batch_no AND allocation.warehouse_code=l.warehouse_code
            GROUP BY sale.id
            HAVING SUM(allocation.allocated_qty)=(SELECT -SUM(actual.qty_change) FROM inv_ledger actual
              WHERE actual.ref_no=l.ref_no AND actual.company_code=l.company_code AND actual.warehouse_code=l.warehouse_code
                AND actual.batch_no=l.batch_no AND actual.change_type=$5 AND actual.qty_change<0))
        )) OR
        (l.change_type=$6 AND l.qty_change<0 AND EXISTS(SELECT 1 FROM wms_outbound d WHERE d.outbound_no=l.ref_no
          AND d.type='SALE' AND d.status='DONE' AND d.company_code=l.company_code AND d.warehouse_code=l.warehouse_code
          AND (d.batch_no=l.batch_no AND d.sku_code IS NOT DISTINCT FROM l.sku_code AND d.qty=-l.qty_change
            OR EXISTS(SELECT 1 FROM wms_outbound_items i WHERE i.outbound_no=d.outbound_no AND i.batch_no=l.batch_no
              AND i.warehouse_code=l.warehouse_code GROUP BY i.batch_no HAVING SUM(i.actual_qty)=-l.qty_change))))
      )
      ORDER BY l.id`,[batchNo,owner.companyCode,warehouse,intake,Ledger.FIFO_OUT,Ledger.SALE_OUTBOUND,!!legacy,local.length>0,owner.houseCode,date]);
    if (!ledger.length) throw new ConflictException('该批没有可验证的既有入库或销售库存事实');
    const exact = local.length>0 && links.every(belongs) && local.every(l => l.precision==='EXACT'
      && l.origin_batch_no===batchNo && Number.isSafeInteger(Number(l.allocated_output_qty)) && l.allocated_output_qty!==null);
    const profile = snapshots.length===1 && snapshots[0].houseCode===owner.houseCode ? snapshots[0] : null;
    return { batchNo:batch.batch_no,productCode:batch.product_code,skuCode:batch.sku_code,
      originalShell:profile ? commercialShellClass(profile.productMode,profile.varietyCode) : null,
      exactQuantity:exact ? local.reduce((n,l) => n+Number(l.allocated_output_qty),0) : null, sources:local, ledger };
  }
}
