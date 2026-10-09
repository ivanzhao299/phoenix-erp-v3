import { ChanjetReadonlyLockLease } from './chanjet-readonly-lock-lease';
import { randomUUID } from 'node:crypto';
import { withReadonlyOrchestration } from './chanjet-readonly-execution';
import { approvedReadonlyPolicy, requireApprovedReadonlyRequest, readonlyScheduleEnabled, readonlyFailureCode } from './chanjet-readonly-policy';
import { readonlySyncEnabled } from './chanjet-sync-control';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CronMonitorService } from '../system-monitor/services/cron-monitor.service';
import { ChanjetIntegrationService } from './chanjet-integration.service';
import { ChanjetErpInboundSyncService } from './chanjet-erp-inbound-sync.service';

const JOB_NAME = 'chanjet-full-readonly-sync';

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
    if (!readonlySyncEnabled()) return;
    setImmediate(() => {
      void this.recoverInterruptedRun();
    });
  }

  // Four full refreshes/day keep the mirror current while leaving enough of
  // the 30k monthly free allowance for operator checks and controlled writes.
  @Cron('0 15 */6 * * *', { name: JOB_NAME, timeZone: 'Asia/Shanghai' })
  async runScheduledSync(): Promise<void> {
    if (!readonlySyncEnabled() || !readonlyScheduleEnabled()) {
      this.log.warn(`${JOB_NAME} READONLY_SCHEDULE_HOLD`);
      return;
    }
    const approved = approvedReadonlyPolicy();
    const request = { scope: approved.scopes.filter(s => s !== 'AR_SNAPSHOT') };
    const prepared = await this.prepareRun('system:chanjet-readonly-sync', request);
    if (!prepared.accepted || !prepared.lease || !prepared.run.runId) {
      this.log.warn(`${JOB_NAME} scheduled run skipped: ${prepared.reason || 'SYNC_ALREADY_ACTIVE'}`);
      return;
    }
    await this.executeSync('system:chanjet-readonly-sync', request, prepared.run.runId, prepared.lease);
  }

  async enqueueManualSync(requestedBy: string, request: ManualSyncRequest = {}) {
    if (!readonlySyncEnabled()) return this.disabledRun();
    const prepared = await this.prepareRun(requestedBy, request);
    const response = { accepted: prepared.accepted, reason: prepared.reason, run: prepared.run };
    if (!prepared.accepted || !prepared.lease || !prepared.run.runId) return response;
    const { lease } = prepared;
    const runId = prepared.run.runId;
    setImmediate(() => {
      // executeSync consumes this lease exactly once; unexpected failures remain audited HOLD.
      void this.executeSync(requestedBy, request, runId, lease).catch(() => {
        this.log.error('READONLY_HOLD_DISPATCH');
      });
    });
    return response;
  }

  async getRunState(): Promise<SyncRunState> {
    if (this.lastRun.runId) return { ...this.lastRun };
    try {
      const persisted = await this.loadLatestPersistedRun(false);
      if (persisted) this.lastRun = this.mapPersistedRun(persisted);
    } catch (error) {
      this.log.warn(`${JOB_NAME} ${readonlyFailureCode(error)}`);
    }
    return { ...this.lastRun };
  }

  private disabledRun(): { accepted: boolean; reason?: string; run: SyncRunState } {
    return { accepted: false, reason: 'SYNC_DISABLED', run: { ...this.lastRun } };
  }

  private async prepareRun(requestedBy: string, request: ManualSyncRequest): Promise<{
    accepted: boolean; reason?: string; run: SyncRunState; lease?: ChanjetReadonlyLockLease;
  }> {
    if (!readonlySyncEnabled()) return this.disabledRun();
    if (this.running || this.queued) {
      return { accepted: false, reason: 'SYNC_ALREADY_ACTIVE', run: await this.getRunState() };
    }
    const approval = requireApprovedReadonlyRequest(request);
    const guard = this.ds.createQueryRunner();
    let lease: ChanjetReadonlyLockLease | null = null;
    let transferred = false;
    try {
      lease = await ChanjetReadonlyLockLease.acquire(guard, JOB_NAME);
      if (!lease) return { accepted: false, reason: 'SYNC_ALREADY_ACTIVE', run: { ...this.lastRun }, lease: undefined };
      await guard.startTransaction();
      // All RUNNING rows block admission, including pre-orchestration legacy jobs.
      const scheduleSlot = requestedBy === 'system:chanjet-readonly-sync' ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).format(new Date()) : '';
      const rows = await guard.query(
        `SELECT id FROM chanjet_sync_jobs WHERE status = 'RUNNING'
         OR (request_scope->>'approvalId' = $1 AND status = 'FAIL')
         OR ($2::boolean AND request_scope->>'approvalId' = $1 AND status = 'SUCCESS')
         OR ($3 <> '' AND request_scope->>'approvalId' = $1 AND request_scope->>'scheduleSlot' = $3) LIMIT 1`,
        [approval.approvalId, process.env.CHANJET_SYNC_POLICY === 'READONLY_VERIFY', scheduleSlot],
      );
      if (rows.length) return { accepted: false, reason: 'SYNC_DURABLE_HOLD', run: { ...this.lastRun } };
      const runId = `CHANJET-RO-${randomUUID()}`;
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
        await guard.query(
          `INSERT INTO chanjet_sync_jobs
             (job_type, book_id, company_code, period, status, request_scope, result_summary, error_message)
           VALUES ('BOOK_REFRESH', $1, '', $2, 'RUNNING', $3::jsonb, NULL, NULL)`,
          [
            String(request.bookId || ''),
            String(request.period || ''),
            JSON.stringify({
              scheduleSlot,
              approvalId: approval.approvalId,
              floorSha: approval.floorSha,
              orchestrationRunId: runId,
              requestedBy,
              scope: request.scope || [],
              bookId: request.bookId || '',
              period: request.period || '',
              maxAttempts: Math.min(Math.max(Number(request.maxAttempts) || 3, 1), 3),
              lifecycleState: 'QUEUED',
              queuedAt,
              externalWriteEnabled: false,
              lockBackendPid: lease.backendPid,
            }),
          ],
        );
        await guard.commitTransaction();
        await lease.assertOwnership();
        transferred = true;
        return { accepted: true, run: { ...this.lastRun }, lease };
      } catch (error) {
        this.queued = false;
        this.lastRun = {
          ...this.lastRun,
          state: 'HOLD',
          completedAt: new Date().toISOString(),
          decision: 'HOLD',
          message: readonlyFailureCode(error),
        };
        throw error;
      }
    } finally {
      if (lease && !transferred) await lease.close();
      // acquire() cleans its own connect/lock-denial failure; an accepted lease is
      // retained across the committed reservation and asynchronous dispatch.
    }
  }

  private async executeSync(requestedBy: string, request: ManualSyncRequest, runId: string, lease: ChanjetReadonlyLockLease): Promise<void> {
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
    let terminalAttempted = false;
    try {
      await lease.assertOwnership();
      if (!readonlySyncEnabled()) throw new Error('READONLY_HOLD_SYNC_DISABLED');
      requireApprovedReadonlyRequest(request);
      await this.persistRunningState(lease, runId, startedAt);
      const now = new Date();
      const period = request.period || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).format(now).replace(/[^0-9]/g, '');
      let result = await withReadonlyOrchestration(runId, () => this.integration.runReadonlyAlignmentCycle(
        requestedBy,
        request.scope || [],
        request.bookId,
        period,
        request.maxAttempts || 3,
        { compact: true },
      ), () => lease.assertAlive());
      if (result.decision === 'HOLD') {
        throw new Error(
          result.mirror.unresolvedFailures.length
            ? `unresolved readonly sync failures: ${result.mirror.unresolvedFailures.map((item) => `${item.key}/${item.bookId || 'global'}=${item.error}`).join('; ')}`
            : `readonly alignment cycle HOLD at ${result.stoppedAt || 'PRODUCTION_READINESS'}`,
        );
      }

      await lease.assertOwnership();
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
      const erpInbound: Record<string, unknown> = { enabled: false, applied: false };
      await this.cronMon.ok(
        JOB_NAME,
        `decision=${decision}; readiness=${readiness?.decision || 'NOT_AVAILABLE'}; targets=${targetCount}; attempts=${attempts}; exactApproved=${exactApproved}; reconciliationCreated=${reconciliationCreated}; reconciliationResolved=${reconciliationResolved}; erpInbound=${String(erpInbound.decision || 'DISABLED')}`,
      );
      const completedAt = new Date().toISOString();
      const message = `targets=${targetCount}; attempts=${attempts}`;
      terminalAttempted = true;
      await this.persistTerminalState(lease, runId, 'SUCCESS', 'COMPLETED', decision, message, {
        targetCount, attempts, exactApproved, reconciliationCreated, reconciliationResolved, erpInbound,
      });
      this.lastRun = {
        ...this.lastRun,
        state: 'COMPLETED',
        completedAt,
        decision,
        message,
      };
      this.log.log(`${JOB_NAME} completed decision=${decision} targets=${targetCount} attempts=${attempts} exactApproved=${exactApproved}`);
    } catch (error) {
      const message = terminalAttempted ? 'READONLY_HOLD_TERMINAL_PERSISTENCE' : readonlyFailureCode(error);
      this.lastRun = { ...this.lastRun, state: 'HOLD', completedAt: new Date().toISOString(), decision: 'HOLD', message };
      this.log.error(message);
      if (!terminalAttempted) {
        try { await this.persistTerminalState(lease, runId, 'FAIL', 'HOLD', 'HOLD', message); }
        catch {
          this.lastRun.message = 'READONLY_HOLD_TERMINAL_PERSISTENCE';
          this.log.error('READONLY_HOLD_TERMINAL_PERSISTENCE');
        }
      }
      // Never replace a failed SUCCESS acknowledgement by another terminal write.
      // The durable RUNNING/ambiguous terminal evidence requires operator review.
      try { await this.cronMon.fail(JOB_NAME, this.lastRun.message || message); }
      catch { this.log.error('READONLY_HOLD_FAILURE_AUDIT'); }
    } finally {
      try { await lease.close(); }
      catch { this.log.error('READONLY_HOLD_LOCK_CLEANUP'); }
      this.running = false;
      this.queued = false;
    }
  }

  private async recoverInterruptedRun(): Promise<void> {
    if (!readonlySyncEnabled()) return;
    try {
      approvedReadonlyPolicy();
      const persisted = await this.loadLatestPersistedRun(true);
      if (!persisted) return;
      this.lastRun = { ...this.mapPersistedRun(persisted), state: 'HOLD', decision: 'HOLD', message: 'READONLY_HOLD_INTERRUPTED_RUN_REVIEW_REQUIRED' };
      // Evidence is retained. A restart never replays an earlier orchestration.
      this.log.warn('READONLY_HOLD_INTERRUPTED_RUN_REVIEW_REQUIRED');
    } catch {
      this.log.warn('READONLY_HOLD_BOOTSTRAP');
    }
  }

  private async persistRunningState(lease: ChanjetReadonlyLockLease, runId: string, startedAt: string): Promise<void> {
    await lease.assertOwnership();
    const updated = await lease.runner.query(
      `UPDATE chanjet_sync_jobs
          SET status = 'RUNNING',
              request_scope = COALESCE(request_scope, '{}'::jsonb) || $2::jsonb,
              result_summary = NULL,
              error_message = NULL,
              updated_at = NOW()
        WHERE request_scope->>'orchestrationRunId' = $1 AND status = 'RUNNING'`,
      [runId, JSON.stringify({ lifecycleState: 'RUNNING', startedAt })],
      true,
    );
    if (updated.affected !== 1) throw new Error('READONLY_HOLD_DURABLE_STATE');
  }

  private async persistTerminalState(
    lease: ChanjetReadonlyLockLease,
    runId: string,
    status: 'SUCCESS' | 'FAIL',
    state: SyncRunState['state'],
    decision: string,
    message: string,
    details: Record<string, unknown> = {},
  ): Promise<void> {
    const completedAt = new Date().toISOString();
    await lease.assertOwnership();
    const updated = await lease.runner.query(
      `UPDATE chanjet_sync_jobs
          SET status = $2,
              request_scope = COALESCE(request_scope, '{}'::jsonb) || $3::jsonb,
              result_summary = $4::jsonb,
              error_message = $5,
              updated_at = NOW()
        WHERE request_scope->>'orchestrationRunId' = $1 AND status = 'RUNNING'`,
      [
        runId,
        status,
        JSON.stringify({ lifecycleState: state, completedAt }),
        JSON.stringify({ state, decision, message, completedAt, ...details, externalWriteEnabled: false }),
        status === 'FAIL' ? message : null,
      ],
      true,
    );
    if (updated.affected !== 1) throw new Error('READONLY_HOLD_DURABLE_STATE');
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

}
