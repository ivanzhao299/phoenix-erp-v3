/**
 * Phoenix ERP V3 — 生产配置 Service
 * Production Stabilization Phase 1
 *
 * 安全约束：
 *   - is_readonly=true 的配置只能读，不能通过 API 修改
 *   - 所有修改必须记录 updated_by / updated_at
 *   - 修改同步写 sys_operation_logs（由 OperationLogInterceptor 兜底）
 */
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface UpdateConfigDto {
  configValue: string;
  updatedBy:   string;
}

@Injectable()
export class SysConfigsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  /** 按 key 读取配置值（字符串） */
  async getValue(key: string): Promise<string | null> {
    const rows = await this.ds.query<any[]>(
      `SELECT config_value FROM sys_configs WHERE config_key = $1`,
      [key],
    );
    return rows[0]?.config_value ?? null;
  }

  /** 读取配置值并转为整数（带默认值） */
  async getInt(key: string, defaultVal: number): Promise<number> {
    const v = await this.getValue(key);
    const n = v != null ? parseInt(v, 10) : NaN;
    return isNaN(n) ? defaultVal : n;
  }

  /** 读取配置值并转为布尔值 */
  async getBool(key: string, defaultVal: boolean): Promise<boolean> {
    const v = await this.getValue(key);
    if (v == null) return defaultVal;
    return v.toLowerCase() === 'true' || v === '1';
  }

  /** 列出配置（按分组，不返回加密值明文） */
  async list(group?: string) {
    const rows = await this.ds.query<any[]>(
      `SELECT id, config_group, config_key,
              CASE WHEN is_encrypted THEN '***' ELSE config_value END AS config_value,
              value_type, description, is_encrypted, is_readonly,
              created_by, created_at, updated_by, updated_at
       FROM sys_configs
       WHERE ($1::text IS NULL OR config_group = $1)
       ORDER BY config_group, config_key`,
      [group ?? null],
    );
    return rows;
  }

  /** 更新配置值 */
  async update(key: string, dto: UpdateConfigDto): Promise<void> {
    const rows = await this.ds.query<any[]>(
      `SELECT id, is_readonly FROM sys_configs WHERE config_key = $1`,
      [key],
    );
    if (!rows.length) throw new NotFoundException(`配置项 ${key} 不存在`);
    if (rows[0].is_readonly) throw new ForbiddenException(`配置项 ${key} 为只读，不允许修改`);

    await this.ds.query(
      `UPDATE sys_configs
       SET config_value = $2, updated_by = $3, updated_at = NOW()
       WHERE config_key = $1`,
      [key, dto.configValue, dto.updatedBy],
    );
  }

  /** 批量获取一组配置（提升性能，避免 N 次查询） */
  async getBatch(keys: string[]): Promise<Record<string, string>> {
    if (!keys.length) return {};
    const rows = await this.ds.query<any[]>(
      `SELECT config_key, config_value FROM sys_configs WHERE config_key = ANY($1)`,
      [keys],
    );
    const result: Record<string, string> = {};
    for (const r of rows) result[r.config_key] = r.config_value;
    return result;
  }
}
