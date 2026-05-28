import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcurementService } from './procurement.service';
import { ProcurementController } from './procurement.controller';
import { PurchaseOrderEntity } from './entities/purchase-order.entity';
// [Phase 2C] ApprovalModule 已移除 — 旧审批链停用，ProcurementService.submitForApproval 直接拒绝请求

@Module({
  imports: [
    TypeOrmModule.forFeature([PurchaseOrderEntity]),
  ],
  controllers: [ProcurementController],
  providers: [ProcurementService],
  exports: [ProcurementService],
})
export class ProcurementModule {}
