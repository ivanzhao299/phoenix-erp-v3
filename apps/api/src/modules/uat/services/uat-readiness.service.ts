/**
 * Phoenix ERP V3 — 上线准备度评分 Service
 * Phase E: UAT & Pilot Run Runtime
 *
 * 评分维度（7个）：
 *   销售管理 20%  配送管理 15%  库存管理 15%  财务管理 20%
 *   审批流程 15%  采购管理  5%  系统稳定性 10%
 *
 * 规则：
 *   GREEN  >= 80 分
 *   YELLOW >= 60 分
 *   RED    <  60 分
 *   CRITICAL 未解决问题存在时：分数上限 70
 */
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface ReadinessDimension {
  key:       string;
  label:     string;
  weight:    number;
  score:     number;
  weighted:  number;
  passed:    number;
  total:     number;
  passPct:   number;
}

export interface ReadinessResult {
  score:             number;
  status:            'GREEN' | 'YELLOW' | 'RED';
  label:             string;
  hasCriticalIssues: boolean;
  criticalCount:     number;
  configuredChecklistCount: number;
  emptyDimensions:   string[];
  blockers:          string[];
  nextActions:       string[];
  dimensions:        ReadinessDimension[];
  checkedAt:         string;
}

const DIMENSIONS = [
  { key: 'SALES',       label: '销售管理',   weight: 0.20 },
  { key: 'DELIVERY',    label: '配送管理',   weight: 0.15 },
  { key: 'INVENTORY',   label: '库存管理',   weight: 0.15 },
  { key: 'FINANCE',     label: '财务管理',   weight: 0.20 },
  { key: 'APPROVAL',    label: '审批流程',   weight: 0.15 },
  { key: 'PROCUREMENT', label: '采购管理',   weight: 0.05 },
  { key: 'STABILITY',   label: '系统稳定性', weight: 0.10 },
];

@Injectable()
export class UatReadinessService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async getReadiness(): Promise<ReadinessResult> {
    // 1. 各模块验收清单通过率
    const checklistRows = await this.ds.query<any[]>(
      `SELECT
         module_code,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'PASSED') AS passed
       FROM uat_checklists
       GROUP BY module_code`,
    );

    const moduleMap: Record<string, { passed: number; total: number }> = {};
    for (const r of checklistRows) {
      moduleMap[r.module_code] = { passed: Number(r.passed), total: Number(r.total) };
    }

    // 2. CRITICAL 未解决问题
    const critRows = await this.ds.query<any[]>(
      `SELECT COUNT(*) AS count
       FROM uat_feedbacks
       WHERE severity = 'CRITICAL' AND status NOT IN ('RESOLVED','CLOSED','REJECTED')`,
    );
    const criticalCount = Number(critRows[0]?.count ?? 0);

    // 3. 系统稳定性（最近 24h 500 错误数）
    let stabilityScore = 100;
    try {
      const errRows = await this.ds.query<any[]>(
        `SELECT COUNT(*) AS count FROM sys_error_logs
         WHERE created_at > NOW() - INTERVAL '24 hours' AND http_status = 500`,
      );
      const errors = Number(errRows[0]?.count ?? 0);
      if      (errors === 0)  stabilityScore = 100;
      else if (errors <= 5)   stabilityScore = 80;
      else if (errors <= 20)  stabilityScore = 60;
      else                    stabilityScore = 40;
    } catch {
      // sys_error_logs 不存在时（DDL 25 未执行）降级处理
      stabilityScore = 75;
    }

    // 4. 组装各维度
    const dimensions: ReadinessDimension[] = DIMENSIONS.map(dim => {
      if (dim.key === 'STABILITY') {
        return {
          key:     dim.key,
          label:   dim.label,
          weight:  dim.weight,
          score:   stabilityScore,
          weighted: stabilityScore * dim.weight,
          passed:  0,
          total:   0,
          passPct: stabilityScore,
        };
      }
      const m = moduleMap[dim.key] ?? { passed: 0, total: 0 };
      const passPct = m.total > 0 ? Math.round((m.passed / m.total) * 100) : 0;
      return {
        key:     dim.key,
        label:   dim.label,
        weight:  dim.weight,
        score:   passPct,
        weighted: passPct * dim.weight,
        passed:  m.passed,
        total:   m.total,
        passPct,
      };
    });

    // 5. 加权总分
    let weightedScore = dimensions.reduce((acc, d) => acc + d.score * d.weight, 0);
    const configuredChecklistCount = dimensions
      .filter(d => d.key !== 'STABILITY')
      .reduce((sum, d) => sum + d.total, 0);
    const emptyDimensions = dimensions
      .filter(d => d.key !== 'STABILITY' && d.total === 0)
      .map(d => d.label);
    const blockers: string[] = [];
    const nextActions: string[] = [];
    if (configuredChecklistCount === 0) {
      blockers.push('尚未配置 UAT 验收清单，准备度评分只能作为系统稳定性参考。');
      nextActions.push('先为销售、配送、库存、财务、审批、采购配置最小验收清单。');
    }
    if (emptyDimensions.length > 0) {
      nextActions.push(`补齐未配置清单维度：${emptyDimensions.join('、')}。`);
    }
    if (criticalCount > 0) {
      blockers.push(`存在 ${criticalCount} 条 CRITICAL 未解决问题。`);
      nextActions.push('先关闭或降级所有 CRITICAL UAT 问题，再申请上线 Gate。');
    }

    // CRITICAL 未解决时上限 70
    if (criticalCount > 0) {
      weightedScore = Math.min(weightedScore, 70);
    }

    const score = Math.round(weightedScore);
    const status: 'GREEN' | 'YELLOW' | 'RED' =
      score >= 80 ? 'GREEN' : score >= 60 ? 'YELLOW' : 'RED';
    const label = status === 'GREEN' ? '✅ 可以上线'
                : status === 'YELLOW' ? '⚠️ 需要改进'
                : '❌ 不建议上线';

    return {
      score,
      status,
      label,
      hasCriticalIssues: criticalCount > 0,
      criticalCount,
      configuredChecklistCount,
      emptyDimensions,
      blockers,
      nextActions,
      dimensions,
      checkedAt: new Date().toISOString(),
    };
  }
}
