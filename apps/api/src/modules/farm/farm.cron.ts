import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

@Injectable()
export class FarmCronService {
  private readonly logger = new Logger(FarmCronService.name);

  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async updateMedicationStatus() {
    this.logger.log('Starting daily medication status update cron job...');
    const today = new Date().toISOString().slice(0, 10);

    try {
      // 1. 更新为停药期 (inWithdrawal)
      // 条件: using 状态，且今天已经超过用药结束日期 (end_date < today)，但还没超过清退日期 (clear_date >= today)
      // 注意 sqlite / pg 处理日期的差异，直接按字符串比较
      const res1 = await this.entityManager.query(`
        UPDATE "brd_medications"
        SET status = 'inWithdrawal'
        WHERE status = 'using' 
          AND end_date < $1 
          AND clear_date >= $1
      `, [today]);
      this.logger.log(`Updated to inWithdrawal: ${Array.isArray(res1) ? res1[1] : (res1?.rowCount || 0)} records`);

      // 2. 更新为已完全清退 (cleared)
      // 条件: using/inWithdrawal 状态，且今天已经超过清退日期 (clear_date < today)
      const res2 = await this.entityManager.query(`
        UPDATE "brd_medications"
        SET status = 'cleared'
        WHERE status IN ('using', 'inWithdrawal') 
          AND clear_date < $1
      `, [today]);
      this.logger.log(`Updated to cleared: ${Array.isArray(res2) ? res2[1] : (res2?.rowCount || 0)} records`);

    } catch (e) {
      this.logger.error('Failed to update medication status', (e as Error).stack);
    }
  }
}
