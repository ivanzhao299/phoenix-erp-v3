import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FarmEggService } from './farm-egg.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('api/farm/egg')
@UseGuards(AuthGuard('jwt'))
export class FarmEggController {
  constructor(private svc: FarmEggService) {}

  /** GET /api/farm/egg/stock */
  @Get('stock')
  async getStock() {
    return { code: 200, data: await this.svc.getStock() };
  }

  /** GET /api/farm/egg/ledger?start=YYYY-MM-DD&end=YYYY-MM-DD */
  @Get('ledger')
  async getLedger(
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    const today = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const s = start || fmt(today);
    const e = end   || fmt(today);
    return { code: 200, data: await this.svc.getLedger(s, e) };
  }

  /** POST /api/farm/egg/inbound
   *  body: { date, items: [{grade, qty, house_code}], operator? }
   */
  @Post('inbound')
  @UseGuards(RolesGuard)
  @Roles('ROLE_ADMIN', 'ROLE_FARM_MGR', 'ROLE_WMS_MGR')
  async inbound(
    @Body() body: { date: string; items: Array<{ grade: string; qty: number; house_code: string }>; operator?: string },
  ) {
    await this.svc.inbound(body.date, body.items, body.operator ?? 'mobile');
    return { code: 200, message: '入库成功' };
  }

  /** POST /api/farm/egg/outbound
   *  body: { date, items: [{grade, qty, customer_no}], operator?, ref_no? }
   */
  @Post('outbound')
  @UseGuards(RolesGuard)
  @Roles('ROLE_ADMIN', 'ROLE_FARM_MGR', 'ROLE_WMS_MGR')
  async outbound(
    @Body() body: { date: string; items: Array<{ grade: string; qty: number; customer_no: string }>; operator?: string; ref_no?: string },
  ) {
    await this.svc.outbound(body.date, body.items, body.operator ?? 'mobile', body.ref_no);
    return { code: 200, message: '出库成功' };
  }

  /** POST /api/farm/egg/write-off
   *  body: { date, items: [{grade, qty, reason}], operator? }
   */
  @Post('write-off')
  @UseGuards(RolesGuard)
  @Roles('ROLE_ADMIN', 'ROLE_FARM_MGR', 'ROLE_WMS_MGR')
  async writeOff(
    @Body() body: { date: string; items: Array<{ grade: string; qty: number; reason: string }>; operator?: string },
  ) {
    await this.svc.writeOff(body.date, body.items, body.operator ?? 'mobile');
    return { code: 200, message: '报损成功' };
  }
}
