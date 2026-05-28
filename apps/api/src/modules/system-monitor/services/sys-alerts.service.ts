/**
 * Phoenix ERP V3 — 异常告警 Service
 * Production Stabilization Phase 1
 *
 * 安全约束：
 *   - 不允许物理删除告警（append-only）
 *   - 只允许将 resolved = false → true（单向）
 *   - 所有 resolved 操作必须记录 resolved_by / resolved_at / resolved_remark
 */
import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
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
    return Number(rows[0]?.id);
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
}
