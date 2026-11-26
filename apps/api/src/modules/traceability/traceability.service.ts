import { readInventoryLineage, readOutboundTrace } from './inventory-lineage';
import { readPosAllocationTrace, TracePagination } from './pos-allocation-trace';
import { deriveOrgScope,OrgScope } from '../farm/farm.service';
import { PackagingHistoryService } from '../bff/packaging-history.service';
import { DataScopeContext } from '../org/services/data-scope.service';
import { NotFoundException } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * TraceabilityService — 统一追溯 Runtime（R5）
 * ════════════════════════════════════════════════════════════════════════
 * 依据：docs/production-runtime-rebuild-phase-r5-traceability-runtime.md
 *
 * 唯一追溯链（正向 + 反向）：
 *   鸡舍 brd_houses → 鸡群 brd_flocks → 生产 brd_daily_logs → 集蛋 pkg_source_batches
 *     → 分级 pkg_grading_records → 包装 pkg_packing_records → 库存 inv_batches / inv_ledger
 *       → 销售 sal_sales_orders / sal_store_sales → 客户/门店 → 财务 fin_ar_invoices / fin_cash_*
 *
 * 设计：防御式查询（每段 try/catch，缺表/缺列不崩，返回空段），统一返回追溯树。
 * 入口：batch / packaging / label / sales-order / customer。
 */
@Injectable()
export class TraceabilityService {
  private readonly logger = new Logger(TraceabilityService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource, private readonly history: PackagingHistoryService) {}

  /** 防御式查询：异常返回 [] */
  private async q<T = any>(sql: string, args: unknown[] = []): Promise<T[]> {
    try { return await this.ds.query(sql, args); } catch (e: any) {
      this.logger.warn(`[Trace] query skipped: ${e?.message}`);
      return [];
    }
  }

  // ── 入口 1：按库存批次（EGG-YYYYMMDD-NNNNN）──────────────────────────────────
  async traceByBatch(batchNo: string, companyScope?: string[], dataScope?: DataScopeContext, query?: TracePagination): Promise<any> {
    const [batch] = await this.ds.query(
      `SELECT batch_no, product_code, sku_code, grade_code_std, quality_grade, spec_code, packaging_spec,
              qty, qty_available, egg_date::text AS egg_date, expire_date::text AS expire_date, company_code, source_type, source_no,
              packaging_batch_ref, collection_batch_ref, status, created_at
         FROM inv_batches WHERE batch_no = $1
           AND ($2::boolean OR (company_code=ANY($3::text[]) AND warehouse_code=ANY($4::text[]))) LIMIT 1`,
      [batchNo, dataScope?.isGlobal === true, dataScope?.allowedCompanyCodes ?? [], dataScope?.allowedWarehouseCodes ?? []],
    );
    if (!batch) return { found: false, entry: 'batch', key: batchNo };
    if (companyScope && !companyScope.includes(batch.company_code)) {
      return { found: false, denied: true, reason: '无权查看该公司数据', entry: 'batch', key: batchNo };
    }
    return this.assembleTree(batch,companyScope,dataScope,query);
  }

  // ── 入口 2：按包装批次（PKG-YYYYMMDD-XXXX）──────────────────────────────────
  async traceByPackaging(packingCode: string, companyScope?: string[], dataScope?: DataScopeContext): Promise<any> {
    if(!dataScope)throw new NotFoundException('RECORD_NOT_ACCESSIBLE');
    const [record]=await this.history.rows(dataScope,this.ds.manager,packingCode);
    if(!record)throw new NotFoundException('RECORD_NOT_ACCESSIBLE');
    // Only the already scoped original chain; unrelated downstream sales/finance need their own scoped queries.
    const traces=record.inventory.map((b:any)=>({found:true,entry:'batch',key:b.batch_no,
      production:{site:record.site_id,source:record.sources,productionDate:record.production_date},
      packaging:{packingCode:record.code,totalBoxes:record.total_boxes,totalEggs:record.total_eggs,grading:record.sources},
      inventory:{batchNo:b.batch_no,skuCode:b.sku_code,qty:b.qty,qtyAvailable:b.qty_available,companyCode:b.company_code,
        ledger:record.ledger.filter((l:any)=>l.batch_no===b.batch_no)},
      downstream:{state:'NOT_INCLUDED',reason:'销售财务需独立范围查询'}}));
    return {found:true,entry:'packaging',key:packingCode,packaging:{code:record.code,production_date:record.production_date,
      total_boxes:record.total_boxes,total_eggs:record.total_eggs,shift_id:record.shift_id,status:record.status,void_reason:record.void_reason},sources:record.sources,traces};
  }

