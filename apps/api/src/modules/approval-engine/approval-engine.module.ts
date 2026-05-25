import { Global, Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WfApprovalRuleEntity }         from './entities/wf-approval-rule.entity';
import { WfApprovalRuleStepEntity }     from './entities/wf-approval-rule-step.entity';
import { WfApprovalInstanceEntity }     from './entities/wf-approval-instance.entity';
import { WfApprovalInstanceStepEntity } from './entities/wf-approval-instance-step.entity';

import { ApprovalEngineService }      from './approval-engine.service';
import { ApprovalEngineController }   from './approval-engine.controller';
import { ApprovalRulesService }       from './approval-rules.service';
import { ApprovalRulesController }    from './approval-rules.controller';
import { WorkflowBizRegistryService } from './workflow-biz-registry.service';
import { WorkflowModule }             from '../workflow/workflow.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      WfApprovalRuleEntity,
      WfApprovalRuleStepEntity,
      WfApprovalInstanceEntity,
      WfApprovalInstanceStepEntity,
    ]),
    forwardRef(() => WorkflowModule),
  ],
  controllers: [ApprovalEngineController, ApprovalRulesController],
  providers:   [ApprovalEngineService, ApprovalRulesService, WorkflowBizRegistryService],
  exports:     [ApprovalEngineService, WorkflowBizRegistryService],
})
export class ApprovalEngineModule {}
