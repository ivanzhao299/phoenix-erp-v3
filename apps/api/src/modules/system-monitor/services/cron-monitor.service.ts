import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { API_BOOTSTRAP_SCHEMA_CONTRACT, assertExistingSchema } from '../../../common/database/schema-compatibility';
import { SysAlertsService } from './sys-alerts.service';

/**
 * G126 · Cron 心跳自监控（评分补强 P6）
 *
 * 每个 @Cron 用 ok()/fail() 或 runGuarded() 上报，落 sys_cron_heartbeat；
 * 失败时再写 sys_alerts(CRON_FAILURE, CRITICAL)，由 all-exceptions/告警链推人。
 *
 * 设计：只依赖 DataSource（裸 SQL），注册为 @Global，任何模块免 import 即可注入；
 *   不抛异常（监控不能拖垮被监控的 cron）。
 * 表结构由受控 schema track 提供；启动只检查元数据。
 */
@Injectable()
export class CronMonitorService implements OnModuleInit {
  private readonly logger = new Logger(CronMonitorService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly alerts: SysAlertsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await assertExistingSchema(this.ds.query.bind(this.ds), {
      sys_cron_heartbeat: API_BOOTSTRAP_SCHEMA_CONTRACT.tables.sys_cron_heartbeat,
    });
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
    await this.alerts
      .createAlert({
        alertType: 'CRON_FAILURE',
        severity: 'CRITICAL',
        title: `定时任务失败：${jobName}`,
        detail: { jobName, errorMessage: (detail || '').slice(0, 2000) },
        relatedPath: `cron:${jobName}`,
      })
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
