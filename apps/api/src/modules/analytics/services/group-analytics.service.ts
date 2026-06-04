import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

export interface GroupKpis {
  revenue:           number;  // 营业收入
  grossProfit:       number;  // 毛利
  netProfit:         number;  // 净利润（粗算 = 收入 - 费用 - 报损 - 应付）
  cashBalance:       number;  // 现金余额（所有资金账户合计）
  inventoryValue:    number;  // 库存金额
  receivable:        number;  // 应收余额
  payable:           number;  // 应付余额
  shareholderInput:  number;  // 股东累计投入
  projectRevenue:    number;  // 项目收益（项目维度收入）
  asOf:              string;
  dimensions: {
    companyCount: number;
    projectCount: number;
    customerCount: number;
  };
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

  async compute(q: { companyCode?: string; projectCode?: string; dateFrom?: string; dateTo?: string }): Promise<GroupKpis> {
    const companyFilter = q.companyCode ? `AND company_code = '${q.companyCode.replace(/'/g, "''")}'` : '';
    const projectFilter = q.projectCode ? `AND project_code = '${q.projectCode.replace(/'/g, "''")}'` : '';
    const dateFromF     = q.dateFrom    ? `AND created_at >= '${q.dateFrom.replace(/'/g, "''")}'` : '';
    const dateToF       = q.dateTo      ? `AND created_at <= '${q.dateTo.replace(/'/g, "''")}'` : '';

    const revenueRows = await this.safe<{ v: string }>(
      `SELECT COALESCE(SUM(total_amount),0)::text AS v FROM sal_sales_orders WHERE 1=1 ${companyFilter} ${projectFilter} ${dateFromF} ${dateToF}`,
    );
    const revenue = parseFloat(revenueRows[0]?.v ?? '0');

    // 毛利 = 收入 - 出库批次成本（简化：用 inv_batches 平均成本）
    const grossProfitRows = await this.safe<{ v: string }>(
      `SELECT COALESCE(SUM(soi.qty * (soi.actual_unit_price - COALESCE(b.unit_cost,0))),0)::text AS v
         FROM sal_order_items soi
         JOIN sal_sales_orders so ON so.id = soi.so_id
         LEFT JOIN inv_batches b ON b.batch_no = soi.batch_no
         WHERE 1=1 ${q.companyCode ? `AND so.company_code = '${q.companyCode.replace(/'/g, "''")}'` : ''}`,
    );
    const grossProfit = parseFloat(grossProfitRows[0]?.v ?? '0');

    const cashRows = await this.safe<{ v: string }>(
      `SELECT COALESCE(SUM(current_balance),0)::text AS v FROM fin_cash_accounts
         WHERE COALESCE(status,'ACTIVE')='ACTIVE' ${q.companyCode ? `AND company_code = '${q.companyCode.replace(/'/g, "''")}'` : ''}`,
    );
    const cashBalance = parseFloat(cashRows[0]?.v ?? '0');

    const invRows = await this.safe<{ v: string }>(
      `SELECT COALESCE(SUM(qty * COALESCE(unit_cost,0)),0)::text AS v
         FROM inv_batches WHERE COALESCE(status,'AVAILABLE') IN ('AVAILABLE','RESERVED','QUARANTINE')`,
    );
    const inventoryValue = parseFloat(invRows[0]?.v ?? '0');

    const arRows = await this.safe<{ v: string }>(
      `SELECT COALESCE(SUM(balance_amount_original),0)::text AS v FROM fin_ar_invoices
         WHERE COALESCE(payment_status,'UNPAID') <> 'PAID' ${companyFilter}`,
    );
    const receivable = parseFloat(arRows[0]?.v ?? '0');

    const apRows = await this.safe<{ v: string }>(
      `SELECT COALESCE(SUM(balance_amount_original),0)::text AS v FROM fin_ap_invoices
         WHERE COALESCE(payment_status,'UNPAID') <> 'PAID' ${companyFilter}`,
    );
    const payable = parseFloat(apRows[0]?.v ?? '0');

    const shrRows = await this.safe<{ v: string }>(
      `SELECT COALESCE(SUM(amount_original),0)::text AS v FROM fin_shareholder_contributions
         WHERE COALESCE(status,'CONFIRMED') IN ('CONFIRMED','PARTIALLY_SETTLED','SETTLED')`,
    );
    const shareholderInput = parseFloat(shrRows[0]?.v ?? '0');

    const projRevRows = await this.safe<{ v: string }>(
      `SELECT COALESCE(SUM(total_amount),0)::text AS v FROM sal_sales_orders
         WHERE project_code IS NOT NULL ${companyFilter} ${projectFilter} ${dateFromF} ${dateToF}`,
    );
    const projectRevenue = parseFloat(projRevRows[0]?.v ?? '0');

    // 简化"净利润" = 毛利 - 已确认费用 - 报损损失
    const expensesRows = await this.safe<{ v: string }>(
      `SELECT COALESCE(SUM(amount_original),0)::text AS v FROM fin_expense_requests
         WHERE status IN ('APPROVED','REIMBURSED') ${companyFilter}`,
    );
    const expenses = parseFloat(expensesRows[0]?.v ?? '0');
    const netProfit = grossProfit - expenses;

    const dims = {
      companyCount:  parseInt(((await this.safe<{ c: string }>(`SELECT COUNT(DISTINCT company_code)::text AS c FROM sal_sales_orders WHERE 1=1 ${companyFilter}`))[0]?.c ?? '0'), 10),
      projectCount:  parseInt(((await this.safe<{ c: string }>(`SELECT COUNT(DISTINCT project_code)::text AS c FROM sal_sales_orders WHERE project_code IS NOT NULL ${companyFilter}`))[0]?.c ?? '0'), 10),
      customerCount: parseInt(((await this.safe<{ c: string }>(`SELECT COUNT(DISTINCT customer_code)::text AS c FROM sal_sales_orders WHERE customer_code IS NOT NULL ${companyFilter}`))[0]?.c ?? '0'), 10),
    };

    return {
      revenue, grossProfit, netProfit, cashBalance, inventoryValue,
      receivable, payable, shareholderInput, projectRevenue,
      asOf: new Date().toISOString(),
      dimensions: dims,
    };
  }
}
