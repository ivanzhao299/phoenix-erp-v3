import { Body, Controller, Get, Param, Post, UseGuards, Query } from '@nestjs/common';
import { MonDeviceService } from './mon-device.service';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';

const DEVICE_MENU = 'MENU_DEVICE_MONITOR';

@Controller('api/farm-device/cabins')
@UseGuards(MenuGuard)
@RequireMenu(DEVICE_MENU, 'V')
export class FarmCabinController {
  constructor(private readonly monDeviceService: MonDeviceService) {}

  @Get('all-summary')
  async getAllSummary() {
    return await this.monDeviceService.getAllSummary();
  }

  @Get(':houseCode/overview')
  async getHouseOverview(@Param('houseCode') houseCode: string) {
    return await this.monDeviceService.getHouseOverview(houseCode);
  }

  @Get(':houseCode/systems/summary')
  async getHouseSystemsSummary(@Param('houseCode') houseCode: string) {
    return await this.monDeviceService.getHouseSystemsSummary(houseCode);
  }

  @Get(':houseCode/systems/:systemCode/detail')
  async getHouseSystemDetail(
    @Param('houseCode') houseCode: string,
    @Param('systemCode') systemCode: string,
  ) {
    return await this.monDeviceService.getHouseSystemDetail(houseCode, systemCode);
  }

  @Get(':houseCode/trends')
  async getHouseTrends(
    @Param('houseCode') houseCode: string,
    @Query('codes') codes: string,
    @Query('range') range: string,
  ) {
    return await this.monDeviceService.getHouseTrendsLegacy(houseCode, codes, range);
  }

  @Get(':houseCode/alarms')
  async getHouseAlarms(
    @Param('houseCode') houseCode: string,
    @Query('status') status: string,
  ) {
    return await this.monDeviceService.getHouseAlarms(houseCode, status);
  }

  @Post('daily-report/generate')
  @RequireMenu(DEVICE_MENU, 'E')
  async generateDailyReport(@Body() body: { house_code: string; log_date: string; snapshot_hour?: number }) {
    return this.monDeviceService.generateDailyReportFromIoT(
      body.house_code,
      body.log_date,
      body.snapshot_hour != null ? { snapshotHour: body.snapshot_hour } : undefined,
    );
  }

  @Get(':houseCode/stream')
  async getHouseStream(@Param('houseCode') houseCode: string) {
    return { ok: false, error: '暂不支持直接调用底层摄像头接口' };
  }

  @Get(':cabinId/status')
  async getCabinStatus(@Param('cabinId') cabinId: string) {
    return { code: 200, data: { cabinId, status: 'ONLINE' } };
  }
}
