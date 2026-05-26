import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WorkflowSlaService } from './workflow-sla.service';

/**
 * Workflow SLA 调度器
 * 每 15 分钟扫描一次超期任务、发催办、执行升级
 */
@Injectable()
export class WorkflowSlaScheduler {
  private readonly logger = new Logger(WorkflowSlaScheduler.name);
  private running = false;

  constructor(private readonly sla: WorkflowSlaService) {}

  @Cron('0 */15 * * * *')   // 每 15 分钟整点触发（00, 15, 30, 45 分）
  async handleSlaCheck(): Promise<void> {
    if (this.running) {
      this.logger.warn('[SLA Scheduler] Previous run still in progress, skipping');
      return;
    }
    this.running = true;
    try {
      await this.sla.checkOverdueTasks();
    } finally {
      this.running = false;
    }
  }
}
