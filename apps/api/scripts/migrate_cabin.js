const fs = require('fs');

const servicePath = 'src/modules/iot/iot-v2-compat.service.ts';
let serviceCode = fs.readFileSync(servicePath, 'utf-8');

// I will insert all the methods before `  // 3. Ops Center Config APIs`
const insertionPoint = serviceCode.indexOf('  // 3. Ops Center Config APIs');

const newMethods = `
  // --- 鸡舍单体详情 (Migrated from farmDeviceCabin.js) ---
  
  private fmtTime(ts: any) {
    if (!ts) return null;
    const n = Number(ts);
    return n > 1e12 ? new Date(n).toISOString().replace('T',' ').slice(0,19) : (ts || null);
  }

  private alarmStatus(isAlarm: number, threshH: number, threshL: number, value: number, propertyCode: string) {
    if (isAlarm === 1) return 'critical';
    if (value == null) return 'normal';
    
    const WARN_RULES: any = {
      '2090': { hi: (h:number) => h - h * 0.10,  lo: null },
      '2096': { hi: (h:number) => h - h * 0.10,  lo: null },
      '2001': { hi: (h:number) => h - 2,          lo: (l:number) => l + 2  },
      '2083': { hi: (h:number) => h - 5,          lo: (l:number) => l + 5  },
    };
    
    const rule = WARN_RULES[String(propertyCode)];
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

  private readonly SNAPSHOT_SQL = \`
    SELECT s.property_code,
           s.value,
           s.is_alarm,
           s.collect_time,
           COALESCE(d.name_zh,      s.name_zh, s.property_code) AS name_zh,
           COALESCE(d.unit,         s.unit,    '')               AS unit,
           COALESCE(d.system_category, 'other')                  AS system_category,
           COALESCE(d.metric_type,     'continuous')             AS metric_type,
           COALESCE(d.display_level,   4)                        AS display_level,
           COALESCE(d.ui_component_type, 'matrix')               AS ui_component_type,
           d.threshold_high,
           d.threshold_low
      FROM farm_device_realtime_snapshot s
      LEFT JOIN farm_device_property_dict d ON d.property_code = s.property_code
     WHERE s.erp_house_code = $1
  \`;

  private readonly SYSTEMS = [
    { code:'environment', name:'环境监测', color:'#06b6d4', icon:'🌡' },
    { code:'control',     name:'环境控制', color:'#6366f1', icon:'🎛' },
    { code:'feed',        name:'饲喂系统', color:'#f59e0b', icon:'🌾' },
    { code:'water',       name:'饮水系统', color:'#3b82f6', icon:'💧' },
    { code:'actuator',    name:'执行设备', color:'#10b981', icon:'⚙️' },
  ];

  async getHouseOverview(houseCode: string) {
    try {
      const rows = await this.entityManager.query(this.SNAPSHOT_SQL, [houseCode]);
      if (!rows.length) return { ok: true, data: null, empty: true };

      const isOnline = (r:any) => r.value != null && (Date.now() - Number(r.collect_time)) < 60 * 60_000;
      const latestTs   = Math.max(...rows.map((r:any) => Number(r.collect_time) || 0));
      const alarmCount = rows.filter((r:any) => r.is_alarm === 1).length;
      const onlineCnt  = rows.filter(isOnline).length;

      const sensorRows = rows.filter((r:any) => r.metric_type === 'continuous');
      const deviceRows  = rows.filter((r:any) => r.metric_type === 'status');
      const meterRows   = rows.filter((r:any) => r.metric_type === 'cumulative');

      const header = {
        houseCode,
        lastUpdateTime:   this.fmtTime(latestTs),
        alarmCount,
        totalSensors:     rows.length,
        onlineSensors:    onlineCnt,
        sensorOnlineRate: rows.length ? +(onlineCnt / rows.length).toFixed(2) : 0,
        sensorCount:      sensorRows.length,
        onlineSensorCnt:  sensorRows.filter(isOnline).length,
        deviceCount:      deviceRows.length,
        onlineDeviceCnt:  deviceRows.filter(isOnline).length,
        meterCount:       meterRows.length,
        dataFreshness:    this.dataFreshness(latestTs),
      };

      const kpiRows = rows.filter((r:any) => r.display_level === 1 && r.value != null);
      const kpis = kpiRows.map((r:any) => {
        const v = Number(r.value);
        return {
          code:  r.property_code,
          title: r.name_zh,
          value: v,
          unit:  r.unit,
          status: this.alarmStatus(r.is_alarm, r.threshold_high, r.threshold_low, v, r.property_code),
          system: r.system_category,
          lastUpdateTime: this.fmtTime(r.collect_time),
        };
      });
      kpis.push({ code:'alarm_count', title:'当前告警', value: alarmCount,
        unit:'项', status: alarmCount > 0 ? 'critical' : 'normal', system:'alarm' });

      return { ok: true, data: { header, kpis, status: { dataFreshness: header.dataFreshness } } };
    } catch(e:any) {
      return { ok: false, error: e.message };
    }
  }

  async getHouseSystemsSummary(houseCode: string) {
    try {
      const rows = await this.entityManager.query(this.SNAPSHOT_SQL, [houseCode]);
      const openAlerts = await this.entityManager.query(
        \`SELECT property_code FROM farm_device_alert_event WHERE erp_house_code=$1 AND status='OPEN'\`, [houseCode]);
      const openAlertCodes = new Set(openAlerts.map((a:any) => String(a.property_code)));
      const isOnline = (r:any) => r.value != null && (Date.now() - Number(r.collect_time)) < 60 * 60_000;

      const systems = this.SYSTEMS.map(sys => {
        const sRows = rows.filter((r:any) => r.system_category === sys.code);
        if (!sRows.length) return { ...sys, status:'no_data', alarmCount:0,
          onlineRate:0, summaryMetrics:[], sensorCount:0, deviceCount:0, lastSeenTs:null };

        const lastSeenTs = Math.max(...sRows.map((r:any) => Number(r.collect_time)||0));
        const alarmCnt   = sRows.filter((r:any) =>
          r.is_alarm === 1 || openAlertCodes.has(String(r.property_code))).length;
        const onlineRows = sRows.filter(isOnline);
        const onlineRate = sRows.length ? +(onlineRows.length / sRows.length).toFixed(2) : 0;

        const statusSRows  = sRows.filter((r:any) => r.metric_type === 'status');
        const activeStatus = statusSRows.filter((r:any) => r.value != null && Number(r.value) > 0).length;
        const isStandby    = statusSRows.length > 0 && activeStatus === 0;
        const commOffline  = (Date.now() - lastSeenTs) > 60 * 60_000;

        const sysStatus = alarmCnt > 0    ? 'critical'
                        : commOffline      ? 'comm_offline'
                        : onlineRate < 0.5 ? 'warning'
                        : isStandby        ? 'standby'
                        : 'normal';

        const summaryRows    = sRows.filter((r:any) => r.display_level <= 2 && r.value != null).slice(0, 4);
        const summaryMetrics = summaryRows.map((r:any) => ({
          label:  r.name_zh,
          value:  Number(r.value),
          unit:   r.unit,
          status: this.alarmStatus(r.is_alarm, r.threshold_high, r.threshold_low, Number(r.value), r.property_code),
        }));

        return { ...sys, status: sysStatus, alarmCount: alarmCnt,
          onlineRate, sensorCount: sRows.filter((r:any) => r.metric_type === 'continuous').length,
          deviceCount: statusSRows.length, lastSeenTs, summaryMetrics };
      });

      return { ok: true, data: { systems } };
    } catch(e:any) {
      return { ok: false, error: e.message };
    }
  }

  async getHouseSystemDetail(houseCode: string, systemCode: string) {
    try {
      const sysMeta = this.SYSTEMS.find(s => s.code === systemCode) || { code: systemCode, name: systemCode, color:'#6b7280', icon:'📊' };
      const allRows = await this.entityManager.query(this.SNAPSHOT_SQL, [houseCode]);
      const rows = allRows
        .filter((r:any) => r.system_category === systemCode)
        .sort((a:any, b:any) => a.display_level - b.display_level);

      const isOnline = (r:any) => r.value != null && (Date.now() - Number(r.collect_time)) < 60 * 60_000;
      const alarmCnt   = rows.filter((r:any) => r.is_alarm === 1).length;
      const onlineRows  = rows.filter(isOnline);
      const onlineRate  = rows.length ? +(onlineRows.length / rows.length).toFixed(2) : 0;
      const sysStatus   = alarmCnt > 0 ? 'critical' : onlineRate < 0.5 ? 'warning' : 'normal';
      const summary  = { ...sysMeta, status: sysStatus, alarmCount: alarmCnt, sensorCount: rows.length, onlineRate };

      const groupMap: any = {};
      for (const r of rows) {
        const compType = r.ui_component_type || 'matrix';
        if (!groupMap[compType]) groupMap[compType] = [];
        groupMap[compType].push({
          code:          r.property_code,
          name:          r.name_zh,
          value:         r.value != null ? Number(r.value) : null,
          unit:          r.unit,
          status:        this.alarmStatus(r.is_alarm, r.threshold_high, r.threshold_low, r.value != null ? Number(r.value) : null, r.property_code),
          metricType:    r.metric_type,
          thresholdHigh: r.threshold_high,
          thresholdLow:  r.threshold_low,
          lastUpdateTime: this.fmtTime(r.collect_time),
        });
      }

      const groups = Object.entries(groupMap).map(([componentType, items]) => ({ componentType, items }));
      const alarms = rows.filter((r:any) => r.is_alarm === 1).map((r:any) => ({
        propertyCode: r.property_code,
        name:         r.name_zh,
        value:        Number(r.value),
        unit:         r.unit,
        threshold:    r.threshold_high ?? r.threshold_low,
      }));

      return { ok: true, data: { summary, groups, alarms } };
    } catch(e:any) {
      return { ok: false, error: e.message };
    }
  }

  async getHouseTrends(houseCode: string, codes: string, range: string = '7d') {
    try {
      if (!codes) return { ok: false, error: '请指定 codes 参数' };

      const codeList  = codes.split(',').map(c => c.trim()).filter(Boolean).slice(0, 8);
      const today     = new Date().toISOString().slice(0, 10);
      const daysMap: any   = { '24h': 7, '7d': 7, '30d': 30 };
      const days      = daysMap[range] || 7;
      const startDate = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);

      const ph = codeList.map((_, i) => '$' + (i + 2)).join(',');

      let rows = await this.entityManager.query(\`
        SELECT h.property_code, h.value, h.collect_time AS time_label,
               COALESCE(d.name_zh, h.property_code)     AS name_zh,
               COALESCE(d.unit,    h.unit,    '')        AS unit,
               d.threshold_high, d.threshold_low
          FROM farm_device_property_history h
          LEFT JOIN farm_device_property_dict d ON d.property_code = h.property_code
         WHERE h.erp_house_code = $1
           AND h.property_code IN (\${ph})
           AND h.log_date BETWEEN \$\${codeList.length + 2} AND \$\${codeList.length + 3}
         ORDER BY h.collect_time ASC
         LIMIT 2000
      \`, [houseCode, ...codeList, startDate, today]);

      let granularity = 'hourly';

      if (!rows.length) {
        granularity = 'daily';
        rows = await this.entityManager.query(\`
          SELECT a.property_code, a.agg_date AS time_label, a.avg_val AS value,
                 COALESCE(d.name_zh, a.property_code) AS name_zh,
                 COALESCE(d.unit,    a.unit, '')       AS unit,
                 d.threshold_high, d.threshold_low
            FROM farm_device_property_daily_agg a
            LEFT JOIN farm_device_property_dict d ON d.property_code = a.property_code
           WHERE a.erp_house_code = $1
             AND a.property_code IN (\${ph})
             AND a.agg_date >= \$\${codeList.length + 2}
           ORDER BY a.agg_date ASC
           LIMIT 500
        \`, [houseCode, ...codeList, startDate]);
      }

      const seriesMap: any = {};
      for (const r of rows) {
        if (!seriesMap[r.property_code]) {
          seriesMap[r.property_code] = {
            code: r.property_code, name: r.name_zh, unit: r.unit,
            thresholdHigh: r.threshold_high, thresholdLow:  r.threshold_low, points: [],
          };
        }
        const timeLabel = granularity === 'daily'
          ? String(r.time_label).slice(5)
          : this.fmtTime(r.time_label);
        seriesMap[r.property_code].points.push([timeLabel, Number(r.value)]);
      }

      return { ok: true, data: { range, granularity, series: Object.values(seriesMap) } };
    } catch(e:any) {
      return { ok: false, error: e.message };
    }
  }

  async getHouseAlarms(houseCode: string, status: string = 'open') {
    try {
      const q = status !== 'all' ? \`AND a.status = '\${status === 'open' ? 'OPEN' : status.toUpperCase()}'\` : '';
      const rows = await this.entityManager.query(\`
        SELECT a.id, a.property_code, a.current_val, a.threshold_val,
               a.triggered_at, a.status, a.confirmed_by, a.closed_at,
               COALESCE(d.name_zh, a.property_name, a.property_code) AS name_zh,
               COALESCE(d.unit,    a.unit, '')                        AS unit,
               COALESCE(d.system_category, 'other')                   AS system_category,
               d.threshold_high, d.threshold_low
          FROM farm_device_alert_event a
          LEFT JOIN farm_device_property_dict d ON d.property_code = a.property_code
         WHERE a.erp_house_code = $1 \${q}
         ORDER BY a.triggered_at DESC
         LIMIT 100
      \`, [houseCode]);

      const sysMeta = Object.fromEntries(this.SYSTEMS.map(s => [s.code, s]));
      const items = rows.map((r:any) => {
        const sys = sysMeta[r.system_category] || { name:'其他', color:'#6b7280' };
        const triggeredMs = Number(r.triggered_at) > 1e12 ? Number(r.triggered_at) : new Date(r.triggered_at).getTime();
        return {
          id:             r.id,
          systemCode:     r.system_category,
          systemName:     sys.name,
          alarmName:      r.name_zh,
          propertyCode:   r.property_code,
          currentValue:   r.current_val != null ? Number(r.current_val) : null,
          threshold:      r.threshold_val ?? r.threshold_high ?? r.threshold_low,
          unit:           r.unit,
          level:          'critical',
          status:         r.status,
          durationMinutes: Math.floor((Date.now() - triggeredMs) / 60_000),
          triggeredAt:    this.fmtTime(r.triggered_at),
          confirmedBy:    r.confirmed_by,
        };
      });

      return { ok: true, data: { items, total: items.length } };
    } catch(e:any) {
      return { ok: false, error: e.message };
    }
  }

  async getHouseStream(houseCode: string) {
    return { ok: false, error: '暂不支持直接调用底层摄像头接口' };
  }
`;

