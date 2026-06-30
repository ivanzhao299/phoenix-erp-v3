import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * G126 · Cron 心跳自监控（评分补强 P6）
 *
 * 每个 @Cron 用 ok()/fail() 或 runGuarded() 上报，落 sys_cron_heartbeat；
 * 失败时再写 sys_alerts(CRON_FAILURE, CRITICAL)，由 all-exceptions/告警链推人。
 *
 * 设计：只依赖 DataSource（裸 SQL），注册为 @Global，任何模块免 import 即可注入；
 *   不抛异常（监控不能拖垮被监控的 cron）。
 * 表 sys_cron_heartbeat 由 generic-crud bootstrap 幂等建。
 */
@Injectable()
export class CronMonitorService implements OnModuleInit {
  private readonly logger = new Logger(CronMonitorService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** 幂等建心跳表（本模块自持，不依赖 generic-crud bootstrap） */
  async onModuleInit(): Promise<void> {
    await this.ds
      .query(`
        CREATE TABLE IF NOT EXISTS sys_cron_heartbeat (
          job_name        VARCHAR(80) PRIMARY KEY,
          last_run_at     TIMESTAMP,
          last_status     VARCHAR(16),
          last_detail     TEXT,
          last_success_at TIMESTAMP,
          last_failure_at TIMESTAMP,
          success_count   BIGINT DEFAULT 0,
          fail_count      BIGINT DEFAULT 0,
          updated_at      TIMESTAMP DEFAULT NOW()
        )`)
      .catch((e) => this.logger.warn(`[cron-monitor] 建表失败（忽略）: ${e?.message}`));
  }

  /** 成功上报：刷新 last_run/last_success + success_count+1 */
  async ok(jobName: string, detail?: string): Promise<void> {
    await this.upsert(jobName, 'SUCCESS', detail ?? null).catch((e) =>
      this.logger.warn(`[cron-monitor] heartbeat ok 写入失败 ${jobName}: ${e?.message}`),
    );
  }

  /** 失败上报：刷新 last_run/last_failure + fail_count+1，并写 sys_alerts(CRITICAL) */
  async fail(jobName: string, detail: string): Promise<void> {
    await this.upsert(jobName, 'FAILED', detail).catch((e) =>
      this.logger.warn(`[cron-monitor] heartbeat fail 写入失败 ${jobName}: ${e?.message}`),
    );
    await this.ds
      .query(
        `INSERT INTO sys_alerts (alert_type, severity, title, detail, related_path, created_at)
         VALUES ('CRON_FAILURE', 'CRITICAL', $1, $2, $3, NOW())`,
        [`定时任务失败：${jobName}`, (detail || '').slice(0, 2000), `cron:${jobName}`],
      )
      .catch((e) => this.logger.warn(`[cron-monitor] 告警写入失败 ${jobName}: ${e?.message}`));
  }

  /** 包裹整个 cron 体：自动上报成功/失败 + 告警；永不抛（cron 不应崩） */
  async runGuarded<T>(jobName: string, fn: () => Promise<T>): Promise<T | undefined> {
    try {
      const r = await fn();
      await this.ok(jobName);
      return r;
    } catch (e: any) {
      const msg = e?.message || String(e);
      this.logger.error(`[cron:${jobName}] 执行失败: ${msg}`);
      await this.fail(jobName, msg);
      return undefined;
    }
  }

  private async upsert(jobName: string, status: 'SUCCESS' | 'FAILED', detail: string | null): Promise<void> {
    const okCol = status === 'SUCCESS' ? 'last_success_at = NOW(), success_count = sys_cron_heartbeat.success_count + 1' : '';
    const failCol = status === 'FAILED' ? 'last_failure_at = NOW(), fail_count = sys_cron_heartbeat.fail_count + 1' : '';
    const extra = [okCol, failCol].filter(Boolean).join(', ');
    await this.ds.query(
      `INSERT INTO sys_cron_heartbeat (job_name, last_run_at, last_status, last_detail,
            ${status === 'SUCCESS' ? 'last_success_at, success_count' : 'last_failure_at, fail_count'}, updated_at)
       VALUES ($1, NOW(), $2, $3, NOW(), 1, NOW())
       ON CONFLICT (job_name) DO UPDATE SET
         last_run_at = NOW(), last_status = EXCLUDED.last_status, last_detail = EXCLUDED.last_detail,
         ${extra}, updated_at = NOW()`,
      [jobName, status, detail],
    );
  }
}
