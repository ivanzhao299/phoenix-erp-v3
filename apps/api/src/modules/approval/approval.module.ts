import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApprovalController } from './approval.controller';
import { ApprovalService } from './approval.service';
import { ApprovalRuleEntity } from './entities/approval-rule.entity';
import { ApprovalLogEntity } from './entities/approval-log.entity';
import { CurrencyService } from '../../common/services/currency.service';

@Module({
  imports: [TypeOrmModule.forFeature([ApprovalRuleEntity, ApprovalLogEntity])],
  controllers: [ApprovalController],
  providers: [ApprovalService, CurrencyService],
  exports: [ApprovalService],
})
export class ApprovalModule {}
