import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { StoreDailyCloseEntity } from './entities/store-daily-close.entity';
import { StorePosModule } from '../store-pos/store-pos.module';

// Phase D: OrderModule replaced by StorePosModule.
// PosService now gets SalesEngineService from StorePosModule (where it lives post-migration).
// StoreModule no longer depends on legacy OrderModule.
@Module({
  imports: [TypeOrmModule.forFeature([StoreDailyCloseEntity]), StorePosModule],
  controllers: [StoreController, PosController],
  providers: [StoreService, PosService],
  exports: [StoreService, PosService],
})
export class StoreModule {}
