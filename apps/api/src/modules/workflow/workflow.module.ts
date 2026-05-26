import { Module, forwardRef } from '@nestjs/common';
import { WorkflowDefinitionController } from './workflow-definition.controller';
import { WorkflowFormController }       from './workflow-form.controller';
import { WorkflowRuntimeController }    from './workflow-runtime.controller';
import { WorkflowTaskController }       from './workflow-task.controller';
import { WorkflowDatasourceController } from './workflow-datasource.controller';
import { WorkflowMetricsController }    from './workflow-metrics.controller';
import { WorkflowService }              from './workflow.service';
import { ConditionEngineService }       from './condition-engine.service';
import { WorkflowNotificationService }  from './workflow-notification.service';
import { AssignmentResolverService }    from './assignment-resolver.service';
import { WorkflowSlaService }           from './workflow-sla.service';
import { WorkflowSlaScheduler }         from './workflow-sla.scheduler';

@Module({
  controllers: [
    WorkflowDefinitionController,
    WorkflowFormController,
    WorkflowRuntimeController,
    WorkflowTaskController,
    WorkflowDatasourceController,
    WorkflowMetricsController,   // Phase F: Metrics API
  ],
  providers: [
    WorkflowService,
    ConditionEngineService,
    WorkflowNotificationService,
    AssignmentResolverService,
    WorkflowSlaService,          // Phase F: SLA 检测与催办
    WorkflowSlaScheduler,        // Phase F: 每 15 分钟调度
  ],
  exports: [
    WorkflowService,
    ConditionEngineService,
    WorkflowNotificationService,
    AssignmentResolverService,
    WorkflowSlaService,
  ],
})
export class WorkflowModule {}
