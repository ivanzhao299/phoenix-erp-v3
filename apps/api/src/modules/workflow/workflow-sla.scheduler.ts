import { BackgroundTaskService } from '../background-control/background-task.service';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { WorkflowSlaService } from './workflow-sla.service';
import { CronMonitorService } from '../system-monitor/services/cron-monitor.service';

/**
 * Workflow SLA 调度器
 * 每 15 分钟扫描超期任务、发催办、执行升级。
 *
 * 多实例部署安全：
 *   - 使用 pg_try_advisory_lock / pg_advisory_unlock 确保只有一个实例运行
 *   - 本进程 running flag 作为二级保护（防止同一实例内并发）
 *
 * Lock key: hashtext('workflow_sla_scheduler')
 *   → PostgreSQL 内建函数，将字符串映射到 int4，适合用作 advisory lock key
 */
@Injectable()
export class WorkflowSlaScheduler {
  private readonly logger = new Logger(WorkflowSlaScheduler.name);
  private running = false;

  constructor(
    private readonly sla: WorkflowSlaService,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cronMon: CronMonitorService,
    private readonly backgroundTasks: BackgroundTaskService,
  ) {}

  @Cron('0 */15 * * * *')   // 每 15 分钟整点触发（:00, :15, :30, :45）
  async handleSlaCheck(): Promise<void> {
    await this.backgroundTasks.runScheduled('workflow.sla', 'NOTIFICATION', async () => {
      // ── 二级保护：本进程 running flag ──────────────────────────────────────────
      if (this.running) {
        this.logger.warn('[SLA Scheduler] skipped — previous run still in progress (local)');
        return;
      }

      // ── 获取 PostgreSQL advisory lock ─────────────────────────────────────────
      let lockAcquired = false;
      try {
        const [row] = await this.ds.query<[{ acquired: boolean }]>(
          `SELECT pg_try_advisory_lock(hashtext('workflow_sla_scheduler')) AS acquired`,
        );
        lockAcquired = row?.acquired === true;
      } catch (err) {
        this.logger.warn(`[SLA Scheduler] advisory lock query failed: ${(err as any)?.message ?? err}`);
        return;
      }

      if (!lockAcquired) {
        this.logger.log('[SLA Scheduler] skipped — another instance holds the lock');
        return;
      }

      this.logger.log('[SLA Scheduler] acquired advisory lock — starting SLA check');
      this.running = true;

      try {
        await this.sla.checkOverdueTasks();
        this.logger.log('[SLA Scheduler] SLA check completed');
        await this.cronMon.ok('workflow_sla');
      } catch (err) {
        this.logger.error(`[SLA Scheduler] SLA check failed: ${(err as any)?.message ?? err}`);
        await this.cronMon.fail('workflow_sla', (err as any)?.message ?? String(err));
      } finally {
        this.running = false;
        // 释放 advisory lock
        try {
          await this.ds.query(
            `SELECT pg_advisory_unlock(hashtext('workflow_sla_scheduler'))`,
          );
          this.logger.log('[SLA Scheduler] released advisory lock');
        } catch (unlockErr) {
          this.logger.warn(`[SLA Scheduler] advisory unlock failed (will auto-expire on disconnect): ${(unlockErr as any)?.message}`);
        }
      }
    });
  }
}
