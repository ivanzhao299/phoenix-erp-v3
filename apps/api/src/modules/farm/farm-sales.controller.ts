import { Controller, Get, Post, Body, Query, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FarmSalesService, CreateFarmSaleDto } from './farm-sales.service';

@Controller('api/farm/sales')
@UseGuards(AuthGuard('jwt'))
export class FarmSalesController {
  constructor(private svc: FarmSalesService) {}

  /** GET /api/farm/sales/customers */
  @Get('customers')
  async getCustomers() {
    return { code: 200, data: await this.svc.getCustomers() };
  }

  /** GET /api/farm/sales?date=YYYY-MM-DD */
  @Get()
  async getSales(@Query('date') date: string) {
    const today = new Date();
    const d = date || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    return { code: 200, data: await this.svc.getSales(d) };
  }

  /** POST /api/farm/sales */
  @Post()
  async createSale(@Body() dto: CreateFarmSaleDto) {
    const result = await this.svc.createSale(dto);
    return { code: 200, data: result };
  }

  /** POST /api/farm/sales/:orderNo/cancel */
  @Post(':orderNo/cancel')
  async cancelSale(
    @Param('orderNo') orderNo: string,
    @Body('operator') operator: string,
  ) {
    return { code: 200, data: await this.svc.cancelSale(orderNo, operator ?? 'mobile') };
  }
}
