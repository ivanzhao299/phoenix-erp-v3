import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { StoreDailyCloseEntity } from './entities/store-daily-close.entity';
import { OrderModule } from '../order/order.module';

@Module({
  imports: [TypeOrmModule.forFeature([StoreDailyCloseEntity]), OrderModule],
  controllers: [StoreController, PosController],
  providers: [StoreService, PosService],
  exports: [StoreService, PosService],
})
export class StoreModule {}
