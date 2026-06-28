/**
 * Phoenix ERP V3 — 备份记录 / 计划配置 Service
 *
 * 安全边界:不在应用内执行 pg_dump/恢复。requestBackup 只写一条 PENDING 记录,
 * 由服务器运维 runner(scripts/ops/backup-runner.sh)+ cron 拾取执行并回写状态。
 */
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface BackupConfig {
  enabled:        boolean;
  cron_expr:      string;
  retention_days: number;
}

const DEFAULT_CONFIG: BackupConfig = { enabled: true, cron_expr: '0 3 * * *', retention_days: 30 };
const VALID_TYPES = ['FULL', 'SCHEMA'] as const;

@Injectable()
export class SysBackupService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** 备份记录列表(历史 + 进行中 + 待执行) */
  async listRecords(params: { status?: string; page?: number; limit?: number }) {
    const page   = Math.max(1, params.page ?? 1);
    const limit  = Math.min(200, params.limit ?? 50);
    const offset = (page - 1) * limit;

    const conds: string[] = ['1=1'];
    const vals: any[] = [];
    let idx = 1;
    if (params.status) { conds.push(`status = $${idx++}`); vals.push(params.status); }
    const where = conds.join(' AND ');

    const [rows, countRow] = await Promise.all([
      this.ds.query<any[]>(
        `SELECT id, backup_no, backup_type, trigger_type, status, file_path,
                size_bytes, operator, note, started_at, finished_at, created_at
         FROM sys_backup_records WHERE ${where}
         ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...vals, limit, offset],
      ),
      this.ds.query<any[]>(`SELECT COUNT(*) AS total FROM sys_backup_records WHERE ${where}`, vals),
    ]);
    return { items: rows, total: Number(countRow[0]?.total ?? 0), page, limit };
  }

  /** 手动请求备份:只入队(PENDING),不在应用内执行 pg_dump */
  async requestBackup(backupType: string | undefined, operator?: string) {
    const type = (backupType ?? 'FULL').toUpperCase();
    if (!(VALID_TYPES as readonly string[]).includes(type)) {
      throw new BadRequestException(`无效备份类型: ${type}`);
    }
    // 已有 PENDING/RUNNING 时不重复入队,避免堆积
    const [busy] = await this.ds.query<any[]>(
      `SELECT id, backup_no FROM sys_backup_records WHERE status IN ('PENDING','RUNNING') ORDER BY id DESC LIMIT 1`,
    );
    if (busy) {
      throw new BadRequestException(`已有备份任务 ${busy.backup_no} 在队列/执行中,请稍后`);
    }
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const [seq]   = await this.ds.query<any[]>(`SELECT nextval('seq_backup_no') AS n`);
    const no      = `BK-${dateStr}-${String(seq.n).padStart(5, '0')}`;
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO sys_backup_records (backup_no, backup_type, trigger_type, status, operator, note)
       VALUES ($1,$2,'MANUAL','PENDING',$3,'手动请求,等待运维 runner 执行')
       RETURNING id, backup_no, status`,
      [no, type, operator ?? null],
    );
    return row[0];
  }

  /** 计划/保留配置(单行;缺行返回默认) */
  async getConfig(): Promise<BackupConfig> {
    const [row] = await this.ds.query<any[]>(
      `SELECT enabled, cron_expr, retention_days FROM sys_backup_config WHERE id = 1`,
    );
    return row ?? DEFAULT_CONFIG;
  }

  async putConfig(dto: { enabled?: boolean; cronExpr?: string; retentionDays?: number }) {
    const cur = await this.getConfig();
    const enabled  = dto.enabled        ?? cur.enabled;
    const cronExpr = dto.cronExpr       ?? cur.cron_expr;
    const retain   = dto.retentionDays  ?? cur.retention_days;
    if (retain < 1 || retain > 3650) throw new BadRequestException('保留天数应在 1~3650');
    // L4:cron 表达式基本格式校验(5 段:分 时 日 月 周),防写入畸形串致定时静默失效
    if (cronExpr.trim().split(/\s+/).length !== 5) {
      throw new BadRequestException('cron 表达式应为 5 段（分 时 日 月 周），例：0 3 * * *');
    }
    await this.ds.query(
      `INSERT INTO sys_backup_config (id, enabled, cron_expr, retention_days, updated_at)
       VALUES (1,$1,$2,$3,NOW())
       ON CONFLICT (id) DO UPDATE SET
         enabled = EXCLUDED.enabled, cron_expr = EXCLUDED.cron_expr,
         retention_days = EXCLUDED.retention_days, updated_at = NOW()`,
      [enabled, cronExpr, retain],
    );
    return this.getConfig();
  }
}
