import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { SalesEngineService } from './sales-engine.service';
import { SalesOrderEntity } from './entities/sales-order.entity';
import { AuthModule } from '../../auth/auth.module';
import { WmsModule } from '../wms/wms.module';

/**
 * forwardRef(WmsModule) — wms.module.ts imports OrderModule，
 * 此处反向引用 WmsService 用 forwardRef 解循环依赖
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SalesOrderEntity]),
    AuthModule,
    forwardRef(() => WmsModule),
  ],
  controllers: [OrderController],
  providers: [OrderService, SalesEngineService],
  exports: [OrderService, SalesEngineService],
})
export class OrderModule {}