  // ── 入口 3：按标签/箱码（label_no）──────────────────────────────────────────
  async traceByLabel(labelCode: string, companyScope?: string[], dataScope?: DataScopeContext): Promise<any> {
    const [lbl] = await this.q(
      `SELECT label_no, batch_no, product_code, qty, status, printed_at FROM lbl_records WHERE label_no = $1 LIMIT 1`,
      [labelCode],
    );
    if (!lbl) return { found: false, entry: 'label', key: labelCode };
    const tree = lbl.batch_no ? await this.traceByBatch(lbl.batch_no, companyScope,dataScope) : { found: false };
    return { found: tree.found, entry: 'label', key: labelCode, label: tree.found?lbl:null, trace: tree };
  }

  // ── 入口 4：按销售订单（order_no）──────────────────────────────────────────
  async traceBySalesOrder(orderNo: string, companyScope?: string[], dataScope?: DataScopeContext): Promise<any> {
    const [order] = await this.q(
      `SELECT id, order_no, customer_code, customer_name, company_code, status, total_amount,
              delivered_at, received_at, ar_invoice_id
         FROM sal_sales_orders WHERE order_no = $1 LIMIT 1`,
      [orderNo],
    );
    if (!order) return { found: false, entry: 'sales-order', key: orderNo };
    if (companyScope && !companyScope.includes(order.company_code)) {
      return { found: false, denied: true, reason: '无权查看该公司数据', entry: 'sales-order', key: orderNo };
    }
    if (!dataScope) throw new NotFoundException('RECORD_NOT_ACCESSIBLE');
    const items = await readOutboundTrace(this.ds, dataScope, { orderNo });
    const batchNos = [...new Set<string>(items.map((item: any) => item.batch_no))];
    const traces = await Promise.all(batchNos.slice(0, 50).map(no => this.traceByBatch(no, companyScope, dataScope)));
    return { found: true, entry: 'sales-order', key: orderNo, order, items, traces, traceCount: batchNos.length };
  }

  // ── 入口 5：按客户（customer_code）→ 历史购买批次 ──────────────────────────
  async traceByCustomer(customerCode: string, companyScope?: string[], scope?: DataScopeContext, query?: TracePagination): Promise<any> {
    if(companyScope && !companyScope.length)return {found:false,denied:true,entry:'customer',key:customerCode};
    const orders = await this.q(
      `SELECT order_no, company_code, status, total_amount, created_at
         FROM sal_sales_orders WHERE customer_code = $1
         ${companyScope && companyScope.length ? 'AND company_code = ANY($2)' : ''}
         ORDER BY created_at DESC LIMIT 50`,
      companyScope && companyScope.length ? [customerCode, companyScope] : [customerCode],
    );
    const pos = await readPosAllocationTrace(this.ds, 'customer', customerCode, scope, query);
    return { found: orders.length > 0 || pos.total > 0, entry: 'customer', key: customerCode,
      orders, storeBatches: pos.rows, storeBatchesPage: pos };
  }

