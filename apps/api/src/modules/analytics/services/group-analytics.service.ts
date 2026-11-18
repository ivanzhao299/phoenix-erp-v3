import { officialInventoryPredicate, officialInventoryCostAggregate, officialInventoryCostKnownPredicate } from '../../wms/official-inventory';
import { savedQuantity } from '../../product-master/services/quantity-contract';
import { DataScopeContext } from '../../org/services/data-scope.service';
import { ForbiddenException, BadRequestException, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

export interface GroupKpis {
  revenue:           number|null;  // 营业收入
  grossProfit:       number|null;  // 毛利
  netProfit:         number|null;  // 订单估算毛利减已确认费用，非财务结账结果
  cashBalance:       number|null;  // 现金余额（所有资金账户合计）
  inventoryValue:    number|null;
  inventoryCostPendingBatches:number|null;
  inventoryCostPendingQuantity:number|null;  // 库存金额
  receivable:        number|null;  // 应收余额
  payable:           number|null;  // 应付余额
  shareholderInput:  number|null;  // 股东累计投入
  projectRevenue:    number|null;  // 项目收益（项目维度收入）
  grossProfitCostPendingLines:number|null;
  grossProfitCurrency:string|null;
  grossProfitStatus:'COMPLETE'|'COST_PENDING'|'MIXED_CURRENCY'|'UNAVAILABLE';
  grossProfitBasis:'ORDER_ESTIMATE';
  asOf:              string;
  dimensions: {
    companyCount: number|null;
    projectCount: number|null;
    customerCount: number|null;
  };
}

/** A date-only filter denotes a Singapore business day, regardless of the database session timezone. */
function businessDateBound(value:string|undefined,nextDay=false):string|undefined{
  if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
  return new Date(Date.parse(`${value}T00:00:00+08:00`)+(nextDay?86400000:0)).toISOString();
}

/**
 * G6-A — 集团经营分析
 *
 * 9 个集团级 KPI；支持 companyCode / projectCode / dateFrom / dateTo 过滤。
 * 数据来源（G5 评分通过的可信数据源）：
 *   - sal_sales_orders / sal_order_items     营收 + 毛利
 *   - fin_ar_invoices / fin_ap_invoices    应收 / 应付
 *   - fin_cash_accounts                    现金余额
 *   - inv_batches                          库存
 *   - fin_shareholder_contributions                    股东投入
 */
@Injectable()
export class GroupAnalyticsService {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  private async safe<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    try { return await this.em.query(sql, params); } catch (e: any) { console.error("[catch-audit] safe() SQL failed:", e?.message); return []; }
  }

  private async expectedProfit(q:{projectCode?:string;dateFrom?:string;dateTo?:string;dateToExclusive:boolean},companies:string[]|null,warehouses:string[]|null):Promise<{
    value:number|null;pendingLines:number|null;currency:string|null;status:GroupKpis['grossProfitStatus']
  }>{
    try{return await this.em.transaction('REPEATABLE READ',async m=>{
      await m.query('SET TRANSACTION READ ONLY');
      const items=await m.query(`SELECT i.id,i.qty,i.quantity_snapshot,i.amount,i.allocated_batch_no,i.allocated_qty,
          so.company_code,NULLIF(btrim(so.currency_code),'') AS currency_code FROM sal_order_items i JOIN sal_sales_orders so ON so.id=i.sales_order_id
        WHERE ($1::text[] IS NULL OR so.company_code=ANY($1::text[]))
          AND ($2::text IS NULL OR to_jsonb(so)->>'project_code'=$2)
          AND ($3::timestamptz IS NULL OR so.created_at >= $3::timestamptz)
          AND ($4::timestamptz IS NULL OR CASE WHEN $5::boolean
            THEN so.created_at < $4::timestamptz ELSE so.created_at <= $4::timestamptz END) ORDER BY i.id`,
        [companies,q.projectCode??null,q.dateFrom??null,q.dateTo??null,q.dateToExclusive]);
      if(!items.length)return {value:0,pendingLines:0,currency:null,status:'COMPLETE' as const};
      const requests=items.map((i:any)=>{
        let required:number|null=null;try{required=savedQuantity(i);}catch{/* An invalid saved quantity is unknown, never inferred from today's master. */}
        return {id:String(i.id),required_quantity:required,valid:required!==null&&i.amount!==null&&Number.isFinite(Number(i.amount)),amount:i.amount,
          expected_unit:i.quantity_snapshot?.baseUnit??null,legacy_batch:i.allocated_batch_no??null,legacy_allocated:i.allocated_qty??null,
          company_code:i.company_code,currency_code:i.currency_code};
      });
      const [result]=await m.query(`WITH requested AS(
          SELECT * FROM jsonb_to_recordset($1::jsonb) r(id bigint,required_quantity numeric,valid boolean,amount numeric,
            expected_unit text,legacy_batch text,legacy_allocated numeric,company_code text,currency_code text)
        ), links AS(
          SELECT r.id,a.batch_no,a.reserved_qty-a.released_qty AS quantity FROM requested r
            JOIN sal_order_item_batch_allocations a ON a.sales_order_item_id=r.id
          UNION ALL SELECT r.id,btrim(r.legacy_batch),r.legacy_allocated FROM requested r
            WHERE r.legacy_batch IS NOT NULL AND position(',' IN r.legacy_batch)=0 AND r.legacy_allocated=r.required_quantity
              AND NOT EXISTS(SELECT 1 FROM sal_order_item_batch_allocations a WHERE a.sales_order_item_id=r.id)
        ), costs AS(
          SELECT r.id,r.required_quantity,r.valid,r.amount,r.currency_code,COALESCE(SUM(l.quantity),0) AS covered,
            COALESCE(SUM(l.quantity*b.unit_cost),0) AS cost,
            COUNT(*) FILTER(WHERE l.id IS NOT NULL AND (l.quantity<0 OR l.quantity>0 AND (b.batch_no IS NULL OR b.company_code IS DISTINCT FROM r.company_code
              OR ($2::text[] IS NOT NULL AND (b.warehouse_code=ANY($2::text[])) IS NOT TRUE)
              OR NOT (${officialInventoryPredicate('b')}) OR NOT (${officialInventoryCostKnownPredicate('b')})
              OR b.unit_cost<>0 AND purchase.currency_code IS DISTINCT FROM r.currency_code
              OR r.expected_unit IS NOT NULL AND b.unit IS DISTINCT FROM r.expected_unit))) AS invalid
          FROM requested r LEFT JOIN links l ON l.id=r.id LEFT JOIN inv_batches b ON b.batch_no=l.batch_no
          LEFT JOIN LATERAL(
            SELECT CASE WHEN COUNT(DISTINCT NULLIF(po.currency_code,''))=1 THEN MIN(NULLIF(po.currency_code,'')) END AS currency_code
              FROM prc2_receipts receipt JOIN prc2_receipt_items ri ON ri.receipt_id=receipt.id
              JOIN prc2_order_items pi ON pi.id=ri.po_item_id AND pi.po_id=receipt.po_id
              JOIN prc2_purchase_orders po ON po.id=receipt.po_id
              WHERE b.source_type='PURCHASE' AND receipt.receipt_no=b.source_no AND receipt.status='CONFIRMED'
                AND receipt.company_code=b.company_code AND po.company_code=b.company_code
                AND receipt.warehouse_code=b.warehouse_code AND ri.item_code=b.sku_code AND ri.unit=b.unit
                AND ri.actual_qty>0 AND pi.unit_price=b.unit_cost
                AND EXISTS(SELECT 1 FROM inv_ledger proof WHERE proof.batch_no=b.batch_no AND proof.ref_no=receipt.receipt_no
                  AND proof.change_type='PURCHASE_INBOUND' AND proof.qty_change=ri.actual_qty)
          ) purchase ON TRUE
          GROUP BY r.id,r.required_quantity,r.valid,r.amount,r.currency_code
        ), checked AS(SELECT *,valid AND covered=required_quantity AND invalid=0 AS complete FROM costs)
        SELECT CASE WHEN COUNT(*) FILTER(WHERE NOT complete)>0 OR COUNT(DISTINCT currency_code)>1 OR COUNT(*) FILTER(WHERE currency_code IS NULL)>0
          THEN NULL ELSE COALESCE(SUM(amount-cost),0) END::text AS value,
          COUNT(*) FILTER(WHERE NOT complete OR currency_code IS NULL)::int AS pending_lines,COUNT(DISTINCT currency_code)::int AS currencies,
          COUNT(*) FILTER(WHERE currency_code IS NULL)::int AS missing_currency,
          CASE WHEN COUNT(DISTINCT currency_code)=1 THEN MIN(currency_code) ELSE NULL END AS currency FROM checked`,
        [JSON.stringify(requests),warehouses]);
      if(result.value!==null&&!Number.isFinite(Number(result.value)))return {value:null,pendingLines:null,currency:result.currency,status:'UNAVAILABLE' as const};
      return {value:result.value===null?null:Number(result.value),pendingLines:result.pending_lines,currency:result.currency,
        status:result.currencies>1?'MIXED_CURRENCY' as const:result.pending_lines>0||result.missing_currency>0?'COST_PENDING' as const:'COMPLETE' as const};
    });}catch(error){console.error('[group-profit] source/quantity/cost query unavailable:',error instanceof Error?error.message:'query failed');
      return {value:null,pendingLines:null,currency:null,status:'UNAVAILABLE'};}
  }

  async compute(q: { companyCode?: string; projectCode?: string; dateFrom?: string; dateTo?: string },scope?:DataScopeContext): Promise<GroupKpis> {
    if(!scope)throw new ForbiddenException('缺少集团分析的实际公司数据范围');
    for(const value of [q.companyCode,q.projectCode,q.dateFrom,q.dateTo])if(value!==undefined&&(typeof value!=='string'||!value.trim()||value.length>128))throw new BadRequestException('分析筛选条件无效');
    for(const value of [q.dateFrom,q.dateTo])if(value&&!Number.isFinite(Date.parse(value)))throw new BadRequestException('分析日期无效');
    if(!scope.isGlobal&&(!scope.allowedCompanyCodes.length||q.companyCode&&!scope.allowedCompanyCodes.includes(q.companyCode)))throw new ForbiddenException('无权查看该公司的经营分析');
    const companies=q.companyCode?[q.companyCode]:scope.isGlobal?null:[...new Set(scope.allowedCompanyCodes)];
    const quote=(value:string)=>`'${value.replace(/'/g,"''")}'`;
    const companyFilter=companies?`AND company_code IN (${companies.map(quote).join(',')})`:'';
    const warehouses=scope.isGlobal?null:scope.allowedWarehouseCodes;
    const warehouseFilter=warehouses?warehouses.length?`AND warehouse_code IN (${warehouses.map(quote).join(',')})`:'AND FALSE':'';
    const metric=(rows:Array<{v:string|null}>)=>rows.length&&rows[0].v!==null&&Number.isFinite(Number(rows[0].v))?Number(rows[0].v):null;
    const count=(rows:Array<{c:string}>)=>rows.length?Number(rows[0].c):null;
    const projectFilter = q.projectCode ? `AND to_jsonb(sal_sales_orders)->>'project_code' = '${q.projectCode.replace(/'/g, "''")}'` : '';
    const dateFrom=businessDateBound(q.dateFrom),dateToExclusive=!!q.dateTo&&/^\d{4}-\d{2}-\d{2}$/.test(q.dateTo),dateTo=businessDateBound(q.dateTo,dateToExclusive);
    const dateFromF=dateFrom?`AND created_at >= '${dateFrom.replace(/'/g,"''")}'::timestamptz`:'';
    const dateToF=dateTo?`AND created_at ${dateToExclusive?'<':'<='} '${dateTo.replace(/'/g,"''")}'::timestamptz`:'';

    const revenueRows = await this.safe<{ v: string }>(
      `SELECT COALESCE(SUM(total_amount),0)::text AS v FROM sal_sales_orders WHERE 1=1 ${companyFilter} ${projectFilter} ${dateFromF} ${dateToF}`,
    );
    const revenue = metric(revenueRows);

    // Expected order-line margin, not a posted financial result. Unknown cost/quantity never becomes zero.
    const profit=await this.expectedProfit({...q,dateFrom,dateTo,dateToExclusive},companies,warehouses);
    const grossProfit=profit.value;

    const cashRows = await this.safe<{ v: string }>(
      `SELECT COALESCE(SUM(current_balance),0)::text AS v FROM fin_cash_accounts
         WHERE COALESCE(status,'ACTIVE')='ACTIVE' ${companyFilter}`,
    );
    const cashBalance = metric(cashRows);

    const invRows = await this.safe<{ value:string|null;cost_pending_batches:number;cost_pending_quantity:string }>(
      `SELECT ${officialInventoryCostAggregate('inv_batches')}
         FROM inv_batches WHERE ${officialInventoryPredicate('inv_batches')} AND COALESCE(status,'AVAILABLE') IN ('AVAILABLE','RESERVED','QUARANTINE') ${companyFilter} ${warehouseFilter}`,
    );
    const inventoryValue=!invRows.length||invRows[0].value===null?null:Number(invRows[0].value);

    const arRows = await this.safe<{ v: string }>(
      `SELECT COALESCE(SUM(balance_amount_original),0)::text AS v FROM fin_ar_invoices
         WHERE COALESCE(collection_status,'UNPAID') <> 'PAID' ${companyFilter}`,
    );
    const receivable = metric(arRows);

    const apRows = await this.safe<{ v: string }>(
      `SELECT COALESCE(SUM(balance_amount_original),0)::text AS v FROM fin_ap_invoices
         WHERE COALESCE(payment_status,'UNPAID') <> 'PAID' ${companyFilter}`,
    );
    const payable = metric(apRows);

    const shrRows = await this.safe<{ v: string }>(
      `SELECT COALESCE(SUM(amount_original),0)::text AS v FROM fin_shareholder_contributions
         WHERE COALESCE(status,'CONFIRMED') IN ('CONFIRMED','PARTIALLY_SETTLED','SETTLED') ${companyFilter}`,
    );
    const shareholderInput = metric(shrRows);

    const projRevRows = await this.safe<{ v: string }>(
      `SELECT COALESCE(SUM(total_amount),0)::text AS v FROM sal_sales_orders
         WHERE to_jsonb(sal_sales_orders)->>'project_code' IS NOT NULL ${companyFilter} ${projectFilter} ${dateFromF} ${dateToF}`,
    );
    const projectRevenue = metric(projRevRows);

    // Preserve the existing estimate: order margin less confirmed expenses.
    const expenseFrom=q.dateFrom?`AND (expense_date IS NULL OR expense_date >= '${q.dateFrom.replace(/'/g,"''")}'::date)`:'';
    const expenseTo=q.dateTo?`AND (expense_date IS NULL OR expense_date <= '${q.dateTo.replace(/'/g,"''")}'::date)`:'';
    const expensesRows = await this.safe<{ v: string }>(
      `SELECT CASE WHEN COUNT(*) FILTER(WHERE amount_original<>0 AND
          (currency_code IS DISTINCT FROM $1::text OR ($2::boolean AND expense_date IS NULL)))>0
        THEN NULL ELSE COALESCE(SUM(amount_original),0) END::text AS v FROM fin_expense_requests
         WHERE status IN ('APPROVED','REIMBURSED') ${companyFilter} ${expenseFrom} ${expenseTo}
           AND ($3::text IS NULL OR to_jsonb(fin_expense_requests)->>'project_code'=$3)`,
      [profit.currency,!!(q.dateFrom||q.dateTo),q.projectCode??null],
    );
    const expenses = metric(expensesRows);
    const netProfit = grossProfit===null||expenses===null?null:grossProfit-expenses;

    const dims = {
      companyCount:  count(await this.safe<{c:string}>(`SELECT COUNT(DISTINCT company_code)::text AS c FROM sal_sales_orders WHERE 1=1 ${companyFilter}`)),
      projectCount: count(await this.safe<{c:string}>(`SELECT COUNT(DISTINCT (to_jsonb(sal_sales_orders)->>'project_code'))::text AS c FROM sal_sales_orders WHERE 1=1 ${companyFilter}`)),
      customerCount: count(await this.safe<{c:string}>(`SELECT COUNT(DISTINCT customer_code)::text AS c FROM sal_sales_orders WHERE customer_code IS NOT NULL ${companyFilter}`)),
    };

    return {
      revenue, grossProfit, netProfit, cashBalance, inventoryValue,
      inventoryCostPendingBatches:invRows[0]?.cost_pending_batches??null,inventoryCostPendingQuantity:invRows.length?Number(invRows[0].cost_pending_quantity):null,
      grossProfitCostPendingLines:profit.pendingLines,grossProfitCurrency:profit.currency,grossProfitStatus:profit.status,grossProfitBasis:'ORDER_ESTIMATE',
      receivable, payable, shareholderInput, projectRevenue,
      asOf: new Date().toISOString(),
      dimensions: dims,
    };
  }
}
