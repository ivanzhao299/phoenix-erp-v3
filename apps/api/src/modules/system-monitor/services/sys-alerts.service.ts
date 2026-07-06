/**
 * Phoenix ERP V3 — 异常告警 Service
 * Production Stabilization Phase 1
 *
 * 安全约束：
 *   - 不允许物理删除告警（append-only）
 *   - 只允许将 resolved = false → true（单向）
 *   - 所有 resolved 操作必须记录 resolved_by / resolved_at / resolved_remark
 */
import { Injectable, ForbiddenException, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface CreateAlertDto {
  alertType:   string;
  severity?:   'INFO' | 'WARNING' | 'CRITICAL';
  title:       string;
  detail?:     Record<string, any>;
  relatedPath?: string;
}

export interface ResolveAlertDto {
  resolvedBy:     string;
  resolvedRemark?: string;
}

export interface BulkResolveStaleAlertsDto {
  resolvedBy: string;
  olderThanDays?: number;
  alertType?: string;
  severity?: string;
  reason?: string;
  dryRun?: boolean;
  confirm?: string;
  maxRows?: number;
  includeCritical?: boolean;
}

@Injectable()
export class SysAlertsService {
  private readonly logger = new Logger(SysAlertsService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  /** 新建告警（由 SystemMonitorService / AllExceptionsFilter 调用） */
  async createAlert(dto: CreateAlertDto): Promise<number> {
    const [recentDuplicate] = await this.ds.query<any[]>(
      `SELECT id
         FROM sys_alerts
        WHERE resolved = FALSE
          AND alert_type = $1
          AND title = $2
          AND COALESCE(related_path, '') = COALESCE($3, '')
          AND created_at > NOW() - INTERVAL '10 minutes'
        ORDER BY created_at DESC
        LIMIT 1`,
      [dto.alertType, dto.title, dto.relatedPath ?? null],
    );
    if (recentDuplicate?.id) {
      return Number(recentDuplicate.id);
    }

    const rows = await this.ds.query<any[]>(
      `INSERT INTO sys_alerts (alert_type, severity, title, detail, related_path)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        dto.alertType,
        dto.severity ?? 'WARNING',
        dto.title,
        dto.detail ? JSON.stringify(dto.detail) : null,
        dto.relatedPath ?? null,
      ],
    );
    const alertId = Number(rows[0]?.id);
    await this.notifySystemMonitorWatchers(alertId, dto).catch((e) => {
      this.logger.warn(`[sys-alerts] notification delivery failed alert=${alertId}: ${e?.message ?? e}`);
    });
    return alertId;
  }

  async getBacklogSummary() {
    const [summaryRows, typeRows, noisyRows, staleRows] = await Promise.all([
      this.ds.query<any[]>(
        `SELECT
           COUNT(*) FILTER (WHERE resolved = FALSE)::int AS unresolved_total,
           COUNT(*) FILTER (
             WHERE resolved = FALSE
               AND severity IN ('CRITICAL','WARNING')
               AND created_at > NOW() - INTERVAL '7 days'
           )::int AS actionable_open,
           COUNT(*) FILTER (
             WHERE resolved = FALSE
               AND created_at <= NOW() - INTERVAL '7 days'
           )::int AS stale_open,
           COUNT(*) FILTER (
             WHERE resolved = FALSE
               AND created_at <= NOW() - INTERVAL '30 days'
           )::int AS stale_30d_open,
           COUNT(*) FILTER (
             WHERE resolved = FALSE
               AND alert_type = 'IOT_DEVICE_ALERT'
           )::int AS unresolved_iot,
           COUNT(*) FILTER (
             WHERE resolved = FALSE
               AND severity = 'CRITICAL'
           )::int AS unresolved_critical,
           MIN(created_at) FILTER (WHERE resolved = FALSE) AS oldest_unresolved_at,
           MAX(created_at) FILTER (WHERE resolved = FALSE) AS newest_unresolved_at
         FROM sys_alerts`,
      ),
      this.ds.query<any[]>(
        `SELECT alert_type, severity, COUNT(*)::int AS count, MAX(created_at) AS last_seen
           FROM sys_alerts
          WHERE resolved = FALSE
          GROUP BY alert_type, severity
          ORDER BY count DESC, last_seen DESC
          LIMIT 12`,
      ),
      this.ds.query<any[]>(
        `SELECT alert_type, severity, title, COALESCE(related_path, '') AS related_path,
                COUNT(*)::int AS count,
                MIN(created_at) AS first_seen,
                MAX(created_at) AS last_seen
           FROM sys_alerts
          WHERE resolved = FALSE
          GROUP BY alert_type, severity, title, COALESCE(related_path, '')
         HAVING COUNT(*) >= 3
          ORDER BY count DESC, last_seen DESC
          LIMIT 12`,
      ),
      this.ds.query<any[]>(
        `SELECT id, alert_type, severity, title, related_path, created_at
           FROM sys_alerts
          WHERE resolved = FALSE
            AND created_at <= NOW() - INTERVAL '7 days'
          ORDER BY created_at ASC
          LIMIT 10`,
      ),
    ]);
    const row = summaryRows[0] ?? {};
    return {
      unresolvedTotal: Number(row.unresolved_total ?? 0),
      actionableOpen: Number(row.actionable_open ?? 0),
      staleOpen: Number(row.stale_open ?? 0),
      stale30dOpen: Number(row.stale_30d_open ?? 0),
      unresolvedIot: Number(row.unresolved_iot ?? 0),
      unresolvedCritical: Number(row.unresolved_critical ?? 0),
      oldestUnresolvedAt: row.oldest_unresolved_at ?? null,
      newestUnresolvedAt: row.newest_unresolved_at ?? null,
      byType: typeRows,
      noisyGroups: noisyRows,
      staleSamples: staleRows,
      operations: {
        safeBulkArchive: 'POST /api/system/alerts/bulk-resolve-stale with dryRun=true by default',
        resolveOne: 'PATCH /api/system/alerts/:id/resolve',
      },
      semantics: {
        actionableOpen: '近 7 天 CRITICAL/WARNING 未处理告警，作为当前值班待办。',
        staleOpen: '超过 7 天仍未处理的历史沉积，应复核后批量归档，不等同当前故障。',
        noisyGroups: '同类型、同标题、同路径重复出现的告警源，用于治理噪音。',
      },
    };
  }

  async getDeliveryHealth() {
    const [recipientRow, recentRows, lastRows] = await Promise.all([
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
      this.ds.query<any[]>(
        `SELECT n.id, n.user_id, n.title, n.biz_id, n.created_at
           FROM sys_notifications n
          WHERE n.notification_type = 'SYSTEM_ALERT'
            AND n.biz_type = 'SYS_ALERT'
          ORDER BY n.created_at DESC
          LIMIT 5`,
      ),
    ]);

    return {
      monitorRecipients: Number(recipientRow[0]?.recipient_count ?? 0),
      alertNotificationsLast24h: Number(recentRows[0]?.notification_count ?? 0),
      lastDeliveries: lastRows,
      deliveryMode: 'STATION_NOTIFICATION',
      failClosed: Number(recipientRow[0]?.recipient_count ?? 0) > 0,
    };
  }

  /** 查询未处理告警列表 */
  async listUnresolved(params: {
    alertType?: string;
    severity?:  string;
    page?:      number;
    limit?:     number;
  }) {
    const page   = Math.max(1, params.page  ?? 1);
    const limit  = Math.min(200, params.limit ?? 50);
    const offset = (page - 1) * limit;

    const conditions = ['resolved = FALSE'];
    const values: any[] = [];
    let idx = 1;

    if (params.alertType) { conditions.push(`alert_type = $${idx++}`); values.push(params.alertType); }
    if (params.severity)  { conditions.push(`severity   = $${idx++}`); values.push(params.severity);  }

    const where = conditions.join(' AND ');
    const [rows, countRow] = await Promise.all([
      this.ds.query<any[]>(
        `SELECT id, alert_type, severity, title, detail, related_path, created_at
         FROM sys_alerts WHERE ${where}
         ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, limit, offset],
      ),
      this.ds.query<any[]>(
        `SELECT COUNT(*) AS total FROM sys_alerts WHERE ${where}`,
        values,
      ),
    ]);

    return { items: rows, total: Number(countRow[0]?.total ?? 0), page, limit };
  }

  /** 查询所有告警（含已处理） */
  async listAll(params: {
    alertId?:   number;
    alertType?: string;
    severity?:  string;
    resolved?:  boolean;
    relatedPath?: string;
    page?:      number;
    limit?:     number;
  }) {
    const page   = Math.max(1, params.page  ?? 1);
    const limit  = Math.min(200, params.limit ?? 50);
    const offset = (page - 1) * limit;

    const conditions: string[] = ['1=1'];
    const values: any[] = [];
    let idx = 1;

    if (params.alertId !== undefined) { conditions.push(`id = $${idx++}`); values.push(params.alertId); }
    if (params.alertType !== undefined) { conditions.push(`alert_type = $${idx++}`); values.push(params.alertType); }
    if (params.severity  !== undefined) { conditions.push(`severity   = $${idx++}`); values.push(params.severity);  }
    if (params.resolved  !== undefined) { conditions.push(`resolved   = $${idx++}`); values.push(params.resolved);  }
    if (params.relatedPath !== undefined) {
      conditions.push(`COALESCE(related_path, '') = $${idx++}`);
      values.push(params.relatedPath);
    }

    const where = conditions.join(' AND ');
    const [rows, countRow] = await Promise.all([
      this.ds.query<any[]>(
        `SELECT id, alert_type, severity, title, detail, related_path,
                resolved, resolved_at, resolved_by, resolved_remark, created_at
         FROM sys_alerts WHERE ${where}
         ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, limit, offset],
      ),
      this.ds.query<any[]>(
        `SELECT COUNT(*) AS total FROM sys_alerts WHERE ${where}`,
        values,
      ),
    ]);

    return { items: rows, total: Number(countRow[0]?.total ?? 0), page, limit };
  }

  /** 处理告警（单向：未处理 → 已处理）*/
  async resolveAlert(id: number, dto: ResolveAlertDto): Promise<void> {
    const rows = await this.ds.query<any[]>(
      `SELECT id, resolved FROM sys_alerts WHERE id = $1`,
      [id],
    );
    if (!rows.length) throw new NotFoundException(`告警 ${id} 不存在`);
    if (rows[0].resolved) throw new ForbiddenException(`告警 ${id} 已处理，不允许重复操作`);

    await this.ds.query(
      `UPDATE sys_alerts
       SET resolved = TRUE, resolved_at = NOW(), resolved_by = $2, resolved_remark = $3
       WHERE id = $1`,
      [id, dto.resolvedBy, dto.resolvedRemark ?? null],
    );
  }

  async bulkResolveStaleAlerts(dto: BulkResolveStaleAlertsDto) {
    const olderThanDays = Math.max(7, Math.min(3650, Math.floor(dto.olderThanDays ?? 30)));
    const maxRows = Math.max(1, Math.min(5000, Math.floor(dto.maxRows ?? 1000)));
    const dryRun = dto.dryRun !== false;

    const conditions = [
      'resolved = FALSE',
      `created_at <= NOW() - ($1::int * INTERVAL '1 day')`,
    ];
    const values: any[] = [olderThanDays];
    let idx = 2;
    if (dto.alertType) {
      conditions.push(`alert_type = $${idx++}`);
      values.push(dto.alertType);
    }
    if (dto.severity) {
      conditions.push(`severity = $${idx++}`);
      values.push(dto.severity);
    }
    if (!dto.includeCritical) {
      conditions.push(`severity <> 'CRITICAL'`);
    }
    const where = conditions.join(' AND ');

    const previewRows = await this.ds.query<any[]>(
      `SELECT COUNT(*)::int AS candidate_count,
              MIN(created_at) AS oldest_at,
              MAX(created_at) AS newest_at
         FROM sys_alerts
        WHERE ${where}`,
      values,
    );
    const samples = await this.ds.query<any[]>(
      `SELECT id, alert_type, severity, title, related_path, created_at
         FROM sys_alerts
        WHERE ${where}
        ORDER BY created_at ASC
        LIMIT 10`,
      values,
    );
    const preview = {
      dryRun,
      olderThanDays,
      maxRows,
      alertType: dto.alertType ?? null,
      severity: dto.severity ?? null,
      includeCritical: dto.includeCritical === true,
      candidateCount: Number(previewRows[0]?.candidate_count ?? 0),
      oldestAt: previewRows[0]?.oldest_at ?? null,
      newestAt: previewRows[0]?.newest_at ?? null,
      samples,
    };

    if (dryRun) return { ...preview, resolvedCount: 0 };
    if (dto.confirm !== 'RESOLVE_STALE_ALERTS') {
      throw new BadRequestException('执行老旧告警归档必须传 confirm=RESOLVE_STALE_ALERTS');
    }
    if (!dto.reason || dto.reason.trim().length < 6) {
      throw new BadRequestException('执行老旧告警归档必须填写不少于 6 个字符的 reason');
    }

    const updateValues = [...values, maxRows, dto.resolvedBy, `批量归档老旧告警：${dto.reason.trim()}`];
    const limitParam = idx;
    const resolvedByParam = idx + 1;
    const remarkParam = idx + 2;
    const rows = await this.ds.query<any[]>(
      `WITH candidates AS (
         SELECT id
           FROM sys_alerts
          WHERE ${where}
          ORDER BY created_at ASC
          LIMIT $${limitParam}
       )
       UPDATE sys_alerts a
          SET resolved = TRUE,
              resolved_at = NOW(),
              resolved_by = $${resolvedByParam},
              resolved_remark = $${remarkParam}
         FROM candidates c
        WHERE a.id = c.id
        RETURNING a.id, a.alert_type, a.severity, a.title`,
      updateValues,
    );
    return {
      ...preview,
      dryRun: false,
      resolvedCount: rows.length,
      resolvedSamples: rows.slice(0, 10),
    };
  }

  private async notifySystemMonitorWatchers(alertId: number, dto: CreateAlertDto): Promise<void> {
    if ((dto.severity ?? 'WARNING') === 'INFO') return;
    const title = `[系统告警] ${dto.title}`.slice(0, 256);
    const content = [
      `级别：${dto.severity ?? 'WARNING'}`,
      `类型：${dto.alertType}`,
      dto.relatedPath ? `路径：${dto.relatedPath}` : null,
      dto.detail ? `详情：${JSON.stringify(dto.detail).slice(0, 800)}` : null,
    ].filter(Boolean).join('\n');

    await this.ds.query(
      `WITH recipients AS (
         SELECT DISTINCT u.user_id
           FROM sys_user u
           JOIN sys_user_role ur ON ur.user_id = u.user_id
           JOIN sys_role_menu_permission rmp ON rmp.role_id = ur.role_id
           JOIN sys_menu m ON m.menu_id = rmp.menu_id
          WHERE u.status = 1
            AND m.menu_code = 'MENU_SYS_MONITOR'
            AND (rmp.perm_codes = '*' OR 'V' = ANY(string_to_array(COALESCE(rmp.perm_codes, ''), ',')))
       )
       INSERT INTO sys_notifications
         (user_id, notification_type, title, content, link_type, link_id, biz_type, biz_id, biz_no, status, created_at)
       SELECT r.user_id, 'SYSTEM_ALERT', $2, $3, 'SYSTEM_ALERT', $1::text, 'SYS_ALERT', $1::text, $4, 'UNREAD', NOW()
       FROM recipients r
       WHERE NOT EXISTS (
         SELECT 1 FROM sys_notifications n
          WHERE n.user_id = r.user_id
            AND n.notification_type = 'SYSTEM_ALERT'
            AND n.biz_type = 'SYS_ALERT'
            AND n.biz_id = $1::text
       )`,
      [alertId, title, content, dto.alertType],
    );
  }
}
