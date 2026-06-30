import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CustomerCreditService } from './customer-credit.service';
import { CronMonitorService } from '../../system-monitor/services/cron-monitor.service';

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
  ) {}

  @Cron('0 0 2 * * *', { name: 'credit_daily_refresh', timeZone: 'Asia/Vientiane' })
  async runDailyCreditRefresh() {
    // 防并发 Advisory Lock
    const lockRows = await this.ds.query(
      `SELECT pg_try_advisory_lock(hashtext('credit_scheduler')) AS acquired`,
    );
    if (!lockRows[0]?.acquired) {
      this.logger.log('[CreditScheduler] 其他实例正在运行，跳过本次');
      return;
    }

    try {
      await this.doRefresh();
      await this.cronMon.ok('credit_daily_refresh');
    } catch (e: any) {
      await this.cronMon.fail('credit_daily_refresh', e?.message ?? String(e));
    } finally {
      await this.ds.query(
        `SELECT pg_advisory_unlock(hashtext('credit_scheduler'))`,
      ).catch(() => {});
    }
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
    const t0 = Date.now();
    const result = await this.doRefresh();
    return { ...result, durationMs: Date.now() - t0 };
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

    // 批量写通知（去重：同类型同公司同天仅写一次）
    for (const n of notifyBatch) {
      await this.ds.query(
        `INSERT INTO sys_notifications
           (notification_type, title, content, company_code, status, created_at)
         VALUES ($1, $2, $3, $4, 'UNREAD', NOW())
         ON CONFLICT DO NOTHING`,
        [n.type, n.title, n.body, n.company_code],
      ).catch(e => this.logger.warn(`写通知失败: ${e.message}`));
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
