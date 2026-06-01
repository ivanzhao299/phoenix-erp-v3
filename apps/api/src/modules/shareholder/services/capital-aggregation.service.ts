import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';

/**
 * CapitalAggregationService — 股东资本自动汇总。
 * 原则：paid_in_capital / total_paid_in_capital 不得人工修改，
 *       只能由「CONFIRMED 资本流」增量维护（确认 +amount，冲销 -amount）。
 *       历史导入基线不重算、不覆盖，新流在基线上增量。
 */
@Injectable()
export class CapitalAggregationService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** 资本流确认到账 → 股东实缴 +amount、项目总实缴 +amount，并重算占比 */
  applyConfirmed(projectCode: string, shareholderCode: string, amount: number, mgr?: EntityManager) {
    return this.apply(projectCode, shareholderCode, Math.abs(amount), mgr);
  }
  /** 资本流冲销 → 股东实缴 -amount、项目总实缴 -amount，并重算占比 */
  applyReversed(projectCode: string, shareholderCode: string, amount: number, mgr?: EntityManager) {
    return this.apply(projectCode, shareholderCode, -Math.abs(amount), mgr);
  }

  private async apply(projectCode: string, shareholderCode: string, delta: number, mgr?: EntityManager) {
    const run = async (m: EntityManager) => {
      // 股东实缴增量（行不存在则不动；股东须先在 shr_project_equity 中）
      await m.query(
        `UPDATE shr_project_equity
         SET paid_in_capital = COALESCE(paid_in_capital,0) + $3, updated_at = now()
         WHERE project_code = $1 AND shareholder_code = $2`,
        [projectCode, shareholderCode, delta],
      );
      // 项目总实缴增量
      await m.query(
        `UPDATE shr_projects
         SET total_paid_in_capital = COALESCE(total_paid_in_capital,0) + $2, updated_at = now()
         WHERE project_code = $1`,
        [projectCode, delta],
      );
      // 重算该项目所有股东的实缴占比
      await m.query(
        `UPDATE shr_project_equity e
         SET capital_ratio = CASE WHEN p.total_paid_in_capital > 0
               THEN round(COALESCE(e.paid_in_capital,0) / p.total_paid_in_capital * 100, 2) ELSE NULL END,
             updated_at = now()
         FROM shr_projects p
         WHERE e.project_code = p.project_code AND e.project_code = $1`,
        [projectCode],
      );
    };
    return mgr ? run(mgr) : this.ds.transaction(run);
  }
}
