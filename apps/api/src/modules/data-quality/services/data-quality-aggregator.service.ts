import { Injectable } from '@nestjs/common';
import { MasterDataHealthService } from './master-data-health.service';
import { DictHealthService } from './dict-health.service';
import { DataScopeAuditService } from './data-scope-audit.service';
import { TraceabilityHealthService } from './traceability-health.service';
import { InventoryHealthService } from './inventory-health.service';
import { WorkflowHealthService } from './workflow-health.service';
import { CodeGovernanceService } from './code-governance.service';
import { DataQualityAlertsService } from './data-quality-alerts.service';

export interface OverallScores {
  overall: number;
  masterData: number;
  dict: number;
  dataScope: number;
  traceability: number;
  inventory: number;
  workflow: number;
  code: number;
  alertCount: number;
  highAlertCount: number;
  asOf: string;
  weights: Record<string, number>;
}

/**
 * G5 — 总评分聚合
 *
 * 加权平均权重：
 *   主数据  25 ← 全集团的基石
 *   追溯    20 ← 食安/合规命脉
 *   库存    15 ← 财务/账实一致
 *   DataScope 12 ← 权限合规
 *   字典     10 ← 输入治理
 *   审批     10 ← 流程合规
 *   编码      8 ← 命名规范
 */
@Injectable()
export class DataQualityAggregatorService {
  constructor(
    private readonly md:    MasterDataHealthService,
    private readonly dict:  DictHealthService,
    private readonly ds:    DataScopeAuditService,
    private readonly trace: TraceabilityHealthService,
    private readonly inv:   InventoryHealthService,
    private readonly wf:    WorkflowHealthService,
    private readonly code:  CodeGovernanceService,
    private readonly alerts: DataQualityAlertsService,
  ) {}

  async computeOverall(): Promise<OverallScores> {
    const weights = {
      masterData: 25, traceability: 20, inventory: 15, dataScope: 12,
      dict: 10, workflow: 10, code: 8,
    };

    const [md, dict, ds, trace, inv, wf, code, alerts] = await Promise.all([
      this.md.compute(),
      this.dict.compute(),
      this.ds.compute(),
      this.trace.compute(),
      this.inv.compute(),
      this.wf.compute(),
      this.code.compute(),
      this.alerts.list(),
    ]);

    const overall = Math.round(
      (md.score    * weights.masterData
     + dict.score  * weights.dict
     + ds.score    * weights.dataScope
     + trace.score * weights.traceability
     + inv.score   * weights.inventory
     + wf.score    * weights.workflow
     + code.score  * weights.code) / 100,
    );

    return {
      overall,
      masterData:   md.score,
      dict:         dict.score,
      dataScope:    ds.score,
      traceability: trace.score,
      inventory:    inv.score,
      workflow:     wf.score,
      code:         code.score,
      alertCount:     alerts.length,
      highAlertCount: alerts.filter(a => a.severity === 'HIGH').length,
      asOf: new Date().toISOString(),
      weights,
    };
  }
}
