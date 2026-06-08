import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * AR Ledger Service — 应收总账（G41）
 *
 * 只读查询 fin_ar_ledger：按场 / 期间 / 往来单位过滤，返回明细 + 合计 + 可选维度。
 * DataScope：scopeAll 用户（如刘杰 GROUP 财务）看全部；受限用户按 company_code 过滤。
 */
@Injectable()
export class ArLedgerService {
  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
  ) {}

  private scope(user: any): { all: boolean; codes: string[] } {
    return {
      all:   !!(user?.dataScope?.scopeAll),
      codes: (user?.dataScope?.companyCodes ?? []) as string[],
    };
  }

  /** 可选维度：场列表 + 期间列表（供前端筛选下拉） */
  async dimensions(user: any) {
    const { all, codes } = this.scope(user);
    const sf = all ? '' : 'WHERE (company_code = ANY($1) OR company_code IS NULL)';
    const params = all ? [] : [codes];
    const farms = await this.ds.query(
      `SELECT DISTINCT farm_code AS "farmCode", farm_name AS "farmName" FROM fin_ar_ledger ${sf} ORDER BY farm_code`,
      params,
    );
    const periods = await this.ds.query(
      `SELECT DISTINCT to_char(period_date,'YYYY-MM-DD') AS "periodDate" FROM fin_ar_ledger ${sf} ORDER BY 1 DESC`,
      params,
    );
    return { farms, periods };
  }

  /**
   * 应收总账明细 + 合计。
   * @param filters farmCode? / periodDate?（YYYY-MM-DD）
   */
  async list(user: any, filters: { farmCode?: string; periodDate?: string }) {
    const { all, codes } = this.scope(user);
    const where: string[] = [];
    const params: any[] = [];
    let i = 1;

    if (!all) { where.push(`(company_code = ANY($${i}) OR company_code IS NULL)`); params.push(codes); i++; }
    if (filters.farmCode)   { where.push(`farm_code = $${i}`); params.push(filters.farmCode); i++; }
    if (filters.periodDate) { where.push(`period_date = $${i}`); params.push(filters.periodDate); i++; }

    const ws = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = await this.ds.query(
      `SELECT id, farm_code AS "farmCode", farm_name AS "farmName", company_code AS "companyCode",
              counterparty_code AS "counterpartyCode", counterparty_name AS "counterpartyName",
              to_char(period_date,'YYYY-MM-DD') AS "periodDate", currency_code AS "currencyCode",
              opening_amount AS "openingAmount", period_charge AS "periodCharge",
              period_received AS "periodReceived", closing_amount AS "closingAmount",
              closing_amount_base AS "closingAmountBase", base_currency AS "baseCurrency",
              source, remark
         FROM fin_ar_ledger ${ws}
        ORDER BY farm_code, period_date DESC, counterparty_code NULLS LAST, counterparty_name`,
      params,
    );

    const totalRow = await this.ds.query(
      `SELECT COALESCE(SUM(opening_amount),0)      AS "openingAmount",
              COALESCE(SUM(period_charge),0)       AS "periodCharge",
              COALESCE(SUM(period_received),0)     AS "periodReceived",
              COALESCE(SUM(closing_amount),0)      AS "closingAmount",
              COALESCE(SUM(closing_amount_base),0) AS "closingAmountBase",
              COUNT(*)::int                        AS "rowCount"
         FROM fin_ar_ledger ${ws}`,
      params,
    );

    return { rows, totals: totalRow[0] };
  }
}
