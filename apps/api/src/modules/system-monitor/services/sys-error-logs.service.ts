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
}
