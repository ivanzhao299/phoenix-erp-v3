/**
 * Phoenix ERP V3 — 异常告警 Service
 * Production Stabilization Phase 1
 *
 * 安全约束：
 *   - 不允许物理删除告警（append-only）
 *   - 只允许将 resolved = false → true（单向）
 *   - 所有 resolved 操作必须记录 resolved_by / resolved_at / resolved_remark
 */
import { Injectable, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
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

@Injectable()
export class SysAlertsService {
  private readonly logger = new Logger(SysAlertsService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  /** 新建告警（由 SystemMonitorService / AllExceptionsFilter 调用） */
  async createAlert(dto: CreateAlertDto): Promise<number> {
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
    alertType?: string;
    severity?:  string;
    resolved?:  boolean;
    page?:      number;
    limit?:     number;
  }) {
    const page   = Math.max(1, params.page  ?? 1);
    const limit  = Math.min(200, params.limit ?? 50);
    const offset = (page - 1) * limit;

    const conditions: string[] = ['1=1'];
    const values: any[] = [];
    let idx = 1;

    if (params.alertType !== undefined) { conditions.push(`alert_type = $${idx++}`); values.push(params.alertType); }
    if (params.severity  !== undefined) { conditions.push(`severity   = $${idx++}`); values.push(params.severity);  }
    if (params.resolved  !== undefined) { conditions.push(`resolved   = $${idx++}`); values.push(params.resolved);  }

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
