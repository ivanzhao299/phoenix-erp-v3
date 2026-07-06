/**
 * Phoenix ERP V3 — 错误日志 Service
 * Production Stabilization Phase 1
 */
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface WriteErrorLogDto {
  errorType:     string;
  httpStatus?:   number;
  errorMessage:  string;
  stackTrace?:   string;
  pgErrorCode?:  string;
  requestMethod?: string;
  requestPath?:  string;
  requestBody?:  Record<string, any> | null;
  userId?:       number | null;
  username?:     string;
  ipAddress?:    string;
  userAgent?:    string;
}

@Injectable()
export class SysErrorLogsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  /** 写入一条错误日志（异步，不阻塞响应链） */
  async writeLog(dto: WriteErrorLogDto): Promise<void> {
    await this.ds.query(
      `INSERT INTO sys_error_logs
        (error_type, http_status, error_message, stack_trace, pg_error_code,
         request_method, request_path, request_body,
         user_id, username, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        dto.errorType,
        dto.httpStatus ?? null,
        dto.errorMessage,
        dto.stackTrace ?? null,
        dto.pgErrorCode ?? null,
        dto.requestMethod ?? null,
        dto.requestPath ?? null,
        dto.requestBody ? JSON.stringify(dto.requestBody) : null,
        dto.userId ?? null,
        dto.username ?? null,
        dto.ipAddress ?? null,
        dto.userAgent ?? null,
      ],
    );
  }

  /** 查询错误列表（管理员分页查询） */
  async list(params: {
    errorType?: string;
    httpStatus?: number;
    page?: number;
    limit?: number;
  }) {
    const page  = Math.max(1, params.page  ?? 1);
    const limit = Math.min(200, params.limit ?? 50);
    const offset = (page - 1) * limit;

    const conditions: string[] = ['1=1'];
    const values: any[] = [];
    let idx = 1;

    if (params.errorType) {
      conditions.push(`error_type = $${idx++}`);
      values.push(params.errorType);
    }
    if (params.httpStatus) {
      conditions.push(`http_status = $${idx++}`);
      values.push(params.httpStatus);
    }

    const where = conditions.join(' AND ');
    const [rows, countRow] = await Promise.all([
      this.ds.query<any[]>(
        `SELECT id, error_type, http_status, error_message, pg_error_code,
                request_method, request_path, user_id, username, ip_address, created_at
         FROM sys_error_logs
         WHERE ${where}
         ORDER BY created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, limit, offset],
      ),
      this.ds.query<any[]>(
        `SELECT COUNT(*) AS total FROM sys_error_logs WHERE ${where}`,
        values,
      ),
    ]);

    return {
      items: rows,
      total: Number(countRow[0]?.total ?? 0),
      page,
      limit,
    };
  }

  /** 获取单条错误详情（含完整 stack_trace，仅 ADMIN 可调用） */
  async getDetail(id: number) {
    const rows = await this.ds.query<any[]>(
      `SELECT * FROM sys_error_logs WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** 根因聚合：把一屏重复 500/PG 错误压缩成可处理事项 */
  async getGroupedSummary(params: { hours?: number; limit?: number }) {
    const hours = Math.max(1, Math.min(168, Math.floor(params.hours ?? 24)));
    const limit = Math.max(5, Math.min(100, Math.floor(params.limit ?? 20)));
    const groups = await this.ds.query<any[]>(
      `WITH normalized AS (
         SELECT
           id,
           error_type,
           http_status,
           pg_error_code,
           request_method,
           regexp_replace(COALESCE(request_path, ''), '\\?.*$', '') AS path_key,
           LEFT(COALESCE(error_message, ''), 220) AS message_key,
           username,
           created_at
          FROM sys_error_logs
         WHERE created_at > NOW() - ($1::int * INTERVAL '1 hour')
       )
       SELECT
         error_type,
         http_status,
         pg_error_code,
         request_method,
         path_key,
         message_key,
         COUNT(*)::int AS count,
         COUNT(DISTINCT username)::int AS affected_users,
         MIN(created_at) AS first_seen,
         MAX(created_at) AS last_seen,
         MAX(id)::int AS latest_id
        FROM normalized
       GROUP BY error_type, http_status, pg_error_code, request_method, path_key, message_key
       ORDER BY count DESC, last_seen DESC
       LIMIT $2`,
      [hours, limit],
    );
    const totals = await this.ds.query<any[]>(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE http_status >= 500)::int AS server_errors,
         COUNT(*) FILTER (WHERE http_status BETWEEN 400 AND 499)::int AS permission_or_client_errors,
         COUNT(DISTINCT regexp_replace(COALESCE(request_path, ''), '\\?.*$', ''))::int AS affected_paths
        FROM sys_error_logs
       WHERE created_at > NOW() - ($1::int * INTERVAL '1 hour')`,
      [hours],
    );
    const top = groups[0] ?? null;
    return {
      windowHours: hours,
      total: Number(totals[0]?.total ?? 0),
      serverErrors: Number(totals[0]?.server_errors ?? 0),
      permissionOrClientErrors: Number(totals[0]?.permission_or_client_errors ?? 0),
      affectedPaths: Number(totals[0]?.affected_paths ?? 0),
      topRootCause: top,
      groups,
      semantics: {
        groupKey: 'error_type + http_status + pg_error_code + method + normalized path + error message excerpt',
        latestId: '点击 latest_id 可查看完整堆栈，避免在重复行里人工翻找。',
      },
    };
  }
}
