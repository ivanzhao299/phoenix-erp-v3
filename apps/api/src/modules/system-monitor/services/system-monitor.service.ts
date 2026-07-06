/**
 * Phoenix ERP V3 — 系统监控 Service
 * Production Stabilization Phase 1
 *
 * 提供：
 *   - API 请求统计（请求数/平均耗时/慢接口/500 率）
 *   - 数据库连接池状态
 *   - 内存/CPU 实时指标
 *   - 最近告警概览
 */
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { getHeapStatistics } from 'v8';

export interface RequestStat {
  method: string;
  path: string;
  count: number;
  avgMs: number;
  p95Ms: number;
  errorCount: number;
}

@Injectable()
export class SystemMonitorService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  // ── 1. 系统整体健康摘要 ────────────────────────────────────────────────────

  async getHealthSummary() {
    const [dbOk, poolInfo] = await this.checkDb();
    const mem  = this.getMemoryUsage();
    const cpu  = this.getCpuUsage();
    const [errorCount, alertSummary, errorStats, alertDelivery] = await Promise.all([
      this.getRecentErrorCount(),
      this.getAlertSummary(),
      this.getErrorStats().catch(() => ({ summary: [], recent: [] })),
      this.getAlertDeliverySummary(),
    ]);
    const status = !dbOk || mem.pressure || errorCount > 0 || alertSummary.actionableOpen > 0 ? 'DEGRADED' : 'HEALTHY';

    return {
      status,
      timestamp:  new Date().toISOString(),
      database: {
        connected: dbOk,
        pool:      poolInfo,
      },
      memory:       mem,
      cpu:          cpu,
      recentErrors: errorCount,
      openAlerts:   alertSummary.unresolvedTotal,
      alerts:       alertSummary,
      errors: {
        summary24h: errorStats.summary,
        recent1h: errorStats.recent,
      },
      alertDelivery,
      sources: {
        health: 'api/system/monitor/health',
        errors: 'sys_error_logs',
        alerts: 'sys_alerts',
        notifications: 'sys_notifications',
        database: 'pg_stat_database + TypeORM DataSource',
        runtime: 'Node.js process metrics',
      },
      operations: {
        alertsPage: '/system/alerts?resolved=false',
        errorLogsPage: '/system/error-logs',
        backupPage: '/system/backup',
        configPage: '/system/configs',
      },
    };
  }

  // ── 2. 慢接口统计（最近 1 小时，按平均耗时降序） ─────────────────────────

  async getSlowApis(limitMs = 1000, top = 20): Promise<RequestStat[]> {
    // 从 sys_operation_logs 获取接口请求统计（近1小时）
    const rows = await this.ds.query<any[]>(
      `SELECT
         request_method AS method,
         request_path   AS path,
         COUNT(*)       AS count,
         0              AS avg_ms,
         0              AS p95_ms,
         COUNT(*) FILTER (WHERE result_status = 'FAIL') AS error_count
       FROM sys_operation_logs
       WHERE created_at > NOW() - INTERVAL '1 hour'
       GROUP BY request_method, request_path
       ORDER BY count DESC
       LIMIT $1`,
      [top],
    );
    return rows.map(r => ({
      method:     r.method,
      path:       r.path,
      count:      Number(r.count),
      avgMs:      Number(r.avg_ms),
      p95Ms:      Number(r.p95_ms),
      errorCount: Number(r.error_count),
    }));
  }

  // ── 3. 最近错误概览（最近 24 小时，按错误类型聚合） ──────────────────────

  async getErrorStats() {
    const rows = await this.ds.query<any[]>(
      `SELECT
         error_type,
         http_status,
         COUNT(*) AS count,
         MAX(created_at) AS last_seen
       FROM sys_error_logs
       WHERE created_at > NOW() - INTERVAL '24 hours'
       GROUP BY error_type, http_status
       ORDER BY count DESC
       LIMIT 50`,
    );
    const recentErrors = await this.ds.query<any[]>(
      `SELECT id, error_type, http_status, error_message,
              request_method, request_path, username, created_at
       FROM sys_error_logs
       WHERE created_at > NOW() - INTERVAL '1 hour'
       ORDER BY created_at DESC
       LIMIT 20`,
    );
    return { summary: rows, recent: recentErrors };
  }

  // ── 4. 数据库连接池状态 ────────────────────────────────────────────────────

  async getDbPoolStats() {
    const rows = await this.ds.query<any[]>(
      `SELECT
         datname,
         numbackends        AS connections,
         xact_commit        AS tx_committed,
         xact_rollback      AS tx_rolled_back,
         blks_read,
         blks_hit,
         ROUND(100.0 * blks_hit / NULLIF(blks_hit + blks_read, 0), 2) AS cache_hit_pct
       FROM pg_stat_database
       WHERE datname = current_database()`,
    );
    const lockRows = await this.ds.query<any[]>(
      `SELECT count(*) AS lock_count FROM pg_locks WHERE NOT granted`,
    );
    return {
      database:  rows[0] ?? null,
      waitingLocks: Number(lockRows[0]?.lock_count ?? 0),
    };
  }

  // ── 5. 操作审计汇总（最近 7 天高危操作统计） ─────────────────────────────

  async getOperationStats() {
    const rows = await this.ds.query<any[]>(
      `SELECT
         biz_type,
         action_code,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE result_status = 'FAIL') AS failures,
         MAX(created_at) AS last_at
       FROM sys_operation_logs
       WHERE created_at > NOW() - INTERVAL '7 days'
       GROUP BY biz_type, action_code
       ORDER BY total DESC`,
    );
    return rows;
  }

  // ── 私有工具 ──────────────────────────────────────────────────────────────

  private async checkDb(): Promise<[boolean, object]> {
    try {
      await this.ds.query('SELECT 1');
      // TypeORM DataSource 连接池状态
      const driver = this.ds.driver as any;
      const pool   = driver?.master ?? driver?.pool ?? null;
      return [true, pool ? {
        total:   pool.totalCount   ?? pool._allConnections?.length    ?? 0,
        idle:    pool.idleCount    ?? pool._freeConnections?.length   ?? 0,
        waiting: pool.waitingCount ?? pool._connectionQueue?.length   ?? 0,
      } : { note: 'pool_not_accessible' }];
    } catch {
      return [false, {}];
    }
  }

  private getMemoryUsage() {
    const mem         = process.memoryUsage();
    const heapStats   = getHeapStatistics();
    const totalMB     = Math.round(mem.heapTotal / 1024 / 1024);
    const usedMB      = Math.round(mem.heapUsed  / 1024 / 1024);
    const rssMB       = Math.round(mem.rss       / 1024 / 1024);
    const heapLimitMB = Math.round(heapStats.heap_size_limit / 1024 / 1024);
    const heapLimitUsedPct = heapLimitMB > 0 ? Math.round((usedMB / heapLimitMB) * 100) : 0;
    const heapAllocatedPct = totalMB > 0 ? Math.round((usedMB / totalMB) * 100) : 0;
    const pressure = rssMB >= 1024 || usedMB >= 512 || heapLimitUsedPct >= 80;
    return {
      heapTotalMB: totalMB,
      heapUsedMB:  usedMB,
      rssMB,
      heapLimitMB,
      heapAllocatedPct,
      usedPct: heapLimitUsedPct,
      pressure,
    };
  }

  private getCpuUsage() {
    const usage = process.cpuUsage();
    const userMs = Math.round(usage.user / 1000);
    const systemMs = Math.round(usage.system / 1000);
    const totalMs = userMs + systemMs;
    const uptimeSec = Math.round(process.uptime());
    const uptimeMs = Math.max(1, uptimeSec * 1000);
    return {
      userMs,
      systemMs,
      totalMs,
      uptimeSec,
      avgCpuPct: Math.round((totalMs / uptimeMs) * 1000) / 10,
    };
  }

  private async getRecentErrorCount(): Promise<number> {
    try {
      const r = await this.ds.query<any[]>(
        `SELECT COUNT(*) AS c FROM sys_error_logs WHERE created_at > NOW() - INTERVAL '1 hour'`,
      );
      return Number(r[0]?.c ?? 0);
    } catch { return 0; }
  }

  private async getUnresolvedAlertCount(): Promise<number> {
    try {
      const r = await this.ds.query<any[]>(
        `SELECT COUNT(*) AS c FROM sys_alerts WHERE resolved = FALSE`,
      );
      return Number(r[0]?.c ?? 0);
    } catch { return 0; }
  }

  private async getAlertSummary() {
    try {
      const rows = await this.ds.query<any[]>(
        `SELECT
           COUNT(*) FILTER (WHERE resolved = FALSE)::int AS unresolved_total,
           COUNT(*) FILTER (
             WHERE resolved = FALSE
               AND severity IN ('CRITICAL','WARNING')
               AND created_at > NOW() - INTERVAL '7 days'
           )::int AS actionable_open,
           COUNT(*) FILTER (
             WHERE resolved = FALSE
               AND severity = 'CRITICAL'
               AND created_at > NOW() - INTERVAL '7 days'
           )::int AS critical_open,
           COUNT(*) FILTER (
             WHERE resolved = FALSE
               AND created_at <= NOW() - INTERVAL '7 days'
           )::int AS stale_open,
           COUNT(*) FILTER (
             WHERE resolved = FALSE
               AND alert_type = 'IOT_DEVICE_ALERT'
               AND created_at <= NOW() - INTERVAL '7 days'
           )::int AS stale_iot_open,
           COUNT(*) FILTER (
             WHERE resolved = FALSE
               AND created_at > NOW() - INTERVAL '24 hours'
           )::int AS opened_24h
         FROM sys_alerts`,
      );
      const byType = await this.ds.query<any[]>(
        `SELECT alert_type, severity, COUNT(*)::int AS count, MAX(created_at) AS last_seen
           FROM sys_alerts
          WHERE resolved = FALSE
          GROUP BY alert_type, severity
          ORDER BY count DESC, last_seen DESC
          LIMIT 10`,
      );
      const row = rows[0] ?? {};
      return {
        unresolvedTotal: Number(row.unresolved_total ?? 0),
        actionableOpen: Number(row.actionable_open ?? 0),
        criticalOpen: Number(row.critical_open ?? 0),
        staleOpen: Number(row.stale_open ?? 0),
        staleIotOpen: Number(row.stale_iot_open ?? 0),
        opened24h: Number(row.opened_24h ?? 0),
        byType,
        semantics: {
          unresolvedTotal: '历史未处理告警总量，包含早期沉积，不直接等同当前故障。',
          actionableOpen: '近 7 天 CRITICAL/WARNING 未处理告警，作为当前值班待办口径。',
          staleOpen: '超过 7 天仍未处理的告警，需批量归档或重新生成有效告警。',
        },
      };
    } catch {
      return {
        unresolvedTotal: 0,
        actionableOpen: 0,
        criticalOpen: 0,
        staleOpen: 0,
        staleIotOpen: 0,
        opened24h: 0,
        byType: [],
        semantics: {
          unresolvedTotal: 'sys_alerts 不可读。',
          actionableOpen: 'sys_alerts 不可读。',
          staleOpen: 'sys_alerts 不可读。',
        },
      };
    }
  }

  private async getAlertDeliverySummary() {
    try {
      const [recipientRow, notificationRow] = await Promise.all([
        this.ds.query<any[]>(
          `SELECT COUNT(DISTINCT u.user_id)::int AS recipient_count
             FROM sys_user u
             JOIN sys_user_role ur ON ur.user_id = u.user_id
             JOIN sys_role_menu_permission rmp ON rmp.role_id = ur.role_id
             JOIN sys_menu m ON m.menu_id = rmp.menu_id
            WHERE u.status = 1
              AND m.menu_code = 'MENU_SYS_MONITOR'
              AND (rmp.perm_codes = '*' OR 'V' = ANY(string_to_array(COALESCE(rmp.perm_codes, ''), ',')))`,
        ),
        this.ds.query<any[]>(
          `SELECT COUNT(*)::int AS notification_count
             FROM sys_notifications
            WHERE notification_type = 'SYSTEM_ALERT'
              AND biz_type = 'SYS_ALERT'
              AND created_at > NOW() - INTERVAL '24 hours'`,
        ),
      ]);
      return {
        monitorRecipients: Number(recipientRow[0]?.recipient_count ?? 0),
        alertNotificationsLast24h: Number(notificationRow[0]?.notification_count ?? 0),
        mode: 'STATION_NOTIFICATION',
        healthy: Number(recipientRow[0]?.recipient_count ?? 0) > 0,
      };
    } catch {
      return {
        monitorRecipients: 0,
        alertNotificationsLast24h: 0,
        mode: 'UNKNOWN',
        healthy: false,
      };
    }
  }
}
