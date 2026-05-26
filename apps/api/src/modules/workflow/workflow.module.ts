import { Module, forwardRef } from '@nestjs/common';
import { WorkflowDefinitionController }  from './workflow-definition.controller';
import { WorkflowFormController }        from './workflow-form.controller';
import { WorkflowRuntimeController }     from './workflow-runtime.controller';
import { WorkflowTaskController }        from './workflow-task.controller';
import { WorkflowDatasourceController }  from './workflow-datasource.controller';
import { WorkflowMetricsController }     from './workflow-metrics.controller';
import { WorkflowService }               from './workflow.service';
import { ConditionEngineService }        from './condition-engine.service';
import { WorkflowNotificationService }   from './workflow-notification.service';
import { AssignmentResolverService }     from './assignment-resolver.service';
import { WorkflowSlaService }            from './workflow-sla.service';
import { WorkflowSlaScheduler }          from './workflow-sla.scheduler';
import { WorkflowFormValidationService } from './workflow-form-validation.service';  // Phase H
import { WorkflowFormRuntimeService }    from './workflow-form-runtime.service';     // Phase H

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
    WorkflowSlaService,              // Phase F: SLA 检测与催办
    WorkflowSlaScheduler,            // Phase F: 每 15 分钟调度
    WorkflowFormValidationService,   // Phase H: JSON Schema 校验
    WorkflowFormRuntimeService,      // Phase H: 表单版本管理 + 提交快照
  ],
  exports: [
    WorkflowService,
    ConditionEngineService,
    WorkflowNotificationService,
    AssignmentResolverService,
    WorkflowSlaService,
    WorkflowFormValidationService,
    WorkflowFormRuntimeService,
  ],
})
export class WorkflowModule {}
