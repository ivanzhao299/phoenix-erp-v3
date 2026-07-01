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

      // collect_time 兼容 epoch ms / 时间戳字符串（与下方 dataFreshness 同口径）
      const toMs = (ct: any): number => (Number(ct) > 1e12 ? Number(ct) : new Date(ct).getTime());
      // "在线" = 有值且最近一次采集未陈旧；快照按 (house,property) upsert 永久保留，
      //   仅判 value != null 会把早已掉线的传感器仍计为在线 → 在线数/在线率虚高。
      const isOnline = (p: any): boolean => {
        if (p.value == null) return false;
        const ms = toMs(p.collect_time);
        return !isNaN(ms) && now - ms < STALE_MS;
      };

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

        // 在线率（最近有效采集的指标数 / 总指标数）—— 含陈旧过滤，避免掉线传感器虚计在线
        const onlineRate = hasData
          ? props.filter(isOnline).length / props.length
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
      const onlineSensor  = allProps.filter(isOnline).length;  // 仅计最近未陈旧的传感器
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
   * GET /api/v3/iot/devices/sync-health
   * 设备监控"为什么没有数据"自诊断：把链路各环节状态一次性返回，给出明确原因。
   * 只读、不依赖外部 API；判定顺序 = 真实失败优先级。
   */
  @Get('sync-health')
  async getSyncHealth() {
    try {
      const em = (this.monDeviceService as any).entityManager;

      const mappings = await em.query(`
        SELECT erp_house_code, house_name, vendor_house_id, status
        FROM mon_house_device_mapping ORDER BY erp_house_code
      `).catch(() => []);

      const snapAgg = await em.query(`
        SELECT erp_house_code, COUNT(*)::int AS cnt, MAX(collect_time) AS last_ct
        FROM mon_device_realtime_snapshot GROUP BY erp_house_code
      `).catch(() => []);
      const snapMap = new Map<string, { cnt: number; last_ct: any }>(
        snapAgg.map((r: any) => [r.erp_house_code, { cnt: Number(r.cnt), last_ct: r.last_ct }]),
      );

      const hbRows = await em.query(
        `SELECT job_name, last_status, last_success_at, last_failure_at, fail_count, last_detail, updated_at
         FROM sys_cron_heartbeat WHERE job_name = 'iot_sync' LIMIT 1`,
      ).catch(() => []);
      const heartbeat = hbRows[0] ?? null;

      const totalHouses    = mappings.length;
      const mappedActive   = mappings.filter((m: any) => m.vendor_house_id && m.status === 'ACTIVE').length;
      const housesWithData = mappings.filter((m: any) => (snapMap.get(m.erp_house_code)?.cnt ?? 0) > 0).length;
      const totalSnapshots = snapAgg.reduce((s: number, r: any) => s + Number(r.cnt), 0);
      const lastCollectMs  = snapAgg.reduce((mx: number, r: any) => {
        const v = r.last_ct == null ? 0 : (Number(r.last_ct) > 1e12 ? Number(r.last_ct) : new Date(r.last_ct).getTime());
        return isNaN(v) ? mx : Math.max(mx, v);
      }, 0);

      // 实时探测第三方网关鉴权（真连一次 znmc）——定位"生产是否连得上网关"
      const vendor = await this.iotSyncService.probeVendorAuth().catch((e: any) => ({ ok: false, appId: '', base: '', remainMin: null, error: e?.message || String(e) }));

      // 判定原因（优先级从根因到表象）
      let code = 'OK';
      let reason = '链路正常';
      if (totalHouses === 0) {
        code = 'NO_MAPPING'; reason = '未配置任何鸡舍设备映射，请到「设备运维中心」新建映射';
      } else if (mappedActive === 0) {
        code = 'NO_VENDOR_BINDING'; reason = '鸡舍已建但未绑定第三方设备（vendor_house_id 为空或映射未启用），请在「设备运维中心 → 栏舍映射」绑定并启用';
      } else if (!vendor.ok) {
        code = 'VENDOR_UNREACHABLE'; reason = `生产无法连接第三方 IoT 网关(${vendor.base || 'data.znmc.co'})：${(vendor.error || '未知错误').slice(0, 160)}。请放行生产出网到该网关(HTTP 80)或核实账号密钥`;
      } else if (heartbeat && heartbeat.last_status === 'FAILED') {
        code = 'SYNC_FAILED'; reason = `实时同步任务最近失败：${(heartbeat.last_detail || '').slice(0, 160)}`;
      } else if (totalSnapshots === 0) {
        code = 'NO_SNAPSHOT'; reason = '已绑定但实时同步暂无产出——多为第三方 IoT 凭据/网络问题或同步任务尚未运行，可在「设备运维中心」点「同步第三方栏舍」并检查 API 认证状态';
      } else if (lastCollectMs > 0 && Date.now() - lastCollectMs > 30 * 60 * 1000) {
        code = 'STALE'; reason = '有历史数据但已超过 30 分钟未更新，实时采集可能中断';
      }

      return {
        ok: true,
        data: {
          code,
          reason,
          vendor: { ok: vendor.ok, base: vendor.base, appId: vendor.appId, error: vendor.error ?? null },
          summary: { totalHouses, mappedActive, housesWithData, totalSnapshots, lastCollectAt: lastCollectMs || null },
          heartbeat,
          houses: mappings.map((m: any) => ({
            erpHouseCode: m.erp_house_code,
            houseName: m.house_name || m.erp_house_code,
            vendorHouseId: m.vendor_house_id || null,
            status: m.status,
            snapshotCount: snapMap.get(m.erp_house_code)?.cnt ?? 0,
          })),
        },
      };
    } catch (e: any) {
      return { ok: false, error: e?.message, data: null };
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
