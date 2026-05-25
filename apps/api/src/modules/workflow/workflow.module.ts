import { Module } from '@nestjs/common';
import { WorkflowDefinitionController } from './workflow-definition.controller';
import { WorkflowFormController } from './workflow-form.controller';
import { WorkflowRuntimeController } from './workflow-runtime.controller';
import { WorkflowTaskController } from './workflow-task.controller';
import { WorkflowDatasourceController } from './workflow-datasource.controller';
import { WorkflowService } from './workflow.service';
import { ConditionEngineService } from './condition-engine.service';
import { WorkflowNotificationService } from './workflow-notification.service';

@Module({
  controllers: [
    WorkflowDefinitionController,
    WorkflowFormController,
    WorkflowRuntimeController,
    WorkflowTaskController,
    WorkflowDatasourceController,
  ],
  providers: [WorkflowService, ConditionEngineService, WorkflowNotificationService],
  exports:   [WorkflowService, ConditionEngineService, WorkflowNotificationService],
})
export class WorkflowModule {}
