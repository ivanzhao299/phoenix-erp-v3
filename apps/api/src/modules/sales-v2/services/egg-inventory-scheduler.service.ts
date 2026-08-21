import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EggInventoryService } from './egg-inventory.service';
import { CronMonitorService } from '../../system-monitor/services/cron-monitor.service';
import { ScopedNotificationRecipientService } from '../../notification/scoped-notification-recipient.service';

/**
 * EggInventorySchedulerService — Sales V2 Phase 7
 *
 * 每日凌晨 01:00 执行：
 *   1. 扫描过期批次 → markExpiredBatches()
 *   2. 扫描临期库存（≤7天）→ 写 sys_notifications
 *   3. 统计损耗 KPI
 *
 * 分布式锁：pg_try_advisory_lock(hashtext('egg_inventory_scheduler'))
 */
@Injectable()
export class EggInventorySchedulerService {
  private readonly logger = new Logger(EggInventorySchedulerService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly eggInventory: EggInventoryService,
    private readonly cronMon: CronMonitorService,
    private readonly recipients: ScopedNotificationRecipientService,
  ) {}

  // ── 每日 01:00 鸡蛋库存维护 ─────────────────────────────────────────────────

  @Cron('0 0 1 * * *', {
    name: 'egg_inventory_daily',
    timeZone: 'Asia/Vientiane',
  })
  async runDailyMaintenance() {
    this.logger.log('[EggScheduler] 开始每日库存维护...');
    const start = Date.now();

    const [lockRow] = await this.ds.query(
      `SELECT pg_try_advisory_lock(hashtext('egg_inventory_scheduler')) AS acquired`,
    );
    if (!lockRow?.acquired) {
      this.logger.warn('[EggScheduler] 未获得分布式锁，跳过本次执行');
      return;
    }

    try {
      const stats = await this.runMaintenance();
      this.logger.log(
        `[EggScheduler] 完成: 过期=${stats.expiredBatches} 临期=${stats.expiringBatches} 耗时=${stats.durationMs}ms`,
      );
      await this.cronMon.ok('egg_inventory_daily', `expired=${stats.expiredBatches} expiring=${stats.expiringBatches}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`[EggScheduler] 执行失败: ${msg}`);
      await this.cronMon.fail('egg_inventory_daily', msg);
    } finally {
      await this.ds.query(`SELECT pg_advisory_unlock(hashtext('egg_inventory_scheduler'))`);
    }

    this.logger.log(`[EggScheduler] 本轮耗时 ${Date.now() - start}ms`);
  }

  /** 手动触发（供管理端 API 调用） */
  async runManually(): Promise<Record<string, unknown>> {
    this.logger.log('[EggScheduler] 手动触发库存维护...');
    return this.runMaintenance();
  }

  // ── 核心任务 ─────────────────────────────────────────────────────────────────

  private async runMaintenance(): Promise<{
    expiredBatches: number;
    expireWriteOff: number;
    expiringBatches: number;
    expiringNotifications: number;
    durationMs: number;
  }> {
    const start = Date.now();

    // 1. 标记过期批次
    const { expired, written } = await this.eggInventory.markExpiredBatches();

    // 2. 扫描临期库存并写通知
    // [Phase R2 — Config Governance] 预警天数从 sys_configs 读取
    const expiringDays = await this._cfgInt('inventory.expiring_warn_days', 7);
    const expiringBatches = await this.eggInventory.getExpiringBatches({ days: expiringDays });
    let notifications = 0;

    for (const batch of expiringBatches) {
      const daysRemaining = (batch as any).days_remaining ?? 0;
      const userIds = await this.recipients.resolve(batch.company_code, [
        'MENU_SALES2_INVENTORY', 'MENU_WMS_VIEW', 'MENU_INV_BATCH',
      ]);
      for (const userId of userIds) {
        await this.ds.query(
          `INSERT INTO sys_notifications
             (user_id, notification_type, title, content, company_code, biz_type, biz_id, status, created_at)
           VALUES ($1, 'INVENTORY_EXPIRING', $2, $3, $4, 'inv_batch', $5, 'UNREAD', NOW())`,
          [
            userId,
            `临期库存预警：${batch.batch_no}`,
            `批次 ${batch.batch_no}（${batch.product_code}）剩余 ${daysRemaining} 天到期，可用数量 ${batch.qty_available}`,
            batch.company_code,
            String(batch.batch_no),
          ],
        );
        notifications++;
      }
    }

    // 3. 统计损耗 KPI（写日志，日后可存入 KPI 表）
    const [kpi] = await this.ds.query(`
      SELECT
        COALESCE(SUM(ABS(qty_change)) FILTER (WHERE change_type='EXPIRE_WRITEOFF'), 0) AS expire_loss,
        COALESCE(SUM(ABS(qty_change)) FILTER (WHERE change_type='DAMAGE_WRITEOFF'), 0) AS damage_loss
      FROM inv_ledger
      WHERE created_at >= CURRENT_DATE
    `);
    this.logger.log(`[EggScheduler] 今日损耗 KPI: 过期=${kpi.expire_loss} 破损=${kpi.damage_loss}`);

    return {
      expiredBatches:        expired,
      expireWriteOff:        written,
      expiringBatches:       expiringBatches.length,
      expiringNotifications: notifications,
      durationMs:            Date.now() - start,
    };
  }

  // ── Config Governance helpers ─────────────────────────────────────────────
  /** [Phase R2] 从 sys_configs 读取整数配置，失败时返回 defaultVal */
  private async _cfgInt(key: string, defaultVal: number): Promise<number> {
    try {
      const rows: Array<{ config_value: string }> = await this.ds.query(
        `SELECT config_value FROM sys_configs WHERE config_key = $1`, [key],
      );
      const v = rows[0]?.config_value;
      if (v == null) return defaultVal;
      const n = parseInt(v, 10);
      return isNaN(n) ? defaultVal : n;
    } catch {
      return defaultVal;
    }
  }
}
