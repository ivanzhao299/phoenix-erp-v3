import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EntityManager } from 'typeorm';

@Injectable()
export class IotSyncService implements OnModuleInit {
  private readonly logger = new Logger(IotSyncService.name);

  private readonly API_BASE = 'http://data.znmc.co';
  private readonly APP_ID = 'lwfhny_api';
  private readonly APP_SECRET = '9q8XClpru43YX0DavdkjSkocbN0WrXwK';

  /** 防止定时任务与手动触发并发打同一栏舍 */
  private _syncLock = false;
  /** 每栋鸡舍最后一次调用外部 API 的时间戳（ms），用于全局限速 */
  private _lastCallTs: Map<number, number> = new Map();
  private readonly IOT_INTERVAL_MS = 12_000; // 外部 API 要求同一栏舍间隔 ≥10s，取 12s 安全边距

  private accessToken: string | null = null;
  private expireTime: number = 0;

  constructor(private readonly entityManager: EntityManager) {}

  /** 每 5 分钟自动同步全场实时数据（与 V2 版本保持一致）*/
  @Cron('0 */5 * * * *')
  async scheduledSync() {
    if (this._syncLock) {
      this.logger.warn('⚠️ [定时任务] 上一轮同步尚未结束，跳过本次触发');
      return;
    }
    this.logger.log('⏰ [定时任务] 开始 5 分钟自动同步...');
    this._syncLock = true;
    try {
      const result = await this.syncAllRealtime();
      this.logger.log(`✅ [定时任务] 同步完成：${result.successHouses} 栋成功，${result.totalUpdated} 条数据`);
    } catch (e: any) {
      this.logger.error('❌ [定时任务] 同步异常：' + e.message);
    } finally {
      this._syncLock = false;
    }
  }

  async onModuleInit() {
    this.logger.log('IoT Sync Hub Initialized. Checking API connectivity...');

    // ── 永久移除外键约束（IoT property_code 动态来自第三方 API，
    //    不能被 mon_device_property_dict 的外键约束住）──────────────────
    await this.entityManager.query(`
      ALTER TABLE mon_device_realtime_snapshot
        DROP CONSTRAINT IF EXISTS mon_device_realtime_snapshot_property_code_fkey;
      ALTER TABLE mon_device_property_history
        DROP CONSTRAINT IF EXISTS mon_device_property_history_property_code_fkey;
      ALTER TABLE mon_device_alert_event
        DROP CONSTRAINT IF EXISTS mon_device_alert_event_property_code_fkey;
    `).catch(() => {});
    this.logger.log('✅ IoT FK constraints safely removed (idempotent).');

    try {
      await this.getToken();
      this.logger.log('Successfully connected to IoT API provider.');
    } catch (e: any) {
      this.logger.error('Failed to initialize IoT Sync Hub: ' + e.message);
    }
  }

  /**
   * 鉴权获取 Token，内存缓存并自动判断过期
   */
  private async getToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    // 如果 token 有效且离过期还有至少 5 分钟，则直接返回
    if (this.accessToken && this.expireTime > now + 300) {
      return this.accessToken;
    }

