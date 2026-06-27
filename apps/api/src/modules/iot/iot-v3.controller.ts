import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IotSyncService } from './iot-sync.service';
import { MonDeviceService } from './mon-device.service';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';

const DEVICE_MENU = 'MENU_DEVICE_MONITOR';

/**
 * /api/v3/iot/devices/* 路由
 * DeviceOverview.jsx 使用的聚合数据接口
 */
@Controller('api/v3/iot/devices')
@UseGuards(MenuGuard)
@RequireMenu(DEVICE_MENU, 'V')
export class IotV3Controller {
  constructor(
    private readonly iotSyncService: IotSyncService,
    private readonly monDeviceService: MonDeviceService,
  ) {}

  /**
   * GET /api/v3/iot/devices/all-summary
   * 汇总所有鸡舍的实时快照数据，供"设备监控总览"页面使用
   */
  @Get('all-summary')
  async getAllSummary() {
    try {
      const em = (this.monDeviceService as any).entityManager;

      // 1. 鸡舍映射列表
      const mappings = await em.query(`
        SELECT erp_house_code, house_name, vendor_house_id, status
        FROM mon_house_device_mapping
        ORDER BY erp_house_code
      `).catch(() => []);

      // 2. 实时快照（最近一条）
      const snapshots = await em.query(`
        SELECT erp_house_code, property_code, value, is_alarm, collect_time,
               name_zh, unit, system_category
        FROM mon_device_realtime_snapshot
      `).catch(() => []);

      // 3. 未处理告警数
      const alarmRows = await em.query(`
        SELECT erp_house_code, COUNT(*) as cnt
        FROM mon_device_alert_event
        WHERE status = 'OPEN'
        GROUP BY erp_house_code
      `).catch(() => []);
      const alarmMap = new Map(alarmRows.map((r: any) => [r.erp_house_code, Number(r.cnt)]));

      // 4. 最近告警列表（10条）
      const recentAlarms = await em.query(`
        SELECT id, erp_house_code, property_name AS name_zh, current_val, unit, triggered_at
        FROM mon_device_alert_event
        WHERE status = 'OPEN'
        ORDER BY created_at DESC LIMIT 10
      `).catch(() => []);

      // 按鸡舍聚合快照
      const snapshotMap = new Map<string, any[]>();
      for (const s of snapshots) {
        if (!snapshotMap.has(s.erp_house_code)) snapshotMap.set(s.erp_house_code, []);
        snapshotMap.get(s.erp_house_code)!.push(s);
      }

      const STALE_MS = 30 * 60 * 1000; // 30 分钟无数据视为陈旧
      const now = Date.now();

      const houses = mappings.map((m: any) => {
        const props = snapshotMap.get(m.erp_house_code) || [];
        const hasData = props.length > 0;
        const alarmCount = alarmMap.get(m.erp_house_code) || 0;

        const getVal = (code: string) => {
          const match = props.filter((p: any) => String(p.property_code) === code);
          if (!match.length) return null;
          const vals = match.map((p: any) => Number(p.value)).filter((v: number) => !isNaN(v));
          return vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null;
        };

        // 数据新鲜度
        let dataFreshness = 'no_data';
        if (hasData) {
          const latest = props.reduce((max: any, p: any) =>
            Number(p.collect_time) > Number(max.collect_time) ? p : max, props[0]);
          const latestMs = Number(latest.collect_time) > 1e12
            ? Number(latest.collect_time)
            : new Date(latest.collect_time).getTime();
          const age = now - latestMs;
          dataFreshness = age < 10 * 60 * 1000 ? 'normal' : age < STALE_MS ? 'delayed' : 'stale';
        }

        // 在线率（有值的指标数 / 总指标数）
        const onlineRate = hasData
          ? props.filter((p: any) => p.value != null).length / props.length
          : 0;

        // 5大系统健康点
        const systems = [
          { code: 'env',     name: '环境',  icon: '🌡', category: 'environment' },
          { code: 'control', name: '控制',  icon: '🎛', category: 'control' },
          { code: 'feed',    name: '饲喂',  icon: '🌾', category: 'feed' },
          { code: 'water',   name: '饮水',  icon: '💧', category: 'water' },
          { code: 'exec',    name: '执行',  icon: '⚙️', category: 'equipment' },
        ].map(sys => {
          const catProps = props.filter((p: any) => p.system_category === sys.category);
          const alarm = catProps.some((p: any) => p.is_alarm);
          const status = !catProps.length ? 'no_data' : alarm ? 'critical' : 'normal';
          return { ...sys, status, alarmCount: catProps.filter((p: any) => p.is_alarm).length };
        });

        return {
          houseCode: m.erp_house_code,
          houseName: m.house_name || m.erp_house_code,
          flockNo: null,
          hasData,
          dataFreshness,
          alarmCount,
          onlineRate,
          avgTemp:      getVal('2001'),
          avgHumidity:  getVal('2083'),
          co2:          getVal('2090'),
          ammonia:      getVal('2096'),
          feedToday:    null,
          waterToday:   null,
          systems,
        };
      });

      const totalAlarms   = houses.reduce((s: number, h: any) => s + h.alarmCount, 0);
      const alarmHouses   = houses.filter((h: any) => h.alarmCount > 0).length;
      const activeHouses  = houses.filter((h: any) => h.hasData).length;
      const allProps      = snapshots;
      const onlineSensor  = allProps.filter((p: any) => p.value != null).length;
      const totalSensor   = allProps.length;

      return {
        ok: true,
        data: {
          summary: {
            totalHouses:    houses.length,
            activeHouses,
            totalAlarms,
            alarmHouses,
            onlineSensorCnt: onlineSensor,
            totalSensorCnt:  totalSensor,
            onlineDeviceCnt: activeHouses,
            totalDeviceCnt:  houses.length,
          },
          houses,
          recentAlarms,
        },
      };
    } catch (e: any) {
      return { ok: false, error: e.message, data: null };
    }
  }

  /**
   * POST /api/v3/iot/devices/sync/realtime
   * 触发全场实时数据采集
   */
  @Post('sync/realtime')
  @RequireMenu(DEVICE_MENU, 'E')
  async syncRealtime() {
    try {
      const result = await this.iotSyncService.syncAllRealtime();
      return {
        ok: true,
        success: result.successHouses,
        records: result.totalUpdated,
        error: result.error,
      };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }
}
