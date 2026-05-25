import { Injectable } from '@nestjs/common';
import { PRC2_PHASE, PRC2_TABLE_COUNT } from './constants/prc2.constants';

@Injectable()
export class ProcurementV2Service {
  health() {
    return {
      module: 'procurement-v2',
      status: 'ok',
      phase: String(PRC2_PHASE),
      tables: PRC2_TABLE_COUNT,
    };
  }
}
