import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { MedicationRecordService } from './medication-record.service';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';

function operatorFrom(req: any): string {
  const user = req?.user ?? {};
  return String(user.username ?? user.name ?? user.realNameZh ?? user.userId ?? user.id ?? user.sub ?? 'unknown');
}

@Controller('api/farm')
@UseGuards(MenuGuard, DataScopeGuard)
@RequireMenu('MENU_FARM_VET', 'V')
export class MedicationRecordController {
  constructor(private readonly service: MedicationRecordService) {}

  @Get('medication-records')
  async list(@Query() query: { site_code?: string; farm_code?: string; status?: string }) {
    return { code: 200, data: await this.service.list(query) };
  }

  @Post('medication-records')
  @RequireMenu('MENU_FARM_VET', 'E')
  async create(@Body() body: any, @Req() req: any) {
    return { code: 201, data: await this.service.create(body, operatorFrom(req)) };
  }

  @Post('medication-records/:id/cancel')
  @RequireMenu('MENU_FARM_VET', 'E')
  async cancel(@Param('id') id: string, @Req() req: any) {
    return { code: 200, data: await this.service.cancel(Number(id), operatorFrom(req)) };
  }

  @Get('medication-records/withdrawals')
  async withdrawals(@Query() query: { site_code?: string; farm_code?: string }) {
    return { code: 200, data: await this.service.withdrawals(query) };
  }

  @Get('medicine/lots')
  async lots(
    @Query('medication_code') medicationCode: string,
    @Query('site_code') siteCode: string,
    @Query('company_code') companyCode: string,
    @Query('warehouse_code') warehouseCode?: string,
  ) {
    return { code: 200, data: await this.service.getLots(medicationCode, siteCode, companyCode, warehouseCode) };
  }
}
