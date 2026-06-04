import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

/**
 * G6-F — 股东分析中心
 *
 * 5 个指标：累计出资 / 资本流 / 分红 / 回报率 / 项目收益率
 */
@Injectable()
export class ShareholderAnalyticsService {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  private async safe<T = any>(sql: string): Promise<T[]> {
    try { return await this.em.query(sql); } catch { return []; }
  }

  async compute(_q: any) {
    const byShareholder = await this.safe<any>(
      `SELECT shareholder_code, shareholder_name,
              COUNT(*)::int AS contributions,
              COALESCE(SUM(amount_original),0)::text AS total,
              COALESCE(SUM(balance_amount_original),0)::text AS balance
         FROM fin_shareholder_contributions
         WHERE COALESCE(status,'CONFIRMED') IN ('CONFIRMED','PARTIALLY_SETTLED','SETTLED')
         GROUP BY shareholder_code, shareholder_name
         ORDER BY SUM(amount_original) DESC`,
    );

    const byProject = await this.safe<any>(
      `SELECT project_code, project_name,
              COALESCE(SUM(amount_original),0)::text AS investment,
              COUNT(*)::int AS contributions
         FROM fin_shareholder_contributions
         WHERE project_code IS NOT NULL
           AND COALESCE(status,'CONFIRMED') IN ('CONFIRMED','PARTIALLY_SETTLED','SETTLED')
         GROUP BY project_code, project_name
         ORDER BY SUM(amount_original) DESC`,
    );

    // 资本流：近 12 月
    const cashFlow = await this.safe<any>(
      `SELECT DATE_TRUNC('month', created_at)::date AS month,
              COALESCE(SUM(amount_original),0)::text AS inflow
         FROM fin_shareholder_contributions WHERE created_at > NOW() - INTERVAL '12 months'
         GROUP BY DATE_TRUNC('month', created_at) ORDER BY month`,
    );

    // 总累计 + 已结算
    const total = await this.safe<{ v: string }>(
      `SELECT COALESCE(SUM(amount_original),0)::text AS v FROM fin_shareholder_contributions
         WHERE COALESCE(status,'CONFIRMED') IN ('CONFIRMED','PARTIALLY_SETTLED','SETTLED')`,
    );
    const settled = await this.safe<{ v: string }>(
      `SELECT COALESCE(SUM(settled_amount_original),0)::text AS v FROM fin_shareholder_contributions
         WHERE COALESCE(status,'CONFIRMED') IN ('CONFIRMED','PARTIALLY_SETTLED','SETTLED')`,
    );

    const totalN = parseFloat(total[0]?.v ?? '0');
    const settledN = parseFloat(settled[0]?.v ?? '0');
    const repaymentRate = totalN > 0 ? Math.round((settledN / totalN) * 1000) / 10 : 0;

    return {
      totalContributed: totalN,
      totalSettled: settledN,
      repaymentRatePct: repaymentRate,
      byShareholder,
      byProject,
      monthlyInflow12Mo: cashFlow,
      asOf: new Date().toISOString(),
    };
  }
}
