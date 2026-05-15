import { Controller, Get, Post, Param, Query, UseGuards, Body } from '@nestjs/common';
import { MonDeviceService } from './mon-device.service';
import { IotSyncService } from './iot-sync.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('api/v3/iot/devices')
@UseGuards(AuthGuard('jwt'))
export class MonDeviceController {
  constructor(
    private readonly monDeviceService: MonDeviceService,
    private readonly iotSyncService: IotSyncService,
  ) {}

  @Get('all-summary')
  async getAllSummary() {
    return this.monDeviceService.getAllSummary();
  }

  @Get(':houseCode/overview')
  async getOverview(@Param('houseCode') houseCode: string) {
    return this.monDeviceService.getHouseOverviewV3(houseCode);
  }

  @Get(':houseCode/trends')
  async getTrends(
    @Param('houseCode') houseCode: string,
    @Query('properties') properties: string,
    @Query('range') range: string,
  ) {
    const props = properties ? properties.split(',') : [];
    return this.monDeviceService.getHouseTrendsV3(houseCode, props, range);
  }

  @Post('sync/realtime')
  async manualSync() {
    const result = await this.iotSyncService.syncAllRealtime();
    return { ok: true, success: result.successHouses, records: result.totalUpdated, error: result.error };
  }

  @Post('daily-report/generate')
  async generateDailyReport(@Body() body: { house_code: string; log_date: string }) {
    return this.monDeviceService.generateDailyReportFromIoT(body.house_code, body.log_date);
  }
}
