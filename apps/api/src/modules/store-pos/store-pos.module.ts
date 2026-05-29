/**
 * Phoenix ERP V3 — Store POS Module
 * Sales V2 Phase 9: 直营店收银作业台
 *
 * Phase D: SalesEngineService 从 order/ 迁入本模块，
 * 供 StoreModule (旧 POS) 消费，同时切断 StoreModule → OrderModule 依赖。
 */
import { Module }               from '@nestjs/common';
import { StorePosController }   from './controllers/store-pos.controller';
import { StorePosService }      from './services/store-pos.service';
import { StorePosShiftService } from './services/store-pos-shift.service';
import { SalesEngineService }   from './services/sales-engine.service';

@Module({
  controllers: [StorePosController],
  providers:   [StorePosService, StorePosShiftService, SalesEngineService],
  exports:     [StorePosService, StorePosShiftService, SalesEngineService],
})
export class StorePosModule {}
