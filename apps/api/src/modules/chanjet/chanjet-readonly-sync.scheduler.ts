import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CronMonitorService } from '../system-monitor/services/cron-monitor.service';
import { ChanjetIntegrationService } from './chanjet-integration.service';
import { ChanjetErpInboundSyncService } from './chanjet-erp-inbound-sync.service';

const JOB_NAME = 'chanjet-full-readonly-sync';
const DEFAULT_RECOVERY_COOLDOWN_MS = 15 * 60 * 1000;
const MAX_RECOVERY_COUNT = 2;
const MAX_ERROR_MESSAGE_LENGTH = 2_000;

type ManualSyncRequest = {
  scope?: string[];
  bookId?: string;
  period?: string;
  maxAttempts?: number;
};

type SyncRunState = {
  runId: string | null;
  state: 'IDLE' | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'HOLD' | 'FAILED' | 'SKIPPED';
  requestedBy: string | null;
  queuedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  decision: string | null;
  message: string | null;
};

type PersistedRunRow = {
  status: 'RUNNING' | 'SUCCESS' | 'FAIL';
  request_scope: Record<string, unknown> | null;
  result_summary: Record<string, unknown> | null;
  error_message: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

@Injectable()
export class ChanjetReadonlySyncScheduler implements OnApplicationBootstrap {
  private readonly log = new Logger(ChanjetReadonlySyncScheduler.name);
  private running = false;
  private queued = false;
  private lastRun: SyncRunState = this.idleState();

  constructor(
    private readonly integration: ChanjetIntegrationService,
    private readonly cronMon: CronMonitorService,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly inboundSync: ChanjetErpInboundSyncService,
  ) {}

  onApplicationBootstrap(): void {
    setImmediate(() => {
      void this.recoverInterruptedRun();
    });
  }

  @Cron('0 15 */4 * * *', { name: JOB_NAME, timeZone: 'Asia/Shanghai' })
  async runScheduledSync(): Promise<void> {
    if (String(process.env.CHANJET_READONLY_SYNC_ENABLED || 'true').toLowerCase() === 'false') {
      this.log.warn(`${JOB_NAME} disabled by CHANJET_READONLY_SYNC_ENABLED=false`);
      return;
    }
    const prepared = await this.prepareRun('system:chanjet-readonly-sync', {});
    if (!prepared.accepted || !prepared.run.runId) {
      this.log.warn(`${JOB_NAME} scheduled run skipped: ${prepared.reason || 'SYNC_ALREADY_ACTIVE'}`);
      return;
    }
    await this.executeSync('system:chanjet-readonly-sync', {}, prepared.run.runId);
  }

  async enqueueManualSync(requestedBy: string, request: ManualSyncRequest = {}) {
    const prepared = await this.prepareRun(requestedBy, request);
    if (!prepared.accepted || !prepared.run.runId) return prepared;
    setImmediate(() => {
      void this.executeSync(requestedBy, request, prepared.run.runId!);
    });
    return prepared;
  }

  async getRunState(): Promise<SyncRunState> {
    if (this.lastRun.runId) return { ...this.lastRun };
    try {
      const persisted = await this.loadLatestPersistedRun(false);
      if (persisted) this.lastRun = this.mapPersistedRun(persisted);
    } catch (error) {
      this.log.warn(`${JOB_NAME} persisted status read failed: ${(error as Error).message}`);
    }
    return { ...this.lastRun };
  }

  private async prepareRun(requestedBy: string, request: ManualSyncRequest) {
    if (this.running || this.queued) {
      return { accepted: false, reason: 'SYNC_ALREADY_ACTIVE', run: await this.getRunState() };
    }
    const active = await this.loadLatestPersistedRun(true);
    if (active) {
      this.lastRun = this.mapPersistedRun(active);
      return { accepted: false, reason: 'SYNC_ALREADY_ACTIVE_DURABLE', run: { ...this.lastRun } };
    }
    const runId = `CHANJET-RO-${Date.now()}`;
    const queuedAt = new Date().toISOString();
    this.queued = true;
    this.lastRun = {
      runId,
      state: 'QUEUED',
      requestedBy,
      queuedAt,
      startedAt: null,
      completedAt: null,
      decision: null,
      message: null,
    };
    try {
      await this.ds.query(
        `INSERT INTO chanjet_sync_jobs
           (job_type, book_id, company_code, period, status, request_scope, result_summary, error_message)
         VALUES ('BOOK_REFRESH', $1, '', $2, 'RUNNING', $3::jsonb, NULL, NULL)`,
        [
          String(request.bookId || ''),
          String(request.period || ''),
          JSON.stringify({
            orchestrationRunId: runId,
            requestedBy,
            scope: request.scope || [],
            bookId: request.bookId || '',
            period: request.period || '',
            maxAttempts: Math.min(Math.max(Number(request.maxAttempts) || 3, 1), 3),
            lifecycleState: 'QUEUED',
            queuedAt,
            externalWriteEnabled: false,
          }),
        ],
      );
      return { accepted: true, run: { ...this.lastRun } };
    } catch (error) {
      this.queued = false;
      this.lastRun = {
        ...this.lastRun,
        state: 'FAILED',
        completedAt: new Date().toISOString(),
        decision: 'HOLD',
        message: `durable run creation failed: ${(error as Error).message}`,
      };
      throw error;
    }
  }

  private async executeSync(requestedBy: string, request: ManualSyncRequest, runId: string): Promise<void> {
    if (this.running) {
      this.log.warn(`${JOB_NAME} skipped because previous local run is still active`);
      this.lastRun = {
        ...this.lastRun,
        state: 'SKIPPED',
        completedAt: new Date().toISOString(),
        message: 'previous local run is still active',
      };
      return;
    }

    this.queued = false;
    this.running = true;
    const startedAt = new Date().toISOString();
    this.lastRun = {
      runId,
      state: 'RUNNING',
      requestedBy,
      queuedAt: this.lastRun.runId === runId ? this.lastRun.queuedAt : new Date().toISOString(),
      startedAt,
      completedAt: null,
      decision: null,
      message: null,
    };
    const queryRunner = this.ds.createQueryRunner();
    let lockAcquired = false;
    try {
      await this.persistRunningState(runId, startedAt);
      await queryRunner.connect();
      const lockRows = await queryRunner.query(
        `SELECT pg_try_advisory_lock(hashtext($1)) AS acquired`,
        [JOB_NAME],
      ) as Array<{ acquired: boolean }>;
      const [lock] = lockRows;
      lockAcquired = lock?.acquired === true;
      if (!lockAcquired) {
        this.log.log(`${JOB_NAME} skipped because another API instance owns the lock`);
        this.lastRun = {
          ...this.lastRun,
          state: 'SKIPPED',
          completedAt: new Date().toISOString(),
          message: 'another API instance owns the advisory lock',
        };
        return;
      }
      const now = new Date();
      const period = request.period || `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      let result = await this.integration.runReadonlyAlignmentCycle(
        requestedBy,
        request.scope || [],
        request.bookId,
        period,
        request.maxAttempts || 3,
        { compact: true },
      );
      if (result.decision === 'HOLD') {
        throw new Error(
          result.mirror.unresolvedFailures.length
            ? `unresolved readonly sync failures: ${result.mirror.unresolvedFailures.map((item) => `${item.key}/${item.bookId || 'global'}=${item.error}`).join('; ')}`
            : `readonly alignment cycle HOLD at ${result.stoppedAt || 'PRODUCTION_READINESS'}`,
        );
      }

      const targetCount = result.mirror.results.length;
      const attempts = result.mirror.attempts;
      const exactApproved = result.exactMappings?.approved || 0;
      const reconciliationCreated = result.reconciliation?.created || 0;
      const reconciliationResolved = result.reconciliation?.autoResolved || 0;
      const decision = result.decision;
      const readiness = result.readiness;
      result = null as never;

      if (readiness) {
        await this.integration.recordCurrentStateAlert(readiness);
        if (readiness.decision === 'HOLD') {
          throw new Error(`readonly alignment readiness HOLD: ${readiness.blockers.join('; ') || 'unknown blocker'}`);
        }
      }
      let erpInbound: Record<string, unknown> = { enabled: false, applied: false };
      // A readonly mirror refresh must not silently promote data into ERP
      // accounting mirrors. Promotion is a separate, explicitly enabled Gate.
      if (String(process.env.CHANJET_ERP_INBOUND_SYNC_ENABLED || 'false').toLowerCase() === 'true') {
        try {
          const inboundResult = await this.inboundSync.syncScheduledShareholderBalances(period, requestedBy);
          erpInbound = {
            enabled: true,
            applied: inboundResult.applied,
            decision: inboundResult.decision,
            planHash: inboundResult.plan.planHash,
            sourceCount: inboundResult.plan.counts.source,
            mappedCount: inboundResult.plan.counts.mapped,
            sourceOnlyCount: inboundResult.plan.counts.sourceOnly,
            blockers: inboundResult.plan.blockers,
          };
          if (!inboundResult.applied) {
            this.log.warn(`${JOB_NAME} ERP inbound accounting mirror HOLD: ${inboundResult.reason}`);
          }
        } catch (error) {
          erpInbound = { enabled: true, applied: false, decision: 'HOLD', error: (error as Error).message };
          this.log.error(`${JOB_NAME} ERP inbound accounting mirror failed: ${(error as Error).message}`);
        }
      }
      await this.cronMon.ok(
        JOB_NAME,
        `decision=${decision}; readiness=${readiness?.decision || 'NOT_AVAILABLE'}; targets=${targetCount}; attempts=${attempts}; exactApproved=${exactApproved}; reconciliationCreated=${reconciliationCreated}; reconciliationResolved=${reconciliationResolved}; erpInbound=${String(erpInbound.decision || 'DISABLED')}`,
      );
      const completedAt = new Date().toISOString();
      const message = `targets=${targetCount}; attempts=${attempts}`;
      this.lastRun = {
        ...this.lastRun,
        state: 'COMPLETED',
        completedAt,
        decision,
        message,
      };
      await this.persistTerminalState(runId, 'SUCCESS', 'COMPLETED', decision, message, {
        targetCount,
        attempts,
        exactApproved,
        reconciliationCreated,
        reconciliationResolved,
        erpInbound,
      });
      this.log.log(`${JOB_NAME} completed decision=${decision} targets=${targetCount} attempts=${attempts} exactApproved=${exactApproved}`);
    } catch (error) {
      const message = this.truncateMessage((error as Error).message);
      this.log.error(`${JOB_NAME} failed: ${message}`);
      await this.cronMon.fail(JOB_NAME, message);
      const state = message.includes('HOLD') || message.includes('unresolved readonly sync failures') ? 'HOLD' : 'FAILED';
      this.lastRun = {
        ...this.lastRun,
        state,
        completedAt: new Date().toISOString(),
        decision: 'HOLD',
        message,
      };
      await this.persistTerminalState(runId, 'FAIL', state, 'HOLD', message).catch((persistError) => {
        this.log.error(`${JOB_NAME} terminal state persistence failed: ${(persistError as Error).message}`);
      });
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

  private async recoverInterruptedRun(): Promise<void> {
    if (this.running || this.queued) return;
    try {
      const persisted = await this.loadLatestPersistedRun(true);
      if (!persisted) return;
      const scope = persisted.request_scope || {};
      const runId = String(scope.orchestrationRunId || '');
      if (!runId) return;
      const recoveryCount = Math.max(Number(scope.recoveryCount) || 0, 0);
      if (recoveryCount >= MAX_RECOVERY_COUNT) {
        const message = `automatic recovery exhausted after ${recoveryCount} retries; manual restart required`;
        this.lastRun = {
          ...this.mapPersistedRun(persisted),
          state: 'HOLD',
          completedAt: new Date().toISOString(),
          decision: 'HOLD',
          message,
        };
        await this.persistTerminalState(runId, 'FAIL', 'HOLD', 'HOLD', message, {
          recoveryCount,
          recoveryExhausted: true,
        });
        this.log.error(`${JOB_NAME} ${message} run=${runId}`);
        return;
      }

      const lastUpdatedAt = new Date(persisted.updated_at).getTime();
      const cooldownMs = this.recoveryCooldownMs();
      const remainingCooldownMs = Math.max(0, cooldownMs - (Date.now() - lastUpdatedAt));
      const request: ManualSyncRequest = {
        scope: Array.isArray(scope.scope) ? scope.scope.map(String) : [],
        bookId: String(scope.bookId || '') || undefined,
        period: String(scope.period || '') || undefined,
        maxAttempts: Math.min(Math.max(Number(scope.maxAttempts) || 3, 1), 3),
      };
      const requestedBy = String(scope.requestedBy || 'system:recovered-chanjet-readonly-sync');
      this.queued = true;
      this.lastRun = {
        ...this.mapPersistedRun(persisted),
        state: 'QUEUED',
        message: 'recovered after API restart',
      };
      await this.ds.query(
        `UPDATE chanjet_sync_jobs
            SET request_scope = COALESCE(request_scope, '{}'::jsonb) || $2::jsonb,
                updated_at = NOW()
          WHERE request_scope->>'orchestrationRunId' = $1`,
        [runId, JSON.stringify({
          lifecycleState: 'QUEUED',
          recoveredAt: new Date().toISOString(),
          recoveryCount: recoveryCount + 1,
          recoveryCooldownMs: cooldownMs,
        })],
      );
      this.log.warn(
        `${JOB_NAME} queued interrupted run ${runId} recovery=${recoveryCount + 1}/${MAX_RECOVERY_COUNT}`
        + ` cooldownMs=${remainingCooldownMs}`,
      );
      if (remainingCooldownMs === 0) {
        setImmediate(() => {
          void this.executeSync(requestedBy, request, runId);
        });
      } else {
        const timer = setTimeout(() => {
          void this.executeSync(requestedBy, request, runId);
        }, remainingCooldownMs);
        timer.unref();
      }
    } catch (error) {
      this.log.error(`${JOB_NAME} recovery failed: ${(error as Error).message}`);
    }
  }

  private async persistRunningState(runId: string, startedAt: string): Promise<void> {
    await this.ds.query(
      `UPDATE chanjet_sync_jobs
          SET status = 'RUNNING',
              request_scope = COALESCE(request_scope, '{}'::jsonb) || $2::jsonb,
              result_summary = NULL,
              error_message = NULL,
              updated_at = NOW()
        WHERE request_scope->>'orchestrationRunId' = $1`,
      [runId, JSON.stringify({ lifecycleState: 'RUNNING', startedAt })],
    );
  }

  private async persistTerminalState(
    runId: string,
    status: 'SUCCESS' | 'FAIL',
    state: SyncRunState['state'],
    decision: string,
    message: string,
    details: Record<string, unknown> = {},
  ): Promise<void> {
    const completedAt = new Date().toISOString();
    await this.ds.query(
      `UPDATE chanjet_sync_jobs
          SET status = $2,
              request_scope = COALESCE(request_scope, '{}'::jsonb) || $3::jsonb,
              result_summary = $4::jsonb,
              error_message = $5,
              updated_at = NOW()
        WHERE request_scope->>'orchestrationRunId' = $1`,
      [
        runId,
        status,
        JSON.stringify({ lifecycleState: state, completedAt }),
        JSON.stringify({ state, decision, message, completedAt, ...details, externalWriteEnabled: false }),
        status === 'FAIL' ? message : null,
      ],
    );
  }

  private async loadLatestPersistedRun(activeOnly: boolean): Promise<PersistedRunRow | null> {
    const rows = await this.ds.query(
      `SELECT status, request_scope, result_summary, error_message, created_at, updated_at
         FROM chanjet_sync_jobs
        WHERE request_scope ? 'orchestrationRunId'
          AND ($1::boolean = FALSE OR status = 'RUNNING')
        ORDER BY id DESC
        LIMIT 1`,
      [activeOnly],
    ) as PersistedRunRow[];
    return rows[0] || null;
  }

  private mapPersistedRun(row: PersistedRunRow): SyncRunState {
    const request = row.request_scope || {};
    const result = row.result_summary || {};
    const persistedState = String(result.state || request.lifecycleState || '');
    const state = this.isRunState(persistedState)
      ? persistedState
      : row.status === 'SUCCESS'
        ? 'COMPLETED'
        : row.status === 'FAIL'
          ? 'FAILED'
          : 'RUNNING';
    return {
      runId: String(request.orchestrationRunId || '') || null,
      state,
      requestedBy: String(request.requestedBy || '') || null,
      queuedAt: String(request.queuedAt || '') || this.iso(row.created_at),
      startedAt: String(request.startedAt || '') || null,
      completedAt: String(result.completedAt || request.completedAt || '') || (row.status === 'RUNNING' ? null : this.iso(row.updated_at)),
      decision: String(result.decision || '') || null,
      message: String(result.message || row.error_message || '') || null,
    };
  }

  private isRunState(value: string): value is SyncRunState['state'] {
    return ['IDLE', 'QUEUED', 'RUNNING', 'COMPLETED', 'HOLD', 'FAILED', 'SKIPPED'].includes(value);
  }

  private iso(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  private idleState(): SyncRunState {
    return {
      runId: null,
      state: 'IDLE',
      requestedBy: null,
      queuedAt: null,
      startedAt: null,
      completedAt: null,
      decision: null,
      message: null,
    };
  }

  private recoveryCooldownMs(): number {
    const configured = Number(process.env.CHANJET_READONLY_RECOVERY_COOLDOWN_MS);
    if (!Number.isFinite(configured)) return DEFAULT_RECOVERY_COOLDOWN_MS;
    return Math.min(Math.max(Math.trunc(configured), 1_000), 60 * 60 * 1000);
  }

  private truncateMessage(value: unknown): string {
    const text = String(value || 'unknown error');
    return text.length <= MAX_ERROR_MESSAGE_LENGTH
      ? text
      : `${text.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…[truncated]`;
  }
}
