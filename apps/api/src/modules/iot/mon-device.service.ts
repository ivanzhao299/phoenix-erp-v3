import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { IotSyncService } from './iot-sync.service';

@Injectable()
export class MonDeviceService {
  constructor(
    @InjectEntityManager() private readonly entityManager: EntityManager,
    private readonly iotSyncService: IotSyncService
  ) {}

  async getHouseOverviewV3(houseCode: string) {
    try {
      // 1. Pull realtime data from Xiaoju API directly
      const liveData = await this.iotSyncService.fetchRealtimeProxy(houseCode);
      if (liveData && liveData.length > 0) {
        // Upsert into local snapshot for caching and alert processing
        const toInsert = liveData.map(d => `('${d.erp_house_code}', '${d.property_code}', ${d.value}, ${d.collect_time})`).join(',');
        await this.entityManager.query(`
          INSERT INTO mon_device_realtime_snapshot (erp_house_code, property_code, value, collect_time)
          VALUES ${toInsert}
          ON CONFLICT (erp_house_code, property_code) 
          DO UPDATE SET value = EXCLUDED.value, collect_time = EXCLUDED.collect_time, updated_at = CURRENT_TIMESTAMP
        `);
      }

      // 2. Fetch the enriched data from local snapshot
      const data = await this.entityManager.query(
        `SELECT s.id, s.property_code, s.value, s.is_alarm, s.collect_time, s.updated_at,
                d.name_zh, d.unit, d.system_category, d.metric_type, d.threshold_high, d.threshold_low
         FROM mon_device_realtime_snapshot s
         LEFT JOIN mon_device_property_dict d ON d.property_code = s.property_code
         WHERE s.erp_house_code = $1`,
        [houseCode]
      );
      
      const alerts = await this.entityManager.query(
        `SELECT id, property_code, property_name, current_val, threshold_val, unit, triggered_at, status 
         FROM mon_device_alert_event 
         WHERE erp_house_code = $1 AND status = 'OPEN'`,
        [houseCode]
      );

      return {
        ok: true,
        data: {
          houseId: houseCode, // V3 terminology
          sensors: data,
          activeAlerts: alerts,
          totalSensors: data.length,
          alertCount: alerts.length
        }
      };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  async getHouseTrendsV3(houseCode: string, properties: string[], range: string = '7d') {
    try {
      if (!properties || properties.length === 0) return { ok: false, error: 'properties required' };

      const daysMap: any = { '24h': 1, '7d': 7, '30d': 30 };
      const days = daysMap[range] || 7;
      const today = new Date().toISOString().slice(0, 10);

      // Smart Date Cursor: Get maximum date from BOTH tables
      let aggRes = await this.entityManager.query(
        `SELECT MAX(agg_date) as m FROM mon_device_property_daily_agg WHERE erp_house_code = $1`, 
        [houseCode]
      );
      let histRes = await this.entityManager.query(
        `SELECT MAX(log_date) as m FROM mon_device_property_history WHERE erp_house_code = $1`, 
        [houseCode]
      );
      
      let maxAgg = aggRes[0]?.m;
      let maxHist = histRes[0]?.m;
      
      let sAgg = maxAgg ? (maxAgg instanceof Date ? maxAgg.toISOString().slice(0, 10) : String(maxAgg).slice(0, 10)) : '';
      let sHist = maxHist ? (maxHist instanceof Date ? maxHist.toISOString().slice(0, 10) : String(maxHist).slice(0, 10)) : '';
      
      let dStr = sAgg > sHist ? sAgg : sHist;
      
      let endDateStr = today;
      if (dStr && dStr < today) {
        endDateStr = dStr;
      }
      
      const endDateObj = new Date(endDateStr);
      const startDateStr = new Date(endDateObj.getTime() - days * 864e5).toISOString().slice(0, 10);

      const ph = properties.map((_, i) => '$' + (i + 4)).join(',');
      const queryHist = `
        SELECT 
          h.property_code, 
          ROUND(AVG(h.value), 2) as value, 
          (h.collect_time / 3600000) * 3600000 as collect_time, 
          MAX(h.log_date) as log_date,
          MAX(d.name_zh) as name_zh, 
          MAX(d.unit) as unit,
          MAX(d.threshold_high) as threshold_high,
          MAX(d.threshold_low) as threshold_low
        FROM mon_device_property_history h
        LEFT JOIN mon_device_property_dict d ON d.property_code = h.property_code
        WHERE h.erp_house_code = $1
          AND h.log_date BETWEEN $2 AND $3
          AND h.property_code IN (${ph})
        GROUP BY h.property_code, (h.collect_time / 3600000) * 3600000
        ORDER BY collect_time ASC
      `;
      
      let data = await this.entityManager.query(queryHist, [houseCode, startDateStr, endDateStr, ...properties]);
      let granularity = 'hourly';

      if (!data.length) {
        granularity = 'daily';
        const queryAgg = `
          SELECT 
            a.property_code, 
            a.avg_val as value, 
            a.agg_date as log_date, 
            a.agg_date as collect_time,
            d.name_zh, 
            d.unit,
            d.threshold_high,
            d.threshold_low
          FROM mon_device_property_daily_agg a
          LEFT JOIN mon_device_property_dict d ON d.property_code = a.property_code
          WHERE a.erp_house_code = $1
            AND a.agg_date BETWEEN $2 AND $3
            AND a.property_code IN (${ph})
          ORDER BY a.agg_date ASC
        `;
        data = await this.entityManager.query(queryAgg, [houseCode, startDateStr, endDateStr, ...properties]);
      }

      // Group flat rows by property_code into the { propertyCode, name, unit, points[] } shape
      // that the frontend MetricCard / MiniChart pipeline expects.
      const grouped: Record<string, any[]> = {};
      for (const row of data as any[]) {
        const code: string = row.property_code;
        if (!grouped[code]) grouped[code] = [];
        grouped[code].push(row);
      }
      const series = Object.entries(grouped).map(([code, rows]) => ({
        propertyCode: code,
        name:         rows[0]?.name_zh   || code,
        unit:         rows[0]?.unit      || '',
        thresholdHigh:rows[0]?.threshold_high ?? null,
        thresholdLow: rows[0]?.threshold_low  ?? null,
        points: rows.map((r: any) => ({
          value:       r.value,
          collectTime: r.collect_time,
          logDate:     r.log_date,
        })),
      }));

      return { ok: true, data: { range, startDate: startDateStr, endDate: endDateStr, granularity, series } };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  async generateDailyReportFromIoT(houseCode: string, logDate: string) {
    try {
      if (!houseCode || !logDate) return { ok: false, error: 'missing parameters' };

      // 1. 先尝试查询当天是否已经有了日终聚合数据
      const aggs = await this.entityManager.query(
        `SELECT property_code, avg_val, max_val FROM mon_device_property_daily_agg 
         WHERE erp_house_code = $1 AND agg_date = $2`,
        [houseCode, logDate]
      );

      let temp, hum, feed, water;

      if (aggs.length > 0) {
        temp = aggs.find((a:any) => a.property_code === '2001')?.avg_val;
        hum  = aggs.find((a:any) => a.property_code === '2083')?.avg_val;
        feed = aggs.find((a:any) => a.property_code === '2488')?.max_val; // 今日累加值
        water= aggs.find((a:any) => a.property_code === '2484')?.max_val;
      }

      // 2. 如果聚合表没有数据（比如今天是当前天），回退查询实时快照和历史表
      if (!temp && !feed) {
        const today = new Date().toISOString().slice(0, 10);
        if (logDate === today) {
          // 如果是今天，直接从最新快照里拿当天的累加值和当前温湿度作为参考
          const snaps = await this.entityManager.query(
            `SELECT property_code, value FROM mon_device_realtime_snapshot WHERE erp_house_code = $1`,
            [houseCode]
          );
          temp = snaps.find((s:any) => s.property_code === '2001')?.value;
          hum  = snaps.find((s:any) => s.property_code === '2083')?.value;
          feed = snaps.find((s:any) => s.property_code === '2488')?.value;
          water= snaps.find((s:any) => s.property_code === '2484')?.value;
        } else {
          // 如果是过去的历史天数，查询 history 表计算
          const hists = await this.entityManager.query(
            `SELECT property_code, AVG(value) as avg_v, MAX(value) as max_v 
             FROM mon_device_property_history 
             WHERE erp_house_code = $1 AND log_date = $2 
             GROUP BY property_code`,
            [houseCode, logDate]
          );
          temp = hists.find((s:any) => s.property_code === '2001')?.avg_v;
          hum  = hists.find((s:any) => s.property_code === '2083')?.avg_v;
          feed = hists.find((s:any) => s.property_code === '2488')?.max_v;
          water= hists.find((s:any) => s.property_code === '2484')?.max_v;
        }
      }

      const result = {
        ok: true,
        avgTemp: temp ? Number(temp).toFixed(2) : null,
        avgHum: hum ? Number(hum).toFixed(2) : null,
        feedKg: feed ? Number(feed).toFixed(2) : null,
        waterL: water ? Number(water * 1000).toFixed(2) : null, // 假设数据库存的是吨(T)，转升(L)
        message: '已从物联设备提取汇总数据'
      };

      return result;
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 以下方法从 IotV2CompatService 迁移而来（V3 统一 IoT 服务）
  // ═══════════════════════════════════════════════════════════════════════════

  private readonly SYSTEMS = [
    { code: 'environment', name: '环境监测', color: '#06b6d4', icon: '🌡' },
    { code: 'control',     name: '环境控制', color: '#6366f1', icon: '🎛' },
    { code: 'feed',        name: '饲喂系统', color: '#f59e0b', icon: '🌾' },
    { code: 'water',       name: '饮水系统', color: '#3b82f6', icon: '💧' },
    { code: 'actuator',    name: '执行设备', color: '#10b981', icon: '⚙️' },
  ];

  private readonly SNAPSHOT_SQL = `
    SELECT s.property_code, s.value, s.is_alarm, s.collect_time, s.updated_at,
           COALESCE(d.name_zh, s.property_code)        AS name_zh,
           COALESCE(d.unit,    '')                     AS unit,
           COALESCE(d.system_category, 'other')        AS system_category,
           COALESCE(d.metric_type,    'continuous')    AS metric_type,
           COALESCE(d.display_level,  4)               AS display_level,
           COALESCE(d.ui_component_type, 'matrix')     AS ui_component_type,
           d.threshold_high, d.threshold_low
      FROM mon_device_realtime_snapshot s
      LEFT JOIN mon_device_property_dict d ON d.property_code = s.property_code
     WHERE s.erp_house_code = $1
  `;

  private fmtTime(ts: any) {
    if (!ts) return null;
    const n = Number(ts);
    return n > 1e12 ? new Date(n).toISOString().replace('T', ' ').slice(0, 19) : (ts || null);
  }

  private alarmStatus(isAlarm: number, threshH: number, threshL: number, value: number, code: string) {
    if (isAlarm === 1) return 'critical';
    if (value == null) return 'normal';
    const WARN: any = {
      '2090': { hi: (h: number) => h - h * 0.10, lo: null },
      '2096': { hi: (h: number) => h - h * 0.10, lo: null },
      '2001': { hi: (h: number) => h - 2,         lo: (l: number) => l + 2 },
      '2083': { hi: (h: number) => h - 5,         lo: (l: number) => l + 5 },
    };
    const rule = WARN[String(code)];
    if (threshH != null) {
      const warnAt = rule?.hi ? rule.hi(threshH) : threshH * 0.95;
      if (value >= threshH) return 'critical';
      if (value >= warnAt)  return 'warning';
    }
    if (threshL != null && value > 0) {
      const warnAt = rule?.lo ? rule.lo(threshL) : threshL * 1.05;
      if (value <= threshL) return 'critical';
      if (value <= warnAt)  return 'warning';
    }
    return 'normal';
  }

  private dataFreshness(latestTs: any) {
    if (!latestTs) return 'no_data';
    const ms = Date.now() - Number(latestTs);
    if (ms < 10 * 60_000)  return 'normal';
    if (ms < 30 * 60_000)  return 'delayed';
    return 'stale';
  }

  /** 全场综合汇总 (All-Houses Summary) */
  async getAllSummary() {
    try {
      // 在线判断：以 DB 写入时间（updated_at）为准，60 分钟内有写入即算在线
      const isOnline = (r: any) => r.value != null && (Date.now() - new Date(r.updated_at || r.collect_time).getTime()) < 60 * 60_000;
      const houses = await this.entityManager.query(`
        SELECT m.erp_house_code, m.erp_farm_code, m.status AS map_status,
               h.house_name, COALESCE(h.capacity, 50000) AS capacity, h.status AS house_status
          FROM mon_house_device_mapping m
          LEFT JOIN brd_houses h ON h.house_code = m.erp_house_code
         ORDER BY m.erp_house_code
      `);


      let snapshots = [];
      snapshots = await this.entityManager.query(`
        SELECT s.erp_house_code, s.property_code, s.value, s.is_alarm,
               s.collect_time, s.updated_at,
               COALESCE(d.system_category, 'other') AS system_category,
               COALESCE(d.metric_type, 'continuous') AS metric_type,
               COALESCE(d.display_level, 4)           AS display_level,
               d.threshold_high, d.threshold_low
          FROM mon_device_realtime_snapshot s
          LEFT JOIN mon_device_property_dict d ON d.property_code = s.property_code
      `).catch(() => []);

      const recentAlarms = await this.entityManager.query(`
        SELECT a.id, a.erp_house_code, a.property_code,
               COALESCE(d.name_zh, a.property_name, a.property_code) AS name_zh,
               COALESCE(d.system_category, 'other') AS system_category,
               a.current_val, a.unit, a.triggered_at, a.status
          FROM mon_device_alert_event a
          LEFT JOIN mon_device_property_dict d ON d.property_code = a.property_code
         WHERE a.status = 'OPEN'
         ORDER BY a.triggered_at DESC LIMIT 10
      `).catch(() => []);

      const allOpenAlerts = await this.entityManager.query(
        `SELECT erp_house_code, property_code FROM mon_device_alert_event WHERE status='OPEN'`,
      ).catch(() => []);
      const openAlertsByHouse: any = {};
      for (const a of allOpenAlerts) {
        if (!openAlertsByHouse[a.erp_house_code]) openAlertsByHouse[a.erp_house_code] = new Set();
        openAlertsByHouse[a.erp_house_code].add(String(a.property_code));
      }

      const snapByHouse: any = {};
      for (const s of snapshots) {
        (snapByHouse[s.erp_house_code] = snapByHouse[s.erp_house_code] || []).push(s);
      }
      const getVal = (rows: any[], code: string) => {
        const r = rows.find(r => r.property_code === code);
        return r ? Number(r.value) : null;
      };

      const houseCards = houses.map((h: any) => {
        const rows = snapByHouse[h.erp_house_code] || [];
        if (!rows.length) return {
          houseCode: h.erp_house_code, houseName: h.house_name || h.erp_house_code,
          farmCode: h.erp_farm_code, capacity: h.capacity || 0, currentBirds: 0,
          hasData: false, dataFreshness: 'no_data',
          alarmCount: 0, totalSensors: 0, onlineSensors: 0, onlineRate: 0, systems: [], kpis: [],
        };
        const now = Date.now();
        const tsOf    = (r: any) => new Date(r.updated_at || r.collect_time).getTime() || 0;
        // latestTs 用 updated_at（DB 写入时间），避免 collect_time 字符串解析成 NaN
        const latestTs  = Math.max(...rows.map(tsOf));
        const freshMs   = now - latestTs;
        const freshness = freshMs < 600_000 ? 'normal' : freshMs < 1_800_000 ? 'delayed' : 'stale';
        const houseAlerts = openAlertsByHouse[h.erp_house_code] || new Set();
        const alarmCount = rows.filter((r: any) => r.is_alarm === 1 || houseAlerts.has(String(r.property_code))).length;
        const onlineCnt  = rows.filter(isOnline).length;
        // totalSensors：最近 30 分钟有更新的行 = 最近一次同步批次；无近期数据则 fallback 全量
        const recentRows     = rows.filter((r: any) => (now - tsOf(r)) < 30 * 60_000);
        const effectiveTotal = recentRows.length || rows.length;
        const systems = this.SYSTEMS.map(sys => {
          const sRows   = rows.filter((r: any) => r.system_category === sys.code);
          const sAlarms = sRows.filter((r: any) => r.is_alarm === 1 || houseAlerts.has(String(r.property_code))).length;
          const sOnline = sRows.length ? +(sRows.filter(isOnline).length / sRows.length).toFixed(2) : 0;
          const sStatus = sRows.filter((r: any) => r.metric_type === 'status');
          const standby = sStatus.length > 0 && sStatus.filter((r: any) => Number(r.value) > 0).length === 0;
          const status  = !sRows.length ? 'no_data' : sAlarms > 0 ? 'critical' : sOnline < 0.5 ? 'warning' : standby ? 'standby' : 'normal';
          return { ...sys, status, alarmCount: sAlarms, sensorCount: sRows.length };
        });
        const kpis = rows.filter((r: any) => r.display_level === 1 && r.value != null)
          .map((r: any) => ({ code: r.property_code, value: Number(r.value), system: r.system_category }));
        return {
          houseCode: h.erp_house_code, houseName: h.house_name || h.erp_house_code,
          farmCode: h.erp_farm_code, capacity: h.capacity || 0, currentBirds: 0,
          hasData: true, dataFreshness: freshness,
          lastUpdateTime: new Date(latestTs).toISOString().replace('T', ' ').slice(0, 19),
          alarmCount, totalSensors: effectiveTotal, onlineSensors: onlineCnt,
          onlineRate: effectiveTotal > 0 ? +(onlineCnt / effectiveTotal).toFixed(2) : 0,
          systems, kpis,
          avgTemp: getVal(rows, '2001'), avgHumidity: getVal(rows, '2083'),
          co2: getVal(rows, '2090'), ammonia: getVal(rows, '2096'),
          feedToday: getVal(rows, '2488') ?? getVal(rows, '2532'),
          waterToday: getVal(rows, '2484'),
        };
      });

      const summary = {
        totalHouses:     houses.length,
        activeHouses:    houseCards.filter((h: any) => h.hasData).length,
        alarmHouses:     houseCards.filter((h: any) => h.alarmCount > 0).length,
        totalAlarms:     houseCards.reduce((s: number, h: any) => s + h.alarmCount, 0),
        totalSensorCnt:  houseCards.reduce((s: number, h: any) => s + (h.totalSensors || 0), 0),
        onlineSensorCnt: houseCards.reduce((s: number, h: any) => s + (h.onlineSensors || 0), 0),
        totalDeviceCnt:  houses.length,
        onlineDeviceCnt: houseCards.filter((h: any) => h.hasData).length,
      };
      return { ok: true, data: { summary, houses: houseCards, recentAlarms } };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  /** 单栋鸡舍 Overview */
  async getHouseOverview(houseCode: string) {
    try {
      const rows = await this.entityManager.query(this.SNAPSHOT_SQL, [houseCode]);
      if (!rows.length) return { ok: true, data: null, empty: true };
      const now = Date.now();
      // 以 DB 写入时间（updated_at）判断在线：60 分钟内有写入即算在线
      const tsOf     = (r: any) => new Date(r.updated_at || r.collect_time).getTime() || 0;
      const isOnline = (r: any) => r.value != null && (now - tsOf(r)) < 60 * 60_000;
      // latestTs 用 updated_at 避免 collect_time 日期字符串解析成 NaN
      const latestTs = Math.max(...rows.map(tsOf));
      // totalSensors：最近 30 分钟有更新的行 = 最近一次同步批次；无近期数据则 fallback 全量
      const recentRows     = rows.filter((r: any) => (now - tsOf(r)) < 30 * 60_000);
      const effectiveTotal = recentRows.length || rows.length;
      const alarmCount = rows.filter((r: any) => r.is_alarm === 1).length;
      const onlineCnt  = rows.filter(isOnline).length;
      const header = {
        houseCode, lastUpdateTime: this.fmtTime(latestTs), alarmCount,
        totalSensors: effectiveTotal, onlineSensors: onlineCnt,
        sensorOnlineRate: effectiveTotal > 0 ? +(onlineCnt / effectiveTotal).toFixed(2) : 0,
        dataFreshness: this.dataFreshness(latestTs),
      };
      const kpis = rows
        .filter((r: any) => r.display_level === 1 && r.value != null)
        .map((r: any) => {
          const v = Number(r.value);
          return { code: r.property_code, title: r.name_zh, value: v, unit: r.unit,
            status: this.alarmStatus(r.is_alarm, r.threshold_high, r.threshold_low, v, r.property_code),
            system: r.system_category, lastUpdateTime: this.fmtTime(tsOf(r)) };
        });
      return { ok: true, data: { header, kpis } };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }

  /** 系统分组摘要 */
  async getHouseSystemsSummary(houseCode: string) {
    try {
      const rows = await this.entityManager.query(this.SNAPSHOT_SQL, [houseCode]);
      const openAlerts = await this.entityManager.query(
        `SELECT property_code FROM mon_device_alert_event WHERE erp_house_code=$1 AND status='OPEN'`, [houseCode],
      ).catch(() => []);
      const openCodes = new Set(openAlerts.map((a: any) => String(a.property_code)));
      const isOnline  = (r: any) => r.value != null && (Date.now() - new Date(r.updated_at || r.collect_time).getTime()) < 60 * 60_000;
      const systems   = this.SYSTEMS.map(sys => {
        const sRows = rows.filter((r: any) => r.system_category === sys.code);
        if (!sRows.length) return { ...sys, status: 'no_data', alarmCount: 0, onlineRate: 0, summaryMetrics: [], sensorCount: 0, deviceCount: 0 };
        const alarmCnt  = sRows.filter((r: any) => r.is_alarm === 1 || openCodes.has(String(r.property_code))).length;
        const onlineRate = sRows.length ? +(sRows.filter(isOnline).length / sRows.length).toFixed(2) : 0;
        const statSRows  = sRows.filter((r: any) => r.metric_type === 'status');
        const standby    = statSRows.length > 0 && statSRows.filter((r: any) => Number(r.value) > 0).length === 0;
        const sysStatus  = alarmCnt > 0 ? 'critical' : onlineRate < 0.5 ? 'warning' : standby ? 'standby' : 'normal';
        const summaryMetrics = sRows
          .filter((r: any) => r.display_level <= 2 && r.value != null).slice(0, 4)
          .map((r: any) => ({ label: r.name_zh, value: Number(r.value), unit: r.unit,
            status: this.alarmStatus(r.is_alarm, r.threshold_high, r.threshold_low, Number(r.value), r.property_code) }));
        return { ...sys, status: sysStatus, alarmCount: alarmCnt, onlineRate, summaryMetrics,
          sensorCount: sRows.filter((r: any) => r.metric_type === 'continuous').length,
          deviceCount: statSRows.length };
      });
      return { ok: true, data: { systems } };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }

  /** 单系统详情 */
  async getHouseSystemDetail(houseCode: string, systemCode: string) {
    try {
      const sysMeta = this.SYSTEMS.find(s => s.code === systemCode) || { code: systemCode, name: systemCode, color: '#6b7280', icon: '📊' };
      const allRows = await this.entityManager.query(this.SNAPSHOT_SQL, [houseCode]);
      const rows    = allRows.filter((r: any) => r.system_category === systemCode)
                             .sort((a: any, b: any) => a.display_level - b.display_level);
      const isOnline   = (r: any) => r.value != null && (Date.now() - new Date(r.updated_at || r.collect_time).getTime()) < 60 * 60_000;
      const alarmCnt   = rows.filter((r: any) => r.is_alarm === 1).length;
      const onlineRate = rows.length ? +(rows.filter(isOnline).length / rows.length).toFixed(2) : 0;
      const summary    = { ...sysMeta, status: alarmCnt > 0 ? 'critical' : onlineRate < 0.5 ? 'warning' : 'normal', alarmCount: alarmCnt, sensorCount: rows.length, onlineRate };
      const groupMap: any = {};
      for (const r of rows) {
        const t = r.ui_component_type || 'matrix';
        (groupMap[t] = groupMap[t] || []).push({
          code: r.property_code, name: r.name_zh, value: r.value != null ? Number(r.value) : null,
          unit: r.unit, status: this.alarmStatus(r.is_alarm, r.threshold_high, r.threshold_low, r.value != null ? Number(r.value) : 0, r.property_code),
          metricType: r.metric_type, thresholdHigh: r.threshold_high, thresholdLow: r.threshold_low,
          lastUpdateTime: this.fmtTime(r.collect_time),
        });
      }
      return { ok: true, data: { summary, groups: Object.entries(groupMap).map(([componentType, items]) => ({ componentType, items })) } };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }

  /** 历史趋势（旧版接口，用 codes 字符串传参）*/
  async getHouseTrendsLegacy(houseCode: string, codes: string, range = '7d') {
    const codeList = (codes || '').split(',').map(c => c.trim()).filter(Boolean).slice(0, 8);
    if (!codeList.length) return { ok: false, error: '请指定 codes 参数' };
    return this.getHouseTrendsV3(houseCode, codeList, range);
  }

  /** 报警列表 */
  async getHouseAlarms(houseCode: string, status = 'open') {
    try {
      const q = status !== 'all' ? `AND a.status = '${status === 'open' ? 'OPEN' : status.toUpperCase()}'` : '';
      const rows = await this.entityManager.query(`
        SELECT a.id, a.property_code, a.current_val, a.threshold_val,
               a.triggered_at, a.status, a.confirmed_by,
               COALESCE(d.name_zh, a.property_name, a.property_code) AS name_zh,
               COALESCE(d.unit, a.unit, '') AS unit,
               COALESCE(d.system_category, 'other') AS system_category,
               d.threshold_high, d.threshold_low
          FROM mon_device_alert_event a
          LEFT JOIN mon_device_property_dict d ON d.property_code = a.property_code
         WHERE a.erp_house_code = $1 ${q}
         ORDER BY a.triggered_at DESC LIMIT 100
      `, [houseCode]);
      const sysMeta = Object.fromEntries(this.SYSTEMS.map(s => [s.code, s]));
      const items = rows.map((r: any) => {
        const sys = sysMeta[r.system_category] || { name: '其他', color: '#6b7280' };
        const triggeredMs = Number(r.triggered_at) > 1e12 ? Number(r.triggered_at) : new Date(r.triggered_at).getTime();
        return { id: r.id, systemCode: r.system_category, systemName: (sys as any).name, alarmName: r.name_zh,
          propertyCode: r.property_code, currentValue: r.current_val != null ? Number(r.current_val) : null,
          threshold: r.threshold_val ?? r.threshold_high ?? r.threshold_low, unit: r.unit,
          level: 'critical', status: r.status, durationMinutes: Math.floor((Date.now() - triggeredMs) / 60_000),
          triggeredAt: this.fmtTime(r.triggered_at) };
      });
      return { ok: true, data: { items, total: items.length } };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }

  // ─── 运维管理接口 ──────────────────────────────────────────────────────────
  async getMappings() {
    try {
      // 先确保 mapped_at 列存在
      await this.entityManager.query(`
        ALTER TABLE mon_house_device_mapping ADD COLUMN IF NOT EXISTS mapped_at TIMESTAMP DEFAULT NOW()
      `).catch(() => {});
      return await this.entityManager.query(
        `SELECT * FROM mon_house_device_mapping ORDER BY id DESC`
      );
    } catch (e: any) {
      console.error('[getMappings] DB error:', e.message);
      return [];
    }
  }
  async getVendorHouses() {
    try { return await this.entityManager.query(`SELECT * FROM mon_vendor_house_cache`); } catch { return []; }
  }
  async getPropertyDict() {
    try { return await this.entityManager.query(`SELECT * FROM mon_device_property_dict ORDER BY id ASC`); } catch { return []; }
  }
  async getOpsLog(limit = 100) {
    try { return await this.entityManager.query(`SELECT * FROM mon_device_ops_log ORDER BY created_at DESC LIMIT $1`, [limit]); } catch { return []; }
  }
  async getSyncJobs() {
    try { return await this.entityManager.query(`SELECT * FROM mon_device_sync_job_log ORDER BY started_at DESC LIMIT 50`); } catch { return []; }
  }
  async getOfflineDevices() {
    try { return await this.entityManager.query(`SELECT * FROM mon_device_info WHERE status = 'OFFLINE'`); } catch { return []; }
  }
  async createMapping(body: any) {
    const { erp_farm_code, erp_house_code, vendor_farm_id, vendor_house_id } = body;
    try {
      await this.entityManager.query(
        `INSERT INTO mon_house_device_mapping (erp_farm_code, erp_house_code, vendor_farm_id, vendor_house_id, mapped_by, status, mapped_at)
         VALUES ($1,$2,$3,$4,'Admin','ACTIVE',CURRENT_TIMESTAMP)`,
        [erp_farm_code, erp_house_code, vendor_farm_id, vendor_house_id],
      );
      return { ok: true, message: '映射已创建' };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }
  async updatePropertyDict(id: string, body: any) {
    const { threshold_high, threshold_low, alarm_enabled, trend_enabled, alert_min_duration_cycles, alert_volatility_pct } = body;
    try {
      await this.entityManager.query(
        `UPDATE mon_device_property_dict SET threshold_high=$1,threshold_low=$2,alarm_enabled=$3,trend_enabled=$4,alert_min_duration_cycles=$5,alert_volatility_pct=$6 WHERE id=$7`,
        [threshold_high, threshold_low, alarm_enabled, trend_enabled, alert_min_duration_cycles, alert_volatility_pct, id],
      );
      return { ok: true, message: '属性字典已更新' };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }
  async updateMapping(id: string, body: any) {
    const { erp_farm_code, erp_house_code, vendor_farm_id, vendor_house_id, sync_freq_min, status, alert_config } = body;
    const alertConfigJson = alert_config ? JSON.stringify(alert_config) : null;
    try {
      await this.entityManager.query(
        `UPDATE mon_house_device_mapping SET erp_farm_code=$1,erp_house_code=$2,vendor_farm_id=$3,vendor_house_id=$4,sync_freq_min=$5,status=$6,alert_config_json=$7 WHERE id=$8`,
        [erp_farm_code, erp_house_code, vendor_farm_id, vendor_house_id, sync_freq_min, status, alertConfigJson, id],
      );
      return { ok: true, msg: '映射已更新' };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }
  async deleteMapping(id: string) {
    try {
      await this.entityManager.query(`DELETE FROM mon_house_device_mapping WHERE id=$1`, [id]);
      return { ok: true, msg: '映射已删除' };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }
  async getMappingAlertConfig(id: string) {
    try {
      const data = await this.entityManager.query(`SELECT alert_config_json FROM mon_house_device_mapping WHERE id=$1`, [id]);
      return { alert_config: data.length > 0 && data[0].alert_config_json ? JSON.parse(data[0].alert_config_json) : {} };
    } catch { return { alert_config: {} }; }
  }
}