  // ── 核心：从库存批次组装完整追溯树 ─────────────────────────────────────────
  private async assembleTree(batch: any,companyScope?: string[],dataScope?: DataScopeContext, query?: TracePagination): Promise<any> {
    const packingCode = batch.packaging_batch_ref as string | null;

    // 包装段
    let packaging: any = null;
    let shiftId: number | null = null;
    if (packingCode) {
      const [pkg] = await this.q(
        `SELECT code, production_date::text AS production_date, grading_code, grading_codes_json, batches_json,
                total_boxes, total_eggs, shift_id, status, void_reason
           FROM pkg_packing_records WHERE is_test = false AND code = $1 LIMIT 1`,
        [packingCode],
      );
      packaging = pkg ?? null;
      shiftId = pkg?.shift_id ?? null;
    }

    // 班次/场站/产线/人员
    let shift: any = null;
    if (shiftId) {
      const [ws] = await this.q(
        `SELECT id, shift_code, site_id, line_id, operator_name, supervisor_name, production_date::text AS production_date
           FROM pkg_work_shifts WHERE is_test = false AND id = $1 LIMIT 1`,
        [shiftId],
      );
      shift = ws ?? null;
    }

    // 分级段（仅原包装显式关联）
    let grading = packaging?.production_date
      ? await this.q(
          `SELECT code, source_batch_code, production_date::text AS production_date, outputs_json, total_output, status
             FROM pkg_grading_records WHERE is_test = false AND code IN (SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(grading_codes_json)='array' AND jsonb_array_length(grading_codes_json)>0 THEN grading_codes_json ELSE jsonb_build_array(grading_code) END) FROM pkg_packing_records WHERE code=$1) ORDER BY created_at ASC`,
          [packingCode],
        )
      : [];

    // 集蛋/原蛋来源 + 鸡舍
    let source = packaging?.production_date
      ? await this.q(
          `SELECT batch_code, house_code, flock_code, lay_date::text AS lay_date, production_date::text AS production_date, received_qty, batch_status
             FROM pkg_source_batches WHERE is_test = false AND id IN (SELECT sl.source_batch_id FROM pkg_grading_source_links sl JOIN pkg_grading_records g ON g.id=sl.grading_id WHERE NOT g.is_test AND g.code IN (SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(grading_codes_json)='array' AND jsonb_array_length(grading_codes_json)>0 THEN grading_codes_json ELSE jsonb_build_array(grading_code) END) FROM pkg_packing_records WHERE code=$1)) ORDER BY created_at ASC`,
          [packingCode],
        )
      : [];

    // Stable biological provenance follows the batch, including transfers and returns.
    const [schema]=await this.ds.query("SELECT to_regclass('inv_flock_source_links') AS links");
    const allProvenance=schema?.links?await this.ds.query(`SELECT l.*,l.production_date::text AS production_date,o.farm_code,o.site_code,o.began_on::text AS began_on,o.ended_on::text AS ended_on
      FROM inv_flock_source_links l JOIN brd_flock_occupancies o ON o.id=l.occupancy_id WHERE l.batch_no=$1 ORDER BY l.id`,[batch.batch_no]):[];
    const scope: OrgScope=dataScope?deriveOrgScope({dataScope}):{isGlobal:companyScope===undefined,farmCode:null,siteCode:null,companyCodes:companyScope??[],farmCodes:[],siteCodes:[]};
    const canRead=(r:any)=>scope.isGlobal || scope.companyCodes?.includes(r.company_code) || scope.farmCodes?.includes(r.farm_code) || scope.siteCodes?.includes(r.site_code);
    const provenance=allProvenance.filter(canRead);
    let restrictedSourceCount=allProvenance.length-provenance.length;
    if(restrictedSourceCount){source=[];grading=[];packaging=null;shift=null;}
    // No immutable biological link means the historical owner cannot be proven from today's house master.
    if(!allProvenance.length && !scope.isGlobal && (source.length||packaging)) {
      restrictedSourceCount+=Math.max(source.length,1);source=[];grading=[];packaging=null;shift=null;
    }
    const houseCodes=[...new Set([...provenance.map((x:any)=>x.house_code),...source.map((x:any)=>x.house_code)].filter(Boolean))];
    let houses: any[] = [], flocks: any[] = [], dailyLogs: any[] = [];
    if(provenance.length)houses=[...new Map(provenance.map((r:any)=>[r.house_code+'|'+r.farm_code,{house_code:r.house_code,farm_code:r.farm_code}])).values()];
    else if(houseCodes.length)houses=await this.q(`SELECT h.house_code,NULL::text AS farm_code FROM brd_houses h WHERE h.house_code=ANY($1)`,[houseCodes]);
    const flockCodes=[...new Set((provenance.length?provenance.map((x:any)=>x.flock_no):source.map((x:any)=>x.flock_code)).filter(Boolean))];
    if(flockCodes.length)flocks=await this.q(`SELECT flock_no,breed_type,breed_code
      FROM brd_flocks WHERE flock_no=ANY($1)`,[flockCodes]);
    if(provenance.length)dailyLogs=await this.ds.query(`SELECT id,house_code,flock_no,occupancy_id,log_date::text AS log_date,eggs_produced
      FROM brd_daily_logs WHERE id=ANY($1::bigint[])`,[[...new Set(provenance.map((x:any)=>x.daily_log_id))]]);
    // Old rows remain explicitly unverified; never infer a former flock from today's house occupant.
    // 标签
    const labels = await this.q(
      `SELECT label_no, batch_no, qty, status, printed_at FROM lbl_records WHERE batch_no = $1 ORDER BY printed_at DESC LIMIT 50`,
      [batch.batch_no],
    );

    // 库存流水（时间线）
    const ledger = await this.q(
      `SELECT change_type, qty_change, ref_no, operator, sku_code, note, created_at
         FROM inv_ledger WHERE batch_no = $1 ORDER BY created_at ASC LIMIT 100`,
      [batch.batch_no],
    );

    if (!dataScope) throw new NotFoundException('RECORD_NOT_ACCESSIBLE');
    const lineage: Array<{ child_batch_no: string; downstream: boolean; mixed: boolean }> =
      await readInventoryLineage(this.ds, batch.batch_no, dataScope);
    const destinationBatches = [...new Set([batch.batch_no, ...lineage.filter(edge => edge.downstream).map(edge => edge.child_batch_no)])];
    const salesOrders = await readOutboundTrace(this.ds, dataScope, { batches: destinationBatches });
    const storeSalesPage = await readPosAllocationTrace(this.ds, 'batch', batch.batch_no, dataScope, query, destinationBatches);
    const storeSales = storeSalesPage.rows;

    // 财务：AR + 现金（按销售单/门店单 source_no）
    const sourceNos = [
      ...salesOrders.map((o: any) => o.order_no),
      ...storeSales.map((s: any) => s.sale_no),
    ].filter(Boolean);
    let ar: any[] = [], cash: any[] = [];
    if (sourceNos.length) {
      ar = await this.q(
        `SELECT source_type, source_no, amount_original, balance_amount_original, status, collection_status
           FROM fin_ar_invoices WHERE source_no = ANY($1) AND ($2::text[] IS NULL OR company_code=ANY($2)) LIMIT 50`,
        [sourceNos,companyScope??null],
      );
      cash = await this.q(
        `SELECT txn_no, direction, amount, source_type, source_no, created_at
           FROM fin_cash_transactions WHERE source_no = ANY($1) AND ($2::text[] IS NULL OR company_code=ANY($2)) LIMIT 50`,
        [sourceNos,companyScope??null],
      );
    }

    // 退货：RET-/inv_ledger SALE_RETURN
    const returns = await this.q(
      `SELECT change_type, qty_change, ref_no, note, created_at
         FROM inv_ledger WHERE batch_no = $1 AND change_type IN ('SALE_RETURN','DAMAGE_WRITEOFF') ORDER BY created_at DESC LIMIT 50`,
      [batch.batch_no],
    );

    return {
      found: true,
      entry: 'batch',
      key: batch.batch_no,
      production: { provenanceStatus:restrictedSourceCount?'RESTRICTED_SOURCE':provenance.length?'VERIFIED_OCCUPANCY':'UNVERIFIED_LEGACY',restrictedSourceCount,provenance,allocationPrecision:provenance.every((x:any)=>x.precision==='EXACT')&&provenance.length?'EXACT':'RELATED_INPUT_OR_INHERITED', site: shift?.site_id ?? null, line: shift?.line_id ?? null, houses, flocks, dailyLogs, source, productionDate: packaging?.production_date ?? batch.egg_date },
      packaging: packaging ? {
        packingCode, gradingCode: packaging.grading_code, grading,
        totalBoxes: packaging.total_boxes, totalEggs: packaging.total_eggs,
        operator: shift?.operator_name ?? null, supervisor: shift?.supervisor_name ?? null,
        shiftCode: shift?.shift_code ?? null,
      } : null,
      label: { count: labels.length, records: labels },
      inventory: {
        batchNo: batch.batch_no, productCode: batch.product_code, skuCode: batch.sku_code,
        grade: batch.grade_code_std ?? batch.quality_grade, specCode: batch.spec_code,
        qty: batch.qty, qtyAvailable: batch.qty_available,
        eggDate: batch.egg_date, expireDate: batch.expire_date, companyCode: batch.company_code,
        sourceType: batch.source_type, status: batch.status, createdAt: batch.created_at,
        ledger,
      },
      sales: { salesOrders, storeSales, storeSalesPage },
      lineage,
      finance: { ar, cash },
      returns,
    };
  }
}
