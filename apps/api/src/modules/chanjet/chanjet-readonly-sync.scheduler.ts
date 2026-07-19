import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CronMonitorService } from '../system-monitor/services/cron-monitor.service';
import { ChanjetIntegrationService } from './chanjet-integration.service';

const JOB_NAME = 'chanjet-full-readonly-sync';

@Injectable()
export class ChanjetReadonlySyncScheduler {
  private readonly log = new Logger(ChanjetReadonlySyncScheduler.name);
  private running = false;

  constructor(
    private readonly integration: ChanjetIntegrationService,
    private readonly cronMon: CronMonitorService,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  @Cron('0 15 */4 * * *', { name: JOB_NAME, timeZone: 'Asia/Shanghai' })
  async runScheduledSync(): Promise<void> {
    if (String(process.env.CHANJET_READONLY_SYNC_ENABLED || 'true').toLowerCase() === 'false') {
      this.log.warn(`${JOB_NAME} disabled by CHANJET_READONLY_SYNC_ENABLED=false`);
      return;
    }
    if (this.running) {
      this.log.warn(`${JOB_NAME} skipped because previous local run is still active`);
      return;
    }

    const queryRunner = this.ds.createQueryRunner();
    let lockAcquired = false;
    try {
      await queryRunner.connect();
      const lockRows = await queryRunner.query(
        `SELECT pg_try_advisory_lock(hashtext($1)) AS acquired`,
        [JOB_NAME],
      ) as Array<{ acquired: boolean }>;
      const [lock] = lockRows;
      lockAcquired = lock?.acquired === true;
      if (!lockAcquired) {
        this.log.log(`${JOB_NAME} skipped because another API instance owns the lock`);
        return;
      }
      this.running = true;
      const now = new Date();
      const period = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const result = await this.integration.runReadonlyAlignmentCycle(
        'system:chanjet-readonly-sync',
        [],
        undefined,
        period,
        3,
      );
      if (result.decision !== 'GO') {
        if (result.decision === 'HOLD') {
          throw new Error(
            result.mirror.unresolvedFailures.length
              ? `unresolved readonly sync failures: ${result.mirror.unresolvedFailures.map((item) => `${item.key}/${item.bookId || 'global'}=${item.error}`).join('; ')}`
              : `readonly alignment cycle HOLD at ${result.stoppedAt || 'PRODUCTION_READINESS'}`,
          );
        }
      }
      const currentState = await this.integration.currentStateOverview();
      await this.integration.recordCurrentStateAlert(currentState);
      if (currentState.decision === 'HOLD') {
        throw new Error(`readonly alignment current-state HOLD: ${currentState.blockers.join('; ') || 'unknown blocker'}`);
      }
      await this.cronMon.ok(
        JOB_NAME,
        `decision=${result.decision}; currentState=${currentState.decision}; targets=${result.mirror.results.length}; attempts=${result.mirror.attempts}; exactApproved=${result.exactMappings?.approved || 0}; reconciliationCreated=${result.reconciliation?.created || 0}; reconciliationResolved=${result.reconciliation?.autoResolved || 0}`,
      );
      this.log.log(`${JOB_NAME} completed decision=${result.decision} targets=${result.mirror.results.length} attempts=${result.mirror.attempts} exactApproved=${result.exactMappings?.approved || 0}`);
    } catch (error) {
      const message = (error as Error).message;
      this.log.error(`${JOB_NAME} failed: ${message}`);
      await this.cronMon.fail(JOB_NAME, message);
    } finally {
      this.running = false;
      if (lockAcquired) {
        await queryRunner.query(`SELECT pg_advisory_unlock(hashtext($1))`, [JOB_NAME]).catch((error) => {
          this.log.warn(`${JOB_NAME} advisory unlock failed: ${(error as Error).message}`);
        });
      }
      await queryRunner.release().catch((error) => {
        this.log.warn(`${JOB_NAME} query runner release failed: ${(error as Error).message}`);
      });
    }
  }
}
