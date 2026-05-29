/**
 * Phoenix ERP V3 — Store POS Module
 * Sales V2 Phase 9: 直营店收银作业台
 */
import { Module }               from '@nestjs/common';
import { StorePosController }   from './controllers/store-pos.controller';
import { StorePosService }      from './services/store-pos.service';
import { StorePosShiftService } from './services/store-pos-shift.service';

@Module({
  controllers: [StorePosController],
  providers:   [StorePosService, StorePosShiftService],
  exports:     [StorePosService, StorePosShiftService],
})
export class StorePosModule {}