serviceCode = serviceCode.substring(0, insertionPoint) + newMethods + serviceCode.substring(insertionPoint);
fs.writeFileSync(servicePath, serviceCode, 'utf-8');

const controllerPath = 'src/modules/iot/farm-cabin.controller.ts';
let controllerCode = fs.readFileSync(controllerPath, 'utf-8');

const ctrlInsert = controllerCode.indexOf('  @Get(\':cabinId/status\')');
const newCtrl = `
  @Get(':houseCode/overview')
  async getHouseOverview(@Param('houseCode') houseCode: string) {
    return await this.compatService.getHouseOverview(houseCode);
  }

  @Get(':houseCode/systems/summary')
  async getHouseSystemsSummary(@Param('houseCode') houseCode: string) {
    return await this.compatService.getHouseSystemsSummary(houseCode);
  }

  @Get(':houseCode/systems/:systemCode/detail')
  async getHouseSystemDetail(@Param('houseCode') houseCode: string, @Param('systemCode') systemCode: string) {
    return await this.compatService.getHouseSystemDetail(houseCode, systemCode);
  }

  @Get(':houseCode/trends')
  async getHouseTrends(@Param('houseCode') houseCode: string, @Query('codes') codes: string, @Query('range') range: string) {
    return await this.compatService.getHouseTrends(houseCode, codes, range);
  }

  @Get(':houseCode/alarms')
  async getHouseAlarms(@Param('houseCode') houseCode: string, @Query('status') status: string) {
    return await this.compatService.getHouseAlarms(houseCode, status);
  }

  @Get(':houseCode/stream')
  async getHouseStream(@Param('houseCode') houseCode: string) {
    return await this.compatService.getHouseStream(houseCode);
  }

`;
controllerCode = controllerCode.substring(0, ctrlInsert) + newCtrl + controllerCode.substring(ctrlInsert);

// Add Query import to controller
if (!controllerCode.includes('Query')) {
  controllerCode = controllerCode.replace('import { Controller, Get, Param, UseGuards }', 'import { Controller, Get, Param, UseGuards, Query }');
}

fs.writeFileSync(controllerPath, controllerCode, 'utf-8');
console.log('Migrated successfully.');
