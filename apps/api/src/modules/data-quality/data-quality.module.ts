/**
 * Phoenix ERP V3 — G5 Data Quality Module
 *
 * 集团级数据质量治理 — 解决"数据是否可信"问题。
 *
 * 子中心：
 *   - MasterDataHealth   主数据健康（11 张主表）
 *   - DictHealth         字典健康（覆盖率 / 失效 / 重复）
 *   - DataScopeAudit     权限审计（4 维度越权风险）
 *   - TraceabilityHealth 追溯链完整率
 *   - InventoryHealth    库存健康（5 态分布 / 滞留 / 负库存）
 *   - WorkflowHealth     审批健康（超时 / 孤儿 / 失效规则）
 *   - CodeGovernance     编码规范率
 *
 * 出口：
 *   GET /api/data-quality/scores      ── 总评分 + 7 个子评分
 *   GET /api/data-quality/master-data ── 主数据明细
 *   GET /api/data-quality/dict        ── 字典明细
 *   GET /api/data-quality/datascope   ── 越权风险列表
 *   GET /api/data-quality/traceability ── 追溯抽样结果
 *   GET /api/data-quality/inventory   ── 库存异常
 *   GET /api/data-quality/workflow    ── 审批异常
 *   GET /api/data-quality/code        ── 编码异常
 *   GET /api/data-quality/alerts      ── 聚合告警列表
 */
import { Module } from '@nestjs/common';
import { DataQualityController } from './data-quality.controller';
import { MasterDataHealthService } from './services/master-data-health.service';
import { DictHealthService } from './services/dict-health.service';
import { DataScopeAuditService } from './services/data-scope-audit.service';
import { TraceabilityHealthService } from './services/traceability-health.service';
import { InventoryHealthService } from './services/inventory-health.service';
import { WorkflowHealthService } from './services/workflow-health.service';
import { CodeGovernanceService } from './services/code-governance.service';
import { DataQualityAlertsService } from './services/data-quality-alerts.service';
import { DataQualityAggregatorService } from './services/data-quality-aggregator.service';

@Module({
  controllers: [DataQualityController],
  providers: [
    MasterDataHealthService,
    DictHealthService,
    DataScopeAuditService,
    TraceabilityHealthService,
    InventoryHealthService,
    WorkflowHealthService,
    CodeGovernanceService,
    DataQualityAlertsService,
    DataQualityAggregatorService,
  ],
  exports: [DataQualityAggregatorService],
})
export class DataQualityModule {}
