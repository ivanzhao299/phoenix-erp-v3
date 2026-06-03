import { Module } from '@nestjs/common';
import { TraceabilityController } from './traceability.controller';
import { TraceabilityService } from './traceability.service';

/**
 * TraceabilityModule — 统一追溯 Runtime（R5）
 * 唯一追溯链：鸡舍→鸡群→生产→集蛋→分级→包装→库存→销售/POS→客户/门店→财务。
 * 纯只读聚合（DataSource 直查），不写任何业务表。
 */
@Module({
  controllers: [TraceabilityController],
  providers: [TraceabilityService],
  exports: [TraceabilityService],
})
export class TraceabilityModule {}
