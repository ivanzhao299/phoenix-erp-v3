import { Controller, Get, Post, Body, Query, Param, Req, UseGuards } from '@nestjs/common';
import { FarmSalesService, CreateFarmSaleDto } from './farm-sales.service';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';

// [Fix Pack 1 — HIGH-2] 替换 AuthGuard → MenuGuard，添加 RequireMenu
// [Phase R1 — HIGH-3] 添加 DataScopeGuard
@Controller('api/farm/sales')
@UseGuards(MenuGuard, DataScopeGuard)
@RequireMenu('MENU_FARM_DATA', 'V')
export class FarmSalesController {
  constructor(private svc: FarmSalesService) {}

  /** GET /api/farm/sales/customers */
  @Get('customers')
  async getCustomers() {
    return { code: 200, data: await this.svc.getCustomers() };
  }

  /** GET /api/farm/sales?date=YYYY-MM-DD — G108-B：按 store_code 收口数据范围 */
  @Get()
  async getSales(@Query('date') date: string, @Req() req: any) {
    const today = new Date();
    const d = date || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    return { code: 200, data: await this.svc.getSales(d, req.user) };
  }

  /** POST /api/farm/sales */
  @Post()
  @RequireMenu('MENU_FARM_DATA', 'E')
  async createSale(@Body() dto: CreateFarmSaleDto) {
    const result = await this.svc.createSale(dto);
    return { code: 200, data: result };
  }

  /** POST /api/farm/sales/:orderNo/cancel */
  @Post(':orderNo/cancel')
  @RequireMenu('MENU_FARM_DATA', 'E')
  async cancelSale(
    @Param('orderNo') orderNo: string,
    @Body('operator') operator: string,
  ) {
    return { code: 200, data: await this.svc.cancelSale(orderNo, operator ?? 'mobile') };
  }
}
