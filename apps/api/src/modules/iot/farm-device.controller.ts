import { Controller, Post, Get, Put, Delete, Body, Param, UseGuards, Query } from '@nestjs/common';
import { MonDeviceService } from './mon-device.service';
import { IotSyncService } from './iot-sync.service';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';

const DEVICE_MENU = 'MENU_DEVICE_MONITOR';
const ALERT_STATUSES = new Set(['OPEN', 'CONFIRMED', 'CLOSED']);

@Controller('api/farm-device')
@UseGuards(MenuGuard)
@RequireMenu(DEVICE_MENU, 'V')
export class FarmDeviceController {
  constructor(
    private readonly monDeviceService: MonDeviceService,
    private readonly iotSyncService: IotSyncService,
  ) {}

  @Post('sync/realtime')
  @RequireMenu(DEVICE_MENU, 'E')
  async syncRealtimeData(@Body('device_id') deviceId: string, @Body('data') _data: any) {
    return { code: 200, msg: `设备 ${deviceId} 数据同步已触发` };
  }

  @Get('snapshot-all')
  async getSnapshotAll() {
    return await this.monDeviceService.getAllSummary();
  }

  @Get('houses/:houseCode/snapshot')
  async getDeviceSnapshot(@Param('houseCode') houseCode: string) {
    return await this.monDeviceService.getHouseOverviewV3(houseCode);
  }

  // ─── 报警管理 ─────────────────────────────────────────────────────────────
  @Get('alerts/stats')
  async getAlertStats(@Query('days') days: string) {
    const d = parseInt(days || '7');
    try {
      const since = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
      const [totalRow, byType, byHouse] = await Promise.all([
        (this.monDeviceService as any).entityManager.query(`
          SELECT
            COUNT(*) FILTER (WHERE status='OPEN')      AS "totalOpen",
            COUNT(*) FILTER (WHERE status='CONFIRMED') AS "totalConfirmed",
            COUNT(*) FILTER (WHERE status='CLOSED')    AS "totalClosed",
            COUNT(*)                                   AS "total"
          FROM mon_device_alert_event
          WHERE created_at >= $1
        `, [since]),
        (this.monDeviceService as any).entityManager.query(`
          SELECT alert_type, COUNT(*) AS cnt
          FROM mon_device_alert_event WHERE created_at >= $1
          GROUP BY alert_type ORDER BY cnt DESC
        `, [since]),
        (this.monDeviceService as any).entityManager.query(`
          SELECT erp_house_code,
                 COUNT(*) AS total,
                 COUNT(*) FILTER (WHERE status='OPEN') AS open_cnt
          FROM mon_device_alert_event WHERE created_at >= $1
          GROUP BY erp_house_code ORDER BY total DESC LIMIT 5
        `, [since]),
      ]);
      return {
        ...totalRow[0],
        byType: byType.map((r: any) => ({ ...r, cnt: Number(r.cnt) })),
        byHouse: byHouse.map((r: any) => ({ ...r, total: Number(r.total), open_cnt: Number(r.open_cnt) })),
      };
    } catch { return null; }
  }

  @Get('alerts')
  async getAlerts(@Query('status') status: string, @Query('house_code') houseCode: string) {
    const conditions: string[] = [];
    const params: string[] = [];
    const normalizedStatus = String(status || '').trim().toUpperCase();
    if (normalizedStatus && normalizedStatus !== 'ALL' && ALERT_STATUSES.has(normalizedStatus)) {
      params.push(normalizedStatus);
      conditions.push(`status = $${params.length}`);
    }
    const normalizedHouseCode = String(houseCode || '').trim();
    if (normalizedHouseCode) {
      params.push(normalizedHouseCode);
      conditions.push(`erp_house_code = $${params.length}`);
    }
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    try {
      const rows = await (this.monDeviceService as any).entityManager.query(`
        SELECT * FROM mon_device_alert_event
        ${whereSql}
        ORDER BY created_at DESC LIMIT 100
      `, params);
      // 前端期望直接返回数组
      return Array.isArray(rows) ? rows : [];
    } catch { return []; }
  }

  @Get('alerts/stream')
  async getAlertStream() {
    // SSE 最小实现：返回当前未处理数，真实 SSE 需要 NestJS SSE 支持
    try {
      const r = await (this.monDeviceService as any).entityManager.query(
        `SELECT COUNT(*) AS cnt FROM mon_device_alert_event WHERE status='OPEN'`
      );
      return { openCount: Number(r[0]?.cnt || 0), newAlerts: [] };
    } catch { return { openCount: 0, newAlerts: [] }; }
  }

  @Post('alerts/:id/confirm')
  @RequireMenu(DEVICE_MENU, 'E')
  async confirmAlert(@Param('id') id: string) {
    try {
      await (this.monDeviceService as any).entityManager.query(
        `UPDATE mon_device_alert_event SET status='CONFIRMED', updated_at=NOW() WHERE id=$1`, [id]
      );
      return { ok: true };
    } catch { return { ok: false }; }
  }

