import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WfApprovalRuleEntity }         from './entities/wf-approval-rule.entity';
import { WfApprovalRuleStepEntity }     from './entities/wf-approval-rule-step.entity';
import { WfApprovalInstanceEntity }     from './entities/wf-approval-instance.entity';
import { WfApprovalInstanceStepEntity } from './entities/wf-approval-instance-step.entity';

import { ApprovalEngineService }    from './approval-engine.service';
import { ApprovalEngineController } from './approval-engine.controller';
import { ApprovalRulesService }     from './approval-rules.service';
import { ApprovalRulesController }  from './approval-rules.controller';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      WfApprovalRuleEntity,
      WfApprovalRuleStepEntity,
      WfApprovalInstanceEntity,
      WfApprovalInstanceStepEntity,
    ]),
  ],
  controllers: [ApprovalEngineController, ApprovalRulesController],
  providers:   [ApprovalEngineService, ApprovalRulesService],
  exports:     [ApprovalEngineService],
})
export class ApprovalEngineModule {}
