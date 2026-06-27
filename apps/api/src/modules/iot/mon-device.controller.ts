import { Controller, Get, Post, Param, Query, UseGuards, Body } from '@nestjs/common';
import { MonDeviceService } from './mon-device.service';
import { IotSyncService } from './iot-sync.service';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';

const DEVICE_MENU = 'MENU_DEVICE_MONITOR';

@Controller('api/v3/iot/devices')
@UseGuards(MenuGuard)
@RequireMenu(DEVICE_MENU, 'V')
export class MonDeviceController {
  constructor(
    private readonly monDeviceService: MonDeviceService,
    private readonly iotSyncService: IotSyncService,
  ) {}

  // P1-4 修:'all-summary' 与 'sync/realtime' 原与 IotV3Controller 同路由冲突(两个 @Controller('api/v3/iot/devices')
  //   都注册,IotV3 在 iot.module 后注册→实际由 IotV3 提供服务,本控制器的同名方法被静默影子化)。
  //   移除本处影子重复(行为不变:IotV3 继续提供 all-summary/sync-realtime),本控制器专注 per-house + admin 路由。
  //   getAllSummary 逻辑仍在 MonDeviceService,未删除,其它调用方不受影响。

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

  // P1-4:'sync/realtime' 同样移除(与 IotV3 冲突,IotV3 提供);见上方说明。

  // G16-3 debug: dump vendor /history 原始返回（查 vendor 真数据形状）
  @Post('history/dump')
  @RequireMenu(DEVICE_MENU, 'E')
  async dumpHistory(@Body() body: { houseCode: string; date?: string; propertyCodes?: string[] }) {
    const date = body.date || new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
    const codes = body.propertyCodes && body.propertyCodes.length
      ? body.propertyCodes
      : ['2001','2083','2002','2003','2488','2484'];
    return this.iotSyncService.dumpVendorHistory(body.houseCode, date, codes);
  }

  // G16-3：admin 一键回填全部鸡舍历史（vendor /history API 真数据）
  @Post('history/backfill')
  @RequireMenu(DEVICE_MENU, 'E')
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
  @RequireMenu(DEVICE_MENU, 'E')
  async generateDailyReport(@Body() body: { house_code: string; log_date: string; snapshot_hour?: number }) {
    return this.monDeviceService.generateDailyReportFromIoT(
      body.house_code, body.log_date,
      body.snapshot_hour != null ? { snapshotHour: body.snapshot_hour } : undefined,
    );
  }

  // G16：批量
  @Post('daily-report/batch-generate')
  @RequireMenu(DEVICE_MENU, 'E')
  async batchGenerate(@Body() body: { house_codes: string[]; log_date: string; snapshot_hour?: number }) {
    return this.monDeviceService.generateDailyReportBatchFromIoT(
      body.house_codes || [], body.log_date,
      body.snapshot_hour != null ? { snapshotHour: body.snapshot_hour } : undefined,
    );
  }
}