  @Post('alerts/:id/close')
  @RequireMenu(DEVICE_MENU, 'E')
  async closeAlert(@Param('id') id: string, @Body() body: any) {
    try {
      await (this.monDeviceService as any).entityManager.query(
        `UPDATE mon_device_alert_event SET status='CLOSED', resolve_note=$1, resolved_at=NOW(), updated_at=NOW() WHERE id=$2`,
        [body.resolve_note || '', id]
      );
      return { ok: true };
    } catch { return { ok: false }; }
  }


  // ─── 运维中心 Ops Center ──────────────────────────────────────────────────
  @Get('auth/status')
  async getAuthStatus() {
    // 真实探测第三方网关鉴权（此前是硬编码桩，永远"已认证"，会误导排障）
    try {
      const p = await this.iotSyncService.probeVendorAuth();
      return { hasToken: Boolean(p.ok), appId: p.appId ?? '', remainMin: p.remainMin ?? 0, base: p.base ?? '', error: p.error ?? null };
    } catch (e: any) {
      return {
        hasToken: false,
        appId: '',
        remainMin: 0,
        base: '',
        error: e?.message ?? String(e),
      };
    }
  }

  @Get('mappings')
  async getMappings() {
    return await this.monDeviceService.getMappings();
  }

  @Get('vendor-houses')
  async getVendorHouses() {
    try {
      const houses = await this.iotSyncService.listVendorHouses();
      return Array.isArray(houses) ? houses : [];
    } catch { return []; }
  }

  @Get('property-dict')
  async getPropertyDict() {
    return await this.monDeviceService.getPropertyDict();
  }

  @Get('ops-log')
  async getOpsLog(@Query('limit') limit: number) {
    return await this.monDeviceService.getOpsLog(limit);
  }

  @Get('sync/jobs')
  async getSyncJobs() {
    return await this.monDeviceService.getSyncJobs();
  }

  @Get('devices/offline')
  async getOfflineDevices() {
    return await this.monDeviceService.getOfflineDevices();
  }

  @Post('mapping')
  @RequireMenu(DEVICE_MENU, 'E')
  async createMapping(@Body() body: any) {
    return await this.monDeviceService.createMapping(body);
  }

  @Post('sync/houses')
  @RequireMenu(DEVICE_MENU, 'E')
  async syncHouses() {
    const result = await this.iotSyncService.syncAllRealtime();
    return { ok: true, synced: result.successHouses || 0 };
  }

  @Put('property-dict/:id')
  @RequireMenu(DEVICE_MENU, 'E')
  async updatePropertyDict(@Param('id') id: string, @Body() body: any) {
    return await this.monDeviceService.updatePropertyDict(id, body);
  }

  @Get('mapping/:id/alert-config')
  async getMappingAlertConfig(@Param('id') id: string) {
    return await this.monDeviceService.getMappingAlertConfig(id);
  }

  @Put('mapping/:id')
  @RequireMenu(DEVICE_MENU, 'E')
  async updateMapping(@Param('id') id: string, @Body() body: any) {
    return await this.monDeviceService.updateMapping(id, body);
  }

  @Delete('mapping/:id')
  @RequireMenu(DEVICE_MENU, 'E')
  async deleteMapping(@Param('id') id: string) {
    return await this.monDeviceService.deleteMapping(id);
  }

  // ─── 历史时序数据 ─────────────────────────────────────────────────────────
  @Get('houses/:houseCode/history')
  async getHouseHistory(
    @Param('houseCode') houseCode: string,
    @Query('property_code') propertyCode: string,
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
    @Query('limit') limit: string,
  ) {
    try {
      const lim = Math.min(parseInt(limit || '500'), 2000);
      const rows = await (this.monDeviceService as any).entityManager.query(`
        SELECT erp_house_code, property_code, value, log_date,
               collect_time, created_at
        FROM mon_device_property_history
        WHERE erp_house_code = $1
          AND property_code  = $2
          AND log_date BETWEEN $3 AND $4
        ORDER BY log_date ASC, collect_time ASC
        LIMIT $5
      `, [houseCode, propertyCode, startDate || '2020-01-01', endDate || '2099-01-01', lim]);
      return rows;
    } catch (e: any) {
      console.error('[history]', e.message);
      return [];
    }
  }

  // ─── 日汇总数据 ───────────────────────────────────────────────────────────
  @Get('houses/:houseCode/daily-agg')
  async getHouseDailyAgg(
    @Param('houseCode') houseCode: string,
    @Query('property_code') propertyCode: string,
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
  ) {
    try {
      const rows = await (this.monDeviceService as any).entityManager.query(`
        SELECT agg_date, erp_house_code, property_code,
               avg_val, min_val, max_val, sample_count
        FROM mon_device_property_daily_agg
        WHERE erp_house_code = $1
          AND property_code  = $2
          AND agg_date BETWEEN $3 AND $4
        ORDER BY agg_date ASC
      `, [houseCode, propertyCode, startDate || '2020-01-01', endDate || '2099-01-01']);
      return rows;
    } catch (e: any) {
      console.error('[daily-agg]', e.message);
      return [];
    }
  }

  // ─── 历史补采（mock，真实实现需对接第三方IoT）─────────────────────────────
  @Post('sync/history')
  @RequireMenu(DEVICE_MENU, 'E')
  async syncHistory(@Body() body: any) {
    return { ok: true, records: 0, msg: '本地演示模式，无需补采' };
  }
}
