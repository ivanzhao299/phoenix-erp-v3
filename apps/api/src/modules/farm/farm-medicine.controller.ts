import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { FarmMedicineService } from './farm-medicine.service';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';

// [Fix Pack 1 — HIGH-2] 替换 AuthGuard → MenuGuard，添加 RequireMenu
@Controller('api/farm/medicine')
@UseGuards(MenuGuard)
@RequireMenu('MENU_FARM_VET', 'V')
export class FarmMedicineController {
  constructor(private svc: FarmMedicineService) {}

  /** GET /api/farm/medicine/stock */
  @Get('stock')
  async getStock() {
    return { code: 200, data: await this.svc.getCatalog() };
  }

  /** GET /api/farm/medicine/ledger?start=&end= */
  @Get('ledger')
  async getLedger(@Query('start') start: string, @Query('end') end: string) {
    const today = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return { code: 200, data: await this.svc.getLedger(start || fmt(today), end || fmt(today)) };
  }

  /** POST /api/farm/medicine/inbound
   *  { date, items: [{medication_code, qty, note?}], operator? }
   */
  @Post('inbound')
  @RequireMenu('MENU_FARM_VET', 'E')
  async inbound(@Body() body: { date: string; items: Array<{ medication_code: string; qty: number; note?: string }>; operator?: string }) {
    await this.svc.inbound(body.date, body.items, body.operator ?? 'mobile');
    return { code: 200, message: '入库成功' };
  }

  /** POST /api/farm/medicine/outbound
   *  { date, items: [{medication_code, qty, house_code?, note?}], operator? }
   */
  @Post('outbound')
  @RequireMenu('MENU_FARM_VET', 'E')
  async outbound(@Body() body: { date: string; items: Array<{ medication_code: string; qty: number; house_code?: string; note?: string }>; operator?: string }) {
    await this.svc.outbound(body.date, body.items, body.operator ?? 'mobile');
    return { code: 200, message: '出库成功' };
  }
}
