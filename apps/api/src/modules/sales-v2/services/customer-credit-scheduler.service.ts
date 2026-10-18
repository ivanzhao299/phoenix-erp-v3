import { BackgroundTaskService } from '../../background-control/background-task.service';
import { BackgroundBusinessLockService } from '../../background-control/background-business-lock.service';
import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CustomerCreditService } from './customer-credit.service';
import { CronMonitorService } from '../../system-monitor/services/cron-monitor.service';
import { ScopedNotificationRecipientService } from '../../notification/scoped-notification-recipient.service';

/**
 * 客户信用定时任务
 * Sales V2 Phase 5 — 每天凌晨 02:00 扫描全量客户
 *
 * 执行顺序：
 *   1. 重算所有客户 credit_used / credit_status / last_overdue_at
 *   2. 自动冻结严重逾期客户（overdueDays > payment_terms * 2）
 *   3. 写 sys_notifications：CUSTOMER_OVERDUE / CUSTOMER_FROZEN / CUSTOMER_OVER_LIMIT
 *
 * 防并发：pg_try_advisory_lock（key = hashtext('credit_scheduler')）
 */
@Injectable()
export class CustomerCreditSchedulerService {
  private readonly logger = new Logger(CustomerCreditSchedulerService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly creditService: CustomerCreditService,
    private readonly cronMon: CronMonitorService,
    private readonly recipients: ScopedNotificationRecipientService,
    private readonly backgroundTasks: BackgroundTaskService,
    private readonly businessLocks: BackgroundBusinessLockService,
  ) {}

  @Cron('0 0 2 * * *', { name: 'credit_daily_refresh', timeZone: 'Asia/Vientiane' })
  async runDailyCreditRefresh() {
    await this.backgroundTasks.runScheduled('sales.credit.daily', 'LOCAL', async () => {
      const locked = await this.businessLocks.run('credit_scheduler', async () => {
        try {
          await this.doRefresh();
          return true;
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error('[BackgroundScheduler] business task failed');
          await this.cronMon.fail('credit_daily_refresh', message);
          return false;
        }
      });
      if (!locked.acquired) this.logger.log('[BackgroundScheduler] another instance holds the task lock; skipped');
      else if (locked.value) await this.cronMon.ok('credit_daily_refresh');
    });
  }

  /**
   * 手动触发（测试 / 补跑）
   */
  async runManually(): Promise<{
    totalCustomers: number;
    refreshed: number;
    frozen: number;
    overdue: number;
    overLimit: number;
    durationMs: number;
  }> {
    return this.backgroundTasks.run('sales.credit.manual', 'LOCAL', async () => {
      const t0 = Date.now();
      const result = await this.businessLocks.run('credit_scheduler', () => this.doRefresh());
      if (!result.acquired) throw new ConflictException('BACKGROUND_BUSINESS_TASK_BUSY');
      return { ...result.value, durationMs: Date.now() - t0 };
    });
  }

  // ── 内部执行 ──────────────────────────────────────────────────────────────

  private async doRefresh() {
    this.logger.log('[CreditScheduler] 开始每日信用刷新…');

    // 取所有活跃客户
    const customers = await this.ds.query(
      `SELECT id, customer_no, customer_name, company_code, payment_terms, status, credit_status
       FROM sal_customers
       WHERE status NOT IN ('BLACKLIST')
       ORDER BY id ASC`,
    );

    let refreshed  = 0;
    let frozen     = 0;
    let overdue    = 0;
    let overLimit  = 0;
    const notifyBatch: Array<{ type: string; title: string; body: string; company_code: string }> = [];

    for (const cust of customers) {
      try {
        // 1. 刷新信用
        await this.creditService.refreshCustomerCredit(cust.id);
        refreshed++;

        // 2. 重新读取最新状态
        const updated = await this.ds.query(
          `SELECT credit_status, credit_used, payment_terms, last_overdue_at
           FROM sal_customers WHERE id = $1`, [cust.id],
        );
        const u = updated[0];
        if (!u) continue;

        const creditStatus = u.credit_status;

        // 3. 统计 + 推通知
        if (creditStatus === 'OVERDUE') {
          overdue++;
          notifyBatch.push({
            type:         'CUSTOMER_OVERDUE',
            title:        `客户逾期预警：${cust.customer_name}`,
            body:         `客户「${cust.customer_name}」存在逾期应收款，请财务跟进催收。`,
            company_code: cust.company_code,
          });
        } else if (creditStatus === 'OVER_LIMIT') {
          overLimit++;
          notifyBatch.push({
            type:         'CUSTOMER_OVER_LIMIT',
            title:        `客户超额预警：${cust.customer_name}`,
            body:         `客户「${cust.customer_name}」应收余额已超出信用额度，请销售主管审核。`,
            company_code: cust.company_code,
          });
        }

        // 4. 自动冻结判断
        if (cust.status !== 'FROZEN' && creditStatus === 'OVERDUE') {
          const wasFrozen = await this.creditService.autoFreezeCustomer(cust.id);
          if (wasFrozen) {
            frozen++;
            notifyBatch.push({
              type:         'CUSTOMER_FROZEN',
              title:        `客户已自动冻结：${cust.customer_name}`,
              body:         `客户「${cust.customer_name}」严重逾期，系统已自动冻结账户，暂停接单，待财务处理。`,
              company_code: cust.company_code,
            });
          }
        }
      } catch (e: any) {
        this.logger.error(`[CreditScheduler] 客户 ${cust.id} 刷新失败: ${e.message}`);
      }
    }

    // 按公司 DataScope ∩ 信用查看权限实名投递。
    for (const n of notifyBatch) {
      const userIds = await this.recipients.resolve(n.company_code, ['MENU_SALES2_CREDIT']);
      for (const userId of userIds) await this.ds.query(
        `INSERT INTO sys_notifications
           (user_id, notification_type, title, content, company_code, status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'UNREAD', NOW())
         ON CONFLICT DO NOTHING`,
        [userId, n.type, n.title, n.body, n.company_code],
      );
    }

    this.logger.log(
      `[CreditScheduler] 完成 — 共 ${customers.length} 客户，` +
      `刷新 ${refreshed}，逾期 ${overdue}，超额 ${overLimit}，冻结 ${frozen}`,
    );

    return {
      totalCustomers: customers.length,
      refreshed,
      frozen,
      overdue,
      overLimit,
    };
  }
}