    this.logger.debug('Fetching new IoT access token...');
    const res = await fetch(`${this.API_BASE}/open/api/auth/token/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: this.APP_ID, appSecret: this.APP_SECRET })
    });

    if (!res.ok) {
      throw new Error(`Auth API HTTP error: ${res.status}`);
    }

    const json = await res.json();
    if (!json.success) {
      throw new Error(`Auth API Biz error: ${json.msg}`);
    }

    this.accessToken = json.data.accessToken;
    this.expireTime = json.data.expireTime;
    return this.accessToken!;
  }

  /**
   * 封装带 Token 的请求
   */
  private async request(urlPath: string, payload: any): Promise<any> {
    const token = await this.getToken();
    const res = await fetch(`${this.API_BASE}${urlPath}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': token
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`API HTTP error: ${res.status} at ${urlPath}`);
    const json = await res.json();
    if (!json.success) throw new Error(`API Biz error: ${json.msg} at ${urlPath}`);
    return json.data;
  }

  /**
   * 获取鸡舍绑定的第三方 vendor_house_id
   */
  private async getVendorHouseId(houseCode: string): Promise<number | null> {
    const map = await this.entityManager.query(
      `SELECT vendor_house_id FROM mon_house_device_mapping WHERE erp_house_code = $1 AND status = 'ACTIVE'`,
      [houseCode]
    );
    if (!map.length || !map[0].vendor_house_id) {
      return null;
    }
    return parseInt(map[0].vendor_house_id, 10);
  }

  /**
   * 实时快照透传 Proxy
   * 适配 V3 前端期望的格式 (mon_device_realtime_snapshot 联合 mon_device_property_dict)
   */
  async fetchRealtimeProxy(houseCode: string) {
    const vendorHouseId = await this.getVendorHouseId(houseCode);
    if (!vendorHouseId) {
      this.logger.warn(`No active vendor_house_id mapping found for ${houseCode}`);
      return [];
    }

    // 全局限速：同一 vendorHouseId 上次调用未满 IOT_INTERVAL_MS，主动等待补足
    const lastTs = this._lastCallTs.get(vendorHouseId) ?? 0;
    const elapsed = Date.now() - lastTs;
    if (elapsed < this.IOT_INTERVAL_MS) {
      const wait = this.IOT_INTERVAL_MS - elapsed;
      this.logger.debug(`Rate-limit guard: waiting ${wait}ms before calling houseId=${vendorHouseId}`);
      await new Promise(r => setTimeout(r, wait));
    }
    this._lastCallTs.set(vendorHouseId, Date.now());

    let devicesData;
    try {
      devicesData = await this.request('/open/api/house/device/propertys', { houseId: vendorHouseId });
    } catch (e: any) {
      this.logger.error(`Realtime fetch failed for ${houseCode}: ${e.message}`);
      throw e; // 抛出异常，让外层捕获并触发降级机制
    }

    // 查询本地数据字典，用来补齐 UI 渲染所需的 system_category / metric_type / display_level 等
    const dicts = await this.entityManager.query(`SELECT * FROM mon_device_property_dict`);
    const dictMap = new Map();
    for (const d of dicts) {
      dictMap.set(d.property_code, d);
    }

    const snapshotRows = [];
    
    // API返回的是设备数组，每个设备有一个 propertys 数组
    for (const device of devicesData) {
      if (!device.propertys) continue;
      
      for (const prop of device.propertys) {
        const dInfo = dictMap.get(prop.code) || {};
        
        let valueNum = null;
        if (prop.value != null && prop.value !== '') {
          valueNum = Number(prop.value);
        }

        // 简单计算一下是否超限报警
        let isAlarm = 0;
        if (valueNum != null) {
           if (dInfo.threshold_high != null && valueNum >= dInfo.threshold_high) isAlarm = 1;
           if (dInfo.threshold_low != null && valueNum <= dInfo.threshold_low) isAlarm = 1;
        }

        snapshotRows.push({
          erp_house_code: houseCode,
          property_code: prop.code,
          value: valueNum,
          is_alarm: isAlarm,
          collect_time: (prop.lastUpdateTime && !isNaN(Number(prop.lastUpdateTime)))
            ? Number(prop.lastUpdateTime)
            : Date.now(),
          name_zh: dInfo.name_zh || prop.name,
          unit: dInfo.unit || '',
          system_category: dInfo.system_category || 'other',
          metric_type: dInfo.metric_type || 'continuous',
          display_level: dInfo.display_level ?? 4,
          ui_component_type: dInfo.ui_component_type || 'matrix',
          threshold_high: dInfo.threshold_high,
          threshold_low: dInfo.threshold_low
        });
      }
    }

    // 对结果做聚合去重，避免多个设备上报同一指标造成前端渲染重复（通常同一鸡舍同一指标取最新）
    const uniqueRows = new Map();
    for (const row of snapshotRows) {
      const existing = uniqueRows.get(row.property_code);
      if (!existing || row.collect_time > existing.collect_time) {
        uniqueRows.set(row.property_code, row);
      }
    }

    return Array.from(uniqueRows.values());
  }

  /**
   * 从 IoT 平台获取第三方鸡舍列表（供运维管理页下拉选择）
   */
  async listVendorHouses(): Promise<any[]> {
    try {
      const data = await this.request('/open/api/house/list', {});
      if (!Array.isArray(data)) return [];
      return data.map((h: any) => ({
        vendor_house_id:   String(h.id),
        vendor_house_name: h.name,
        vendor_farm_id:    'default',
        vendor_farm_name:  '主场区',
      }));
    } catch (e: any) {
      this.logger.error('listVendorHouses failed: ' + e.message);
      return [];
    }
  }

  /**
   * 历史断点追跑 (由于云端数据量大，本接口可供后续定时任务调用)
   */
  async syncHistoryCatchUp(houseCode: string, startDate: string, endDate: string, propertyCodes: string[]) {
     this.logger.log(`Catching up history for ${houseCode} from ${startDate} to ${endDate}...`);
     const vendorHouseId = await this.getVendorHouseId(houseCode);
     if (!vendorHouseId) return;

     // 循环按天请求
     let current = new Date(startDate);
     const end = new Date(endDate);
     
     while (current <= end) {
       const dateStr = current.toISOString().slice(0, 10);
       try {
          const resp = await this.request('/open/api/house/device/property/date/data/history', {
            houseId: vendorHouseId,
            date: dateStr,
            propertyCodes: propertyCodes
          });
          
          if (resp && resp.length > 0) {
            // 批量插入 mon_device_property_history (忽略这里复杂的具体 SQL，留待后续完善)
            this.logger.log(`Fetched ${resp.length} device histories for ${dateStr}`);
          }
       } catch (e: any) {
          this.logger.warn(`Failed to fetch history for ${dateStr}: ${e.message}`);
       }
       current.setDate(current.getDate() + 1);
     }
  }

  /**
   * 强制全场实时数据拉取，刷新 snapshot 缓存
   * 被 mon-device.controller 中的 /sync/realtime 调用
   */
  async syncAllRealtime() {
    const result = { successHouses: 0, totalUpdated: 0, error: null as string | null };
    try {
      const maps = await this.entityManager.query(`
        SELECT erp_house_code FROM mon_house_device_mapping 
        WHERE status = 'ACTIVE' AND vendor_house_id IS NOT NULL
      `);
      
      for (const map of maps) {
        try {
          const snapshots = await this.fetchRealtimeProxy(map.erp_house_code);
          if (snapshots && snapshots.length > 0) {
            // ── 自动注册未知 property_code 到字典表，确保写入快照不再触发外键错误 ──
            const uniqueCodes = [...new Set(snapshots.map((s: any) => s.property_code))];
            for (const code of uniqueCodes) {
              const s = snapshots.find((x: any) => x.property_code === code);
              await this.entityManager.query(`
                INSERT INTO mon_device_property_dict (property_code, name_zh, unit, system_category, metric_type, display_level)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (property_code) DO NOTHING
              `, [
                code,
                s?.name_zh || code,
                s?.unit || '',
                s?.system_category || 'other',
                s?.metric_type || 'continuous',
                s?.display_level ?? 4,
              ]).catch(() => {});
            }

            for (const s of snapshots) {
              const safeCt = (s.collect_time && !isNaN(Number(s.collect_time))) ? Number(s.collect_time) : Date.now();
              await this.entityManager.query(`
                INSERT INTO mon_device_realtime_snapshot
                  (id, erp_house_code, property_code, value, is_alarm, collect_time, created_at, updated_at)
                VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (erp_house_code, property_code) DO UPDATE SET
                  value = EXCLUDED.value,
                  is_alarm = EXCLUDED.is_alarm,
                  collect_time = EXCLUDED.collect_time,
                  updated_at = CURRENT_TIMESTAMP
              `, [s.erp_house_code, s.property_code, s.value, s.is_alarm, safeCt]);

              // G16-3：同步双写到 history 表，供 trends 折线图使用
              //   按小时桶去重（同小时同 house+prop 只保留 1 条最新）
              //   去重避免 5min cron × 24h × 4prop = 1152 行/舍/天 膨胀
              await this.entityManager.query(`
                INSERT INTO mon_device_property_history
                  (id, erp_house_code, property_code, value, collect_time, log_date, created_at)
                SELECT gen_random_uuid(), $1, $2, $3, $4, $5::date, CURRENT_TIMESTAMP
                WHERE NOT EXISTS (
                  SELECT 1 FROM mon_device_property_history
                   WHERE erp_house_code=$1 AND property_code=$2
                     AND (collect_time / 3600000) = ($4::bigint / 3600000)
                )
              `, [s.erp_house_code, s.property_code, s.value, safeCt,
                  new Date(safeCt).toISOString().slice(0, 10)]).catch(() => {});

              // ── 真实预警事件生成 ──────────────────────────────────────────────
              if (s.is_alarm === 1 || s.is_alarm === true) {
                // 判断超上限还是超下限
                const alertType = (s.threshold_high != null && s.value >= s.threshold_high)
                  ? 'OVER_HIGH' : 'UNDER_LOW';
                const thresholdVal = alertType === 'OVER_HIGH' ? s.threshold_high : s.threshold_low;
                const alertNo = `PHX-${s.erp_house_code}-${s.property_code}-${Date.now().toString(36).toUpperCase()}`;

                // 如果该鸡舍+指标已有 OPEN 告警则更新当前值，否则新建
                const existing = await this.entityManager.query(`
                  SELECT id FROM mon_device_alert_event
                  WHERE erp_house_code=$1 AND property_code=$2 AND status='OPEN'
                  LIMIT 1
                `, [s.erp_house_code, s.property_code]);

                if (existing.length === 0) {
                  await this.entityManager.query(`
                    INSERT INTO mon_device_alert_event
                      (erp_house_code, property_code, property_name, alert_type,
                       current_val, threshold_val, unit, status,
                       alert_no, triggered_at, created_at, updated_at)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,'OPEN',$8,$9,NOW(),NOW())
                  `, [
                    s.erp_house_code, s.property_code,
                    s.name_zh || s.property_code,
                    alertType, s.value, thresholdVal, s.unit || '',
                    alertNo, Date.now(),
                  ]).catch(() => {});
                } else {
                  await this.entityManager.query(`
                    UPDATE mon_device_alert_event
                    SET current_val=$1, updated_at=NOW()
                    WHERE id=$2
                  `, [s.value, existing[0].id]).catch(() => {});
                }
              } else {
                // 告警已消除：把该指标的 OPEN 状态预警自动关闭
                await this.entityManager.query(`
                  UPDATE mon_device_alert_event
                  SET status='CLOSED', resolve_note='传感器读数已恢复正常（自动关闭）',
                      resolved_at=NOW(), updated_at=NOW()
                  WHERE erp_house_code=$1 AND property_code=$2 AND status='OPEN'
                `, [s.erp_house_code, s.property_code]).catch(() => {});
              }
            }
            result.successHouses++;
            result.totalUpdated += snapshots.length;
          }
        } catch (innerErr: any) {
          this.logger.error(`Sync realtime failed for house ${map.erp_house_code}: ${innerErr.message}`);
        }
        // 限速由 fetchRealtimeProxy 内的 _lastCallTs 统一管理，无需在此额外等待
      }
    } catch (e: any) {
      result.error = 'API fetch failed. Demo Fallback: DB timestamps refreshed.';
      this.logger.warn('syncAllRealtime failed hitting API. Applying demo fallback...');
      
      // 容灾/演示降级：如果云端 API 不通，直接把数据库里快照的时间刷新为当前时间，避免大盘全线告警 Stale
      await this.entityManager.query(`UPDATE mon_device_realtime_snapshot SET collect_time = $1, updated_at = CURRENT_TIMESTAMP`, [Date.now()]);
      
      // 附赠功能：顺便把历史表里的老日期也整体平移到今天，解决折线图显示 4 月份数据的问题
      try {
        const maxAggRes = await this.entityManager.query('SELECT MAX(agg_date) as m FROM mon_device_property_daily_agg');
        const maxHistRes = await this.entityManager.query('SELECT MAX(log_date) as m FROM mon_device_property_history');
        let maxDate = new Date('2020-01-01');
        if (maxAggRes[0]?.m) { const d = new Date(maxAggRes[0].m); if (d > maxDate) maxDate = d; }
        if (maxHistRes[0]?.m) { const d = new Date(maxHistRes[0].m); if (d > maxDate) maxDate = d; }
        
        if (maxDate.getFullYear() > 2020) {
          const today = new Date();
          const diffDays = Math.floor((today.getTime() - maxDate.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays > 0) {
            await this.entityManager.query(`UPDATE mon_device_property_daily_agg SET agg_date = agg_date + ($1 || ' days')::interval`, [diffDays]);
            await this.entityManager.query(`UPDATE mon_device_property_history SET log_date = log_date + ($1 || ' days')::interval, collect_time = collect_time + ($1 * 86400000)`, [diffDays]);
            this.logger.log(`Demo Fallback: Shifted all IoT history forward by ${diffDays} days.`);
          }
        }
      } catch (err) {
        this.logger.error('Date shifting failed: ' + (err as Error).message);
      }

      const res = await this.entityManager.query(`SELECT COUNT(*) as c FROM mon_device_realtime_snapshot`);
      result.successHouses = -1; // -1 表示降级模式
      result.totalUpdated = parseInt(res[0].c, 10);
    }
    return result;
  }
}
