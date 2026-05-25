import { Controller, Get } from '@nestjs/common';
import { ProcurementV2Service } from './procurement-v2.service';

@Controller('api/v2/procurement')
export class ProcurementV2Controller {
  constructor(private readonly svc: ProcurementV2Service) {}

  /** GET /api/v2/procurement/health */
  @Get('health')
  health() {
    return this.svc.health();
  }
}
