import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { CashFlowEntity } from './entities/cash-flow.entity';
import { ApprovalModule } from '../approval/approval.module';

// OrgModule 是 @Global()，DataScopeHelper / DataScopeGuard 已通过全局导出自动可注入。
@Module({
  imports: [
    TypeOrmModule.forFeature([CashFlowEntity]),
    ApprovalModule,
  ],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
