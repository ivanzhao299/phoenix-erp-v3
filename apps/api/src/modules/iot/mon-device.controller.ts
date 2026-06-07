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
    @Query('codes') codes: string,        // 前端历史命名兼容
    @Query('range') range: string,
  ) {
    const raw = properties || codes || '';
    const props = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
    return this.monDeviceService.getHouseTrendsV3(houseCode, props, range);
  }

  @Post('sync/realtime')
  async manualSync() {
    const result = await this.iotSyncService.syncAllRealtime();
    return { ok: true, success: result.successHouses, records: result.totalUpdated, error: result.error };
  }

  // G16-3 debug: dump vendor /history 原始返回（查 vendor 真数据形状）
  @Post('history/dump')
  async dumpHistory(@Body() body: { houseCode: string; date?: string; propertyCodes?: string[] }) {
    const date = body.date || new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
    const codes = body.propertyCodes && body.propertyCodes.length
      ? body.propertyCodes
      : ['2001','2083','2002','2003','2488','2484'];
    return this.iotSyncService.dumpVendorHistory(body.houseCode, date, codes);
  }

  // G16-3：admin 一键回填全部鸡舍历史（vendor /history API 真数据）
  @Post('history/backfill')
  async backfillHistory(@Body() body: { days?: number; propertyCodes?: string[]; houseCode?: string }) {
    const days = Math.min(Math.max(Number(body.days) || 7, 1), 30);
    const codes = body.propertyCodes && body.propertyCodes.length
      ? body.propertyCodes
      : ['2001','2083','2002','2003','2488','2484','2532'];
    if (body.houseCode) {
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
      return this.iotSyncService.syncHistoryCatchUp(body.houseCode, start, end, codes);
    }
    return this.iotSyncService.backfillAllHistory(days, codes);
  }

  @Post('daily-report/generate')
  async generateDailyReport(@Body() body: { house_code: string; log_date: string; snapshot_hour?: number }) {
    return this.monDeviceService.generateDailyReportFromIoT(
      body.house_code, body.log_date,
      body.snapshot_hour != null ? { snapshotHour: body.snapshot_hour } : undefined,
    );
  }

  // G16：批量
  @Post('daily-report/batch-generate')
  async batchGenerate(@Body() body: { house_codes: string[]; log_date: string; snapshot_hour?: number }) {
    return this.monDeviceService.generateDailyReportBatchFromIoT(
      body.house_codes || [], body.log_date,
      body.snapshot_hour != null ? { snapshotHour: body.snapshot_hour } : undefined,
    );
  }
}
