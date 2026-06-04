import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

export interface WorkflowHealthReport {
  score: number;
  totalInstances: number;
  pending: number;
  overdue: number;
  orphan: number;       // 无对应规则的实例
  staleRules: number;   // 长期未触发的规则
  asOf: string;
}

/**
 * G5 — 审批健康
 *
 * 检查 wf_* 工作流引擎表：
 *   - 未处理 / 超时未处理（>3 days）
 *   - 实例孤儿（无 active 规则）
 *   - 规则长期未触发
 *
 * 评分：
 *   100 - (超时数 / 进行中总数) * 100
 */
@Injectable()
export class WorkflowHealthService {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  private async safe<T = any>(sql: string): Promise<T[]> {
    try { return await this.em.query(sql); } catch { return []; }
  }

  async compute(): Promise<WorkflowHealthReport> {
    const total = await this.safe<{ c: string }>(`SELECT COUNT(*)::text AS c FROM wf_instances`);
    const pending = await this.safe<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM wf_instances WHERE status IN ('PENDING','RUNNING')`,
    );
    const overdue = await this.safe<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM wf_instances
         WHERE status IN ('PENDING','RUNNING')
           AND created_at < NOW() - INTERVAL '3 days'`,
    );
    const orphan = await this.safe<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM wf_instances i
         WHERE i.rule_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM wf_rules r WHERE r.id = i.rule_id)`,
    );
    const stale = await this.safe<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM wf_rules r
         WHERE COALESCE(r.enabled, true) = true
           AND NOT EXISTS (
             SELECT 1 FROM wf_instances i
               WHERE i.rule_id = r.id
                 AND i.created_at > NOW() - INTERVAL '90 days'
           )`,
    );

    const totalN   = parseInt(total[0]?.c ?? '0', 10);
    const pendingN = parseInt(pending[0]?.c ?? '0', 10);
    const overdueN = parseInt(overdue[0]?.c ?? '0', 10);
    const orphanN  = parseInt(orphan[0]?.c ?? '0', 10);
    const staleN   = parseInt(stale[0]?.c ?? '0', 10);

    const score = pendingN === 0
      ? 100
      : Math.max(0, Math.round(100 - (overdueN / pendingN) * 100 - orphanN));

    return {
      score: Math.min(100, score),
      totalInstances: totalN,
      pending: pendingN,
      overdue: overdueN,
      orphan: orphanN,
      staleRules: staleN,
      asOf: new Date().toISOString(),
    };
  }
}
