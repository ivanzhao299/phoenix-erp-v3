import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { SalesEngineService } from './sales-engine.service';
import { SalesOrderEntity } from './entities/sales-order.entity';
import { AuthModule } from '../../auth/auth.module';
import { WmsModule } from '../wms/wms.module';

/**
 * Phase C: forwardRef removed — WmsModule no longer imports OrderModule,
 * so this is now a clean one-way dependency: OrderModule → WmsModule.
 * OrderService calls WmsService.advanceOutboundOrder() on APPROVED transition.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SalesOrderEntity]),
    AuthModule,
    WmsModule,
  ],
  controllers: [OrderController],
  providers: [OrderService, SalesEngineService],
  exports: [OrderService, SalesEngineService],
})
export class OrderModule {}
