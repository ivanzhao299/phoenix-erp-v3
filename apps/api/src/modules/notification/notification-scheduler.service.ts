import { BackgroundTaskService } from '../background-control/background-task.service';
/**
 * NotificationSchedulerService — 定时任务规则触发器
 *
 * 每分钟扫 sys_notification_rules WHERE event_type='SCHEDULE'，
 * 解析 trigger_config.cron 表达式与当前时间匹配则 fire。
 *
 * 使用极简的 cron 匹配（分 时 日 月 周）。复杂表达式（@daily / L / W）
 * 暂不支持，按 cron-parser 思路实现。
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { CronMonitorService } from '../system-monitor/services/cron-monitor.service';

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly dispatcher: NotificationDispatcherService,
    private readonly cronMon: CronMonitorService,
    private readonly backgroundTasks: BackgroundTaskService,
  ) {}

  /** 每分钟扫一次 SCHEDULE 规则 */
  @Cron('0 * * * * *')
  async tick(): Promise<void> {
    await this.backgroundTasks.runScheduled('notification.tick', 'NOTIFICATION', async () => {
      await this.cronMon.runGuarded('notification_tick', async () => {
        const now = new Date();
        const rules = await this.ds.query(
          `SELECT rule_code, category, trigger_config
             FROM sys_notification_rules
            WHERE status='ACTIVE' AND event_type='SCHEDULE'`,
        ).catch(() => []);

        for (const r of rules) {
          const cron = r.trigger_config?.cron;
          if (typeof cron !== 'string') continue;
          if (!this.cronMatches(cron, now)) continue;

          const ctx: Record<string, any> = {
            scheduled_at: now.toISOString(),
            yesterday_date: this.fmtDate(new Date(now.getTime() - 86400000)),
            today_date: this.fmtDate(now),
          };

          await this.dispatcher.fire(r.rule_code, ctx).catch((e) =>
            this.logger.error(`[scheduler] fire ${r.rule_code} fail: ${e?.message}`),
          );
        }
      });
    });
  }

  /**
   * 极简 cron 匹配：5 段（分 时 日 月 周）。
   * 支持通配符、每 N 分钟（星号斜杠 N）、单值、逗号分隔。
   * 不支持 - 范围 / L W # 复杂语法（后续可换 cron-parser 库）。
   */
  private cronMatches(expr: string, date: Date): boolean {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return false;
    const min = date.getMinutes();
    const hour = date.getHours();
    const dom = date.getDate();
    const mon = date.getMonth() + 1;
    const dow = date.getDay(); // 0=Sun
    return (
      this.match(parts[0], min) &&
      this.match(parts[1], hour) &&
      this.match(parts[2], dom) &&
      this.match(parts[3], mon) &&
      this.match(parts[4], dow)
    );
  }

  private match(field: string, value: number): boolean {
    if (field === '*') return true;
    if (field.startsWith('*/')) {
      const step = parseInt(field.slice(2), 10);
      return step > 0 && value % step === 0;
    }
    return field.split(',').some((seg) => {
      const n = parseInt(seg, 10);
      return !Number.isNaN(n) && n === value;
    });
  }

  private fmtDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
