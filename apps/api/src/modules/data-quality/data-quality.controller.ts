import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MasterDataHealthService } from './services/master-data-health.service';
import { DictHealthService } from './services/dict-health.service';
import { DataScopeAuditService } from './services/data-scope-audit.service';
import { TraceabilityHealthService } from './services/traceability-health.service';
import { InventoryHealthService } from './services/inventory-health.service';
import { WorkflowHealthService } from './services/workflow-health.service';
import { CodeGovernanceService } from './services/code-governance.service';
import { DataQualityAlertsService } from './services/data-quality-alerts.service';
import { DataQualityAggregatorService } from './services/data-quality-aggregator.service';

/**
 * G5 Data Quality Center —— 7 个子健康检查 + 总评分 + 告警聚合
 *
 * 评分规则（所有子项 0-100）：
 *   100  完美
 *   90+  优秀
 *   75+  良好
 *   60+  及格
 *   <60  需要立刻整改
 *
 * 总评分采用加权平均，权重见 DataQualityAggregatorService。
 */
@Controller('api/data-quality')
@UseGuards(AuthGuard('jwt'))
export class DataQualityController {
  constructor(
    private readonly md:    MasterDataHealthService,
    private readonly dict:  DictHealthService,
    private readonly ds:    DataScopeAuditService,
    private readonly trace: TraceabilityHealthService,
    private readonly inv:   InventoryHealthService,
    private readonly wf:    WorkflowHealthService,
    private readonly code:  CodeGovernanceService,
    private readonly alerts: DataQualityAlertsService,
    private readonly agg:   DataQualityAggregatorService,
  ) {}

  /** 总评分 + 7 个子评分（驾驶舱主入口） */
  @Get('scores')
  async scores() {
    return this.agg.computeOverall();
  }

  @Get('master-data')      masterData()      { return this.md.compute(); }
  @Get('dict')             dictHealth()      { return this.dict.compute(); }
  @Get('datascope')        dataScope()       { return this.ds.compute(); }
  @Get('traceability')     traceability()    { return this.trace.compute(); }
  @Get('inventory')        inventory()       { return this.inv.compute(); }
  @Get('workflow')         workflow()        { return this.wf.compute(); }
  @Get('code')             code_()           { return this.code.compute(); }

  /** 聚合告警列表（消息中心 / 邮件订阅订阅源） */
  @Get('alerts')           alertsList()      { return this.alerts.list(); }
}
