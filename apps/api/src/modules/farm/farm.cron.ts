import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { CronMonitorService } from '../system-monitor/services/cron-monitor.service';

@Injectable()
export class FarmCronService {
  private readonly logger = new Logger(FarmCronService.name);

  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    private readonly cronMon: CronMonitorService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async updateMedicationStatus() {
    this.logger.log('Starting daily medication status update cron job...');
    const today = new Date().toISOString().slice(0, 10);

    try {
      // 1. 更新为停药期。MVP 使用数据库日期字符串比较，避免读取已废弃的主数据表。
      const res1 = await this.entityManager.query(`
        UPDATE "brd_medication_records"
        SET status = 'IN_WITHDRAWAL', updated_at = NOW()
        WHERE status = 'USING'
          AND end_date IS NOT NULL
          AND end_date < $1
          AND withdraw_until IS NOT NULL
          AND withdraw_until >= $1
      `, [today]);
      this.logger.log(`Updated to inWithdrawal: ${Array.isArray(res1) ? res1[1] : (res1?.rowCount || 0)} records`);

      // 2. 更新为已完全清退。销售侧以 CLEARED 状态作为可售判断输入。
      const res2 = await this.entityManager.query(`
        UPDATE "brd_medication_records"
        SET status = 'CLEARED', updated_at = NOW()
        WHERE status IN ('USING', 'IN_WITHDRAWAL')
          AND withdraw_until IS NOT NULL
          AND withdraw_until < $1
      `, [today]);
      this.logger.log(`Updated to cleared: ${Array.isArray(res2) ? res2[1] : (res2?.rowCount || 0)} records`);

      await this.cronMon.ok('farm_daily');
    } catch (e) {
      this.logger.error('Failed to update medication status', (e as Error).stack);
      await this.cronMon.fail('farm_daily', (e as Error)?.message ?? String(e));
    }
  }
}
