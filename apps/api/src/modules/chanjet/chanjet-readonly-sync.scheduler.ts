import { ChanjetReadonlyLockLease } from './chanjet-readonly-lock-lease';
import { randomUUID } from 'node:crypto';
import { withReadonlyOrchestration } from './chanjet-readonly-execution';
import { approvedReadonlyPolicy, requireApprovedReadonlyRequest, readonlyScheduleEnabled, readonlyFailureCode } from './chanjet-readonly-policy';
import { readonlySyncEnabled } from './chanjet-sync-control';
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CronMonitorService } from '../system-monitor/services/cron-monitor.service';
import { ChanjetIntegrationService } from './chanjet-integration.service';
import { ChanjetErpInboundSyncService } from './chanjet-erp-inbound-sync.service';
import { Client } from 'pg';
import { ChanjetExecutionAdmissionStore, ExecutionContext } from './chanjet-execution-admission.store';
import { createBoundedGuardExecutor, resolveGuardClientConfig, GuardConnectionConfig } from './chanjet-execution-guard-executor';
import { validateExecutionManifest } from './chanjet-execution-manifest';
import { ChanjetExecutionHttpGateway } from './chanjet-execution-transport';
import { withExecutionScope } from './chanjet-execution-scope';

const JOB_NAME = 'chanjet-full-readonly-sync';

/** Terminal-persistence refusal raised by the execution liveness gate BEFORE
 *  any terminal write — the FAIL terminal that follows is unambiguous. */
const executionGateRefusal = (): Error => Object.assign(new Error('READONLY_HOLD_EXECUTION_STOPPED'), { executionGateRefusal: true });

type ManualSyncRequest = {
  scope?: string[];
  bookId?: string;
  period?: string;
  maxAttempts?: number;
  // Durable execution binding for orchestration-driven first syncs. The
  // client may only NAME the execution; every bound attribute is read back
  // from the admission row (never accepted from the caller).
  execution?: { executionId: string; leaseId: string };
};

// Row-sourced execution binding persisted into the job's request_scope and
// used to rebuild the ExecutionScope inside the worker.
type ExecutionBinding = {
  executionId: string;
  leaseId: string;
  phase: 'SYNCING';
  approvalId: string;
  floorSha: string;
  deadlineAt: string;
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
export class ChanjetReadonlySyncScheduler implements OnApplicationBootstrap, OnModuleDestroy {
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
    await this.executeSync('system:chanjet-readonly-sync', request, prepared.run.runId, prepared.lease, undefined);
  }

  async enqueueManualSync(requestedBy: string, request: ManualSyncRequest = {}, options: { authPrincipal?: string } = {}) {
    if (!readonlySyncEnabled()) return this.disabledRun();
    const prepared = await this.prepareRun(requestedBy, request, options);
    const response = { accepted: prepared.accepted, reason: prepared.reason, run: prepared.run };
    if (!prepared.accepted || !prepared.lease || !prepared.run.runId) return response;
    const { lease } = prepared;
    const runId = prepared.run.runId;
    setImmediate(() => {
      // executeSync consumes this lease exactly once; unexpected failures remain audited HOLD.
      void this.executeSync(requestedBy, request, runId, lease, prepared.executionBinding).catch(() => {
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

  private async prepareRun(requestedBy: string, request: ManualSyncRequest, options: { authPrincipal?: string } = {}): Promise<{
    accepted: boolean; reason?: string; run: SyncRunState; lease?: ChanjetReadonlyLockLease; executionBinding?: ExecutionBinding;
  }> {
    if (!readonlySyncEnabled()) return this.disabledRun();
    if (this.running || this.queued) {
      return { accepted: false, reason: 'SYNC_ALREADY_ACTIVE', run: await this.getRunState() };
    }
    // READONLY_VERIFY is the first-sync window: it REQUIRES a durable
    // execution — a request without one refuses before anything durable and
    // with zero provider HTTP.
    if (process.env.CHANJET_SYNC_POLICY === 'READONLY_VERIFY' && !request.execution) {
      return { accepted: false, reason: 'SYNC_EXECUTION_REQUIRED', run: await this.getRunState() };
    }
    // Execution-bound runs verify the binding against the ADMISSION ROW before
    // anything durable happens: the caller may only name executionId+leaseId;
    // phase, approval, floor and deadline are read back from the trusted row,
    // the row's approval/floor must match the CURRENT approved policy, the
    // row's verification must match the request, and the row's owner must be
    // the authenticated caller. A mismatch (or a stopped/expired execution)
    // refuses the request.
    const executionBinding = request.execution ? await this.verifyExecutionBinding(request.execution, requestedBy, options.authPrincipal, request) : undefined;
    if (request.execution && !executionBinding) {
      return { accepted: false, reason: 'SYNC_EXECUTION_CONTEXT', run: await this.getRunState() };
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
              ...(executionBinding ? { execution: executionBinding } : {}),
            }),
          ],
        );
        await guard.commitTransaction();
        await lease.assertOwnership();
        transferred = true;
        return { accepted: true, run: { ...this.lastRun }, lease, executionBinding: executionBinding ?? undefined };
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

  private async executeSync(requestedBy: string, request: ManualSyncRequest, runId: string, lease: ChanjetReadonlyLockLease, executionBinding?: ExecutionBinding): Promise<void> {
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
    // Execution-bound runs rebuild the ExecutionScope from the TRUSTED
    // admission row (never from the request): every provider HTTP inside the
    // alignment cycle — auth, discovery, business, retries — is counted by
    // the same durable gateway that counted the probe, under the same
    // cumulative cap and the same DB-owned absolute deadline.
    let executionScope: { current: ExecutionContext; gateway: ChanjetExecutionHttpGateway } | undefined;
    try {
      await lease.assertOwnership();
      if (!readonlySyncEnabled()) throw new Error('READONLY_HOLD_SYNC_DISABLED');
      requireApprovedReadonlyRequest(request);
      await this.persistRunningState(lease, runId, startedAt);
      const now = new Date();
      const period = request.period || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).format(now).replace(/[^0-9]/g, '');
      const runCycle = () => this.integration.runReadonlyAlignmentCycle(
        requestedBy,
        request.scope || [],
        request.bookId,
        period,
        request.maxAttempts || 3,
        { compact: true },
      );
      let result;
      let preWorkerSends = 0;
      let preWorkerMaxOrdinal = 0;
      if (executionBinding) {
        const current = await this.rebuildExecutionScopeContext(executionBinding);
        const store = this.executionSupport().store;
        const gateway = new ChanjetExecutionHttpGateway(store, current.manifest);
        executionScope = { current, gateway };
        if (Date.now() >= (current.deadlineAt as Date).getTime()) {
          await this.holdExecutionSafely(current, 'DEADLINE');
          throw new Error('READONLY_HOLD_EXECUTION_DEADLINE');
        }
        // worker send evidence is scoped to THIS run: pre-existing ACKs under
        // the lease (the orchestration rehearsal) are excluded by the delta
        preWorkerSends = await this.countWorkerBusinessOk(executionBinding);
        preWorkerMaxOrdinal = await this.maxWorkerReceiptOrdinal(executionBinding);
        result = await withExecutionScope(
          { manifest: current.manifest, store, gateway, transport: { resend: async () => { throw new Error('CHANJET_EXECUTION_RESEND_FORBIDDEN'); } }, deadlineAt: current.deadlineAt as Date, current },
          () => withReadonlyOrchestration(runId, runCycle, () => lease.assertAlive()),
        );
      } else {
        result = await withReadonlyOrchestration(runId, runCycle, () => lease.assertAlive());
      }
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
      const executionDetails: Record<string, unknown> = {};
      if (executionBinding && executionScope) {
        // worker receipt evidence: ONLY the exchanges THIS run made (delta
        // over the pre-cycle count — the rehearsal ACK is not worker
        // evidence). The receipt ORDINALS of exactly those sends are
        // persisted so the orchestration proof can verify them
        // independently against the receipts table.
        const sends = (await this.countWorkerBusinessOk(executionBinding)) - preWorkerSends;
        if (sends < 1) throw new Error('READONLY_HOLD_EXECUTION_NO_WORKER_SENDS');
        const ordinals = await this.workerReceiptOrdinalsAbove(executionBinding, preWorkerMaxOrdinal);
        executionDetails.execution = executionBinding;
        executionDetails.executionSends = sends;
        executionDetails.executionReceiptOrdinals = ordinals;
      }
      await this.persistTerminalState(lease, runId, 'SUCCESS', 'COMPLETED', decision, message, {
        targetCount, attempts, exactApproved, reconciliationCreated, reconciliationResolved, erpInbound, ...executionDetails,
      }, executionBinding);
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
      this.log.warn(`RAW=${String(error instanceof Error ? error.message : error).replace(/[^\x20-\x7e]/g, ' ').slice(0, 140)}`);
      // A failed execution-bound run durably STOPS the execution: no later
      // send and no late sync success can build on it. The stop goes through
      // the reviewed bounded guard mechanism (ALREADY_STOPPED is fine).
      if (executionScope) {
        await this.holdExecutionSafely(executionScope.current, this.executionHoldReason(error));
      }
      // a gate refusal happens BEFORE any terminal write: the FAIL terminal is
      // unambiguous and must land; a genuine post-write ambiguity never is
      const gateRefused = Boolean((error as { executionGateRefusal?: boolean })?.executionGateRefusal);
      if (!terminalAttempted || gateRefused) {
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
    executionBinding?: ExecutionBinding,
  ): Promise<void> {
    const completedAt = new Date().toISOString();
    await lease.assertOwnership();
    const terminalSql = `UPDATE chanjet_sync_jobs
            SET status = $2,
                request_scope = COALESCE(request_scope, '{}'::jsonb) || $3::jsonb,
                result_summary = $4::jsonb,
                error_message = $5,
                updated_at = NOW()
          WHERE request_scope->>'orchestrationRunId' = $1 AND status = 'RUNNING'`;
    const terminalParams = [
      runId,
      status,
      JSON.stringify({ lifecycleState: state, completedAt }),
      JSON.stringify({ state, decision, message, completedAt, ...details, externalWriteEnabled: false }),
      status === 'FAIL' ? message : null,
    ];
    if (!executionBinding) {
      const updated = await lease.runner.query(terminalSql, terminalParams, true);
      if (updated.affected !== 1) throw new Error('READONLY_HOLD_DURABLE_STATE');
      return;
    }
    // Execution-bound SUCCESS commit gate: the admission row is locked and
    // checked INSIDE the same transaction as the terminal write, so a stop or
    // expiry occurring after the last ACK still blocks the success from
    // landing. EVERY statement — BEGIN, the liveness SELECT, the VERIFIED
    // UPDATE, the terminal UPDATE, ROLLBACK and COMMIT — carries a per-call
    // REAL-TIME remaining budget derived from the SAME absolute execution
    // deadline (no fixed grace). Cancellation NEVER depends on the possibly
    // exhausted business pool: an over-budget or timed-out statement is
    // cancelled by pg_terminate_backend through an INDEPENDENT connection,
    // and the discard of the dead session is CONFIRMED via pg_stat_activity
    // before the error propagates — a raw BEGIN transaction can never be
    // returned to the pool. An unconfirmable COMMIT outcome is reported as
    // UNKNOWN (never claimed committed or rolled back).
    const deadlineAt = new Date(executionBinding.deadlineAt).getTime();
    const remainingMs = (): number => deadlineAt - Date.now();
    if (remainingMs() <= 1) throw executionGateRefusal();
    // cancellation channel: an INDEPENDENT connection (guard executor
    // configuration), never the business pool
    const cancellationConfig = resolveGuardClientConfig((this.ds.options ?? {}) as GuardConnectionConfig);
    if (!cancellationConfig) throw executionGateRefusal();
    let beginSeen = false;
    let firstGateLogged = false;
    let commitUnknown = false;
    let sessionDiscarded = false;
    let commitTimer: ReturnType<typeof setTimeout> | undefined;
    const terminateAndConfirmDiscard = async (): Promise<boolean> => {
      const cancelClient = new Client(cancellationConfig as never);
      try {
        await cancelClient.connect();
        await cancelClient.query('SELECT pg_terminate_backend($1)', [lease.backendPid]);
        const confirmed = await withBound((async () => {
          for (;;) {
            const rows = await cancelClient.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1', [lease.backendPid]);
            if (!rows.rows?.length) return true;
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        })(), 2_000, 'CHANJET_GUARD_TERMINATE_CONFIRM_TIMEOUT');
        return confirmed === true;
      } catch {
        return false;
      } finally {
        await cancelClient.end().catch(() => undefined);
      }
    };
    const withBound = async <T>(work: Promise<T>, ms: number, code: string): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      return Promise.race([
        work,
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(code)), ms); }),
      ]).finally(() => clearTimeout(timer));
    };
    try {
      await lease.runner.query('BEGIN');
      beginSeen = true;
      const boundedGate = async (sql: string, parameters?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }> => {
        const remaining = remainingMs();
        if (remaining <= 1) throw executionGateRefusal();
        await lease.runner.query(`SET LOCAL statement_timeout=${remaining}`);
        await lease.runner.query(`SET LOCAL lock_timeout=${Math.min(remaining, 1_000)}`);
        // raw pg result (rows + rowCount) — no structured-result ambiguity
        const result = await withBound(lease.runner.query(sql, parameters), remaining, 'CHANJET_EXECUTION_GATE_TIMEOUT') as unknown;
        if (sql.includes('FOR UPDATE') && !firstGateLogged) {
          firstGateLogged = true;
          // eslint-disable-next-line no-console
          console.log('GATE_RAW2', JSON.stringify(result).slice(0, 300));
        }
        if (Array.isArray(result)) {
          // TypeORM wraps UPDATE..RETURNING as [rows, affectedCount]
          if (result.length === 2 && Array.isArray(result[0])) {
            return { rows: result[0] as Array<Record<string, unknown>>, rowCount: Number(result[1] || 0) };
          }
          return { rows: result as unknown as Array<Record<string, unknown>>, rowCount: result.length };
        }
        const shaped = (result ?? {}) as { rows?: unknown[]; rowCount?: number };
        return { rows: (shaped.rows ?? []) as Array<Record<string, unknown>>, rowCount: Number(shaped.rowCount || 0) };
      };
      const gateResult = await boundedGate(
        `SELECT phase, hold_reason, deadline_at FROM chanjet_execution_admissions
          WHERE execution_id=$1 FOR UPDATE`, [executionBinding.executionId]);
      this.log.warn(`GATE_DIAG2 raw=${JSON.stringify(gateResult).slice(0, 200)}`);
      const gateRows = Array.isArray(gateResult)
        ? gateResult as unknown as Array<{ phase: string; hold_reason: string; deadline_at: Date }>
        : ((gateResult as { rows?: unknown[] }).rows ?? []) as unknown as Array<{ phase: string; hold_reason: string; deadline_at: Date }>;
      if (!gateRows.length) {
        const diag = await this.ds.query('SELECT count(*)::int AS n FROM chanjet_execution_admissions');
        const leasePlain = await lease.runner.query('SELECT count(*)::int AS n FROM chanjet_execution_admissions');
        const leaseNoLock = await lease.runner.query('SELECT execution_id, phase, hold_reason FROM chanjet_execution_admissions WHERE execution_id=$1', [executionBinding.executionId]);
        let leaseForUpdate: unknown = 'not-run';
        let forUpdateErr = '';
        try {
          leaseForUpdate = await lease.runner.query('SELECT phase, hold_reason FROM chanjet_execution_admissions WHERE execution_id=$1 FOR UPDATE', [executionBinding.executionId]);
        } catch (e) { forUpdateErr = String((e as Error).message).slice(0, 120); }
        const iso = await lease.runner.query('SELECT current_setting(\'transaction_isolation\') AS iso, txid_current() AS tx');
        this.log.warn(`GATE_DIAG exec=${executionBinding.executionId} dsTotal=${JSON.stringify(diag)} leaseTotal=${JSON.stringify(leasePlain)} leaseRow=${JSON.stringify(leaseNoLock).slice(0, 120)} forUpdate=${JSON.stringify(leaseForUpdate).slice(0, 120)} forUpdateErr=${forUpdateErr} iso=${JSON.stringify(iso)}`);
      }
      const gate = gateRows[0];
      const stopReason = !gate ? 'NO_ROW'
        : gate.phase === 'HOLD' || gate.phase === 'VERIFIED' ? `PHASE:${gate.phase}`
        : gate.hold_reason !== '' ? `HELD:${gate.hold_reason}`
        : !(gate.deadline_at instanceof Date) ? 'NO_DEADLINE'
        : gate.deadline_at.getTime() <= Date.now() ? 'EXPIRED' : '';
      if (stopReason) {
        this.log.warn(`GATE_STOP_REASON=${stopReason}`);
        throw executionGateRefusal();
      }
      if (status === 'SUCCESS') {
        // mirror the reviewed finish transition: VERIFIED clears the lease
        const verified = await boundedGate(
          `UPDATE chanjet_execution_admissions SET phase='VERIFIED', lease_id='' WHERE execution_id=$1 RETURNING phase`,
          [executionBinding.executionId]);
        if (verified.rowCount !== 1) throw executionGateRefusal();
      }
      const updated = await boundedGate(terminalSql, terminalParams) as unknown;
      const updatedCount = Array.isArray(updated)
        ? updated.length
        : Number((updated as { rowCount?: number } | undefined)?.rowCount ?? 0);
      if (updatedCount !== 1) throw new Error('READONLY_HOLD_DURABLE_STATE');
      const remaining = remainingMs();
      if (remaining <= 1) {
        // the deadline arrived between the last statement and the COMMIT:
        // terminate the lease backend through the independent connection —
        // an in-flight commit cannot land late
        sessionDiscarded = await terminateAndConfirmDiscard();
        commitUnknown = true;
        throw Object.assign(new Error('READONLY_HOLD_EXECUTION_TERMINAL_UNKNOWN'), { terminalUnknown: true, sessionDiscarded });
      }
      const committed = await Promise.race([
        lease.runner.query('COMMIT').then(() => true as const),
        new Promise<false>((resolve) => { commitTimer = setTimeout(() => resolve(false), remaining); }),
      ]).catch(() => false as const);
      if (committed !== true) {
        sessionDiscarded = await terminateAndConfirmDiscard();
        commitUnknown = true;
        throw Object.assign(new Error('READONLY_HOLD_EXECUTION_TERMINAL_UNKNOWN'), { terminalUnknown: true, sessionDiscarded });
      }
    } catch (error) {
      if (commitUnknown) {
        // the COMMIT outcome is genuinely unknown: the backend was terminated
        // and its discard CONFIRMED (sessionDiscarded) — the job keeps its
        // durable RUNNING row for operator review and the UNKNOWN outcome
        // propagates accurately.
        this.log.error(`READONLY_HOLD_TERMINAL_COMMIT_UNKNOWN;sessionDiscarded=${sessionDiscarded}`);
        throw error;
      }
      // bounded ROLLBACK on the same session; if it cannot be confirmed the
      // backend is terminated (independent connection) and the discard is
      // confirmed — the session never returns to the pool carrying a raw
      // BEGIN transaction.
      let rollbackKnown = false;
      try {
        await withBound(lease.runner.query('ROLLBACK'), 1_000, 'CHANJET_GUARD_ROLLBACK_TIMEOUT').then(() => { rollbackKnown = true; });
      } catch { /* handled below */ }
      if (!rollbackKnown) {
        sessionDiscarded = await terminateAndConfirmDiscard();
        this.log.error(`READONLY_HOLD_GATE_CLEANUP_UNKNOWN;sessionDiscarded=${sessionDiscarded}`);
      }
      throw error;
    } finally {
      if (commitTimer) clearTimeout(commitTimer);
    }
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

  // ---- durable execution binding (orchestration-driven first syncs) -------
  // No new schema: the binding rides request_scope.execution; the trusted
  // attributes live in chanjet_execution_admissions and are re-read, never
  // accepted from the caller.
  private executionSupportSingleton: { store: ChanjetExecutionAdmissionStore; guard: ReturnType<typeof createBoundedGuardExecutor> } | null = null;
  /** Fail-closed: an execution-bound run needs a guard that CAN durably stop
   *  the execution. A DataSource without a usable connection configuration
   *  (no URL, no host) refuses the run instead of silently falling back to a
   *  path that could not persist a stop. */
  private executionSupport(): { store: ChanjetExecutionAdmissionStore; guard: ReturnType<typeof createBoundedGuardExecutor> } {
    if (!this.executionSupportSingleton) {
      const connectionConfig = resolveGuardClientConfig((this.ds.options ?? {}) as GuardConnectionConfig);
      if (!connectionConfig) throw new Error('READONLY_HOLD_EXECUTION_GUARD_UNCONFIGURED');
      const guard = createBoundedGuardExecutor(connectionConfig);
      const store = new ChanjetExecutionAdmissionStore(this.ds.manager);
      store.setStandaloneExecutor(guard);
      this.executionSupportSingleton = { store, guard };
    }
    return this.executionSupportSingleton;
  }
  async onModuleDestroy(): Promise<void> {
    // hold AND release the scheduler-created guard executor: its dedicated
    // connection must not outlive the application (or a test suite)
    const support = this.executionSupportSingleton;
    this.executionSupportSingleton = null;
    await support?.guard.dispose().catch(() => undefined);
  }

  /** Row-sourced binding check: the caller names executionId+leaseId only;
   *  phase/approval/floor/deadline come from the admission row. The row's
   *  approval/floor must match the CURRENT approved policy, the row's
   *  verification must match the request, and the row's owner must be the
   *  authenticated caller — the row merely existing is never enough. */
  private async verifyExecutionBinding(
    execution: { executionId: string; leaseId: string },
    requestedBy: string,
    authPrincipal: string | undefined,
    request: ManualSyncRequest,
  ): Promise<ExecutionBinding | null> {
    if (typeof execution?.executionId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(execution.executionId)
      || typeof execution.leaseId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(execution.leaseId)) return null;
    const rows = await this.ds.query(
      `SELECT execution_id, owner_id, approval_id, floor_sha, manifest, phase, lease_id, hold_reason, deadline_at
         FROM chanjet_execution_admissions WHERE execution_id=$1`, [execution.executionId]).catch(() => []);
    const row = rows[0];
    if (!row) return null;
    try {
      validateExecutionManifest(row.manifest);
    } catch { return null; }
    // owner <-> authenticated caller authorization: the executing principal
    // (authenticated username) must BE the registered owner
    const principal = authPrincipal || requestedBy;
    if (!principal || String(row.owner_id) !== principal) return null;
    // registered approval/floor must be the CURRENT approved policy
    try {
      const policy = approvedReadonlyPolicy();
      if (String(row.approval_id) !== policy.approvalId || String(row.floor_sha) !== policy.floorSha) return null;
    } catch { return null; }
    // the row's verification must be consistent with the request
    const verification = (validateExecutionManifest(row.manifest).manifest.approval.verification);
    if (request.bookId !== undefined && request.bookId !== verification.bookId) return null;
    if (request.period !== undefined && request.period !== verification.period) return null;
    if (request.scope !== undefined && JSON.stringify([...request.scope].sort()) !== JSON.stringify([...verification.scope].sort())) return null;
    if (row.phase !== 'SYNCING' || row.lease_id !== execution.leaseId || row.hold_reason !== '') return null;
    if (!(row.deadline_at instanceof Date) || !(row.deadline_at.getTime() > Date.now())) return null;
    return {
      executionId: row.execution_id,
      leaseId: row.lease_id,
      phase: 'SYNCING',
      approvalId: String(row.approval_id),
      floorSha: String(row.floor_sha),
      deadlineAt: row.deadline_at.toISOString(),
    };
  }

  /** Rebuild the worker's execution context from the TRUSTED admission row at
   *  execution time (the enqueue-time check may be stale by then). */
  private async rebuildExecutionScopeContext(binding: ExecutionBinding): Promise<ExecutionContext> {
    const rows = await this.ds.query(
      `SELECT manifest, phase, lease_id, hold_reason, deadline_at
         FROM chanjet_execution_admissions WHERE execution_id=$1`, [binding.executionId]);
    const row = rows[0];
    if (!row) throw new Error('READONLY_HOLD_EXECUTION_CONTEXT');
    if (row.phase !== 'SYNCING' || row.lease_id !== binding.leaseId || row.hold_reason !== '') {
      throw new Error('READONLY_HOLD_EXECUTION_CONTEXT');
    }
    if (!(row.deadline_at instanceof Date)) throw new Error('READONLY_HOLD_EXECUTION_CONTEXT');
    const { manifest } = validateExecutionManifest(row.manifest);
    return { manifest, leaseId: row.lease_id, phase: 'SYNCING', deadlineAt: row.deadline_at };
  }

  /** Persist the durable stop through the reviewed bounded guard mechanism.
   *  A failed stop is NEVER claimed as persisted — it is reported as
   *  UNCONFIRMED for the operator instead of being swallowed. */
  private async holdExecutionSafely(current: ExecutionContext, reason: 'TRANSPORT_FAILURE' | 'CANCELLED' | 'ACK_UNVERIFIED' | 'RESERVE_UNVERIFIED' | 'DEADLINE'): Promise<boolean> {
    try {
      await this.executionSupport().store.holdExecution(current, reason);
      return true;
    } catch {
      this.log.error('READONLY_HOLD_EXECUTION_STOP_UNCONFIRMED');
      return false;
    }
  }

  private executionHoldReason(error: unknown): 'TRANSPORT_FAILURE' | 'CANCELLED' | 'DEADLINE' {
    const text = String(error instanceof Error ? error.message : error);
    if (/DEADLINE|EXECUTION_DEADLINE|timeout|timed out|abort/i.test(text)) return 'DEADLINE';
    if (/TRANSPORT_FAILURE|socket|network/i.test(text)) return 'TRANSPORT_FAILURE';
    return 'CANCELLED';
  }

  /** The worker's own counted BUSINESS-OK receipts under the bound lease. */
  private async countWorkerBusinessOk(binding: ExecutionBinding): Promise<number> {
    const [row] = await this.ds.query(
      `SELECT count(*)::integer AS n FROM chanjet_execution_requests
        WHERE execution_id=$1 AND phase='SYNCING' AND lease_id=$2
          AND kind='BUSINESS' AND status='ACKNOWLEDGED' AND result='OK'`,
      [binding.executionId, binding.leaseId],
    ).catch(() => [{ n: 0 }]);
    return Number(row?.n || 0);
  }
  private async maxWorkerReceiptOrdinal(binding: ExecutionBinding): Promise<number> {
    const [row] = await this.ds.query(
      `SELECT COALESCE(max(ordinal),0)::integer AS n FROM chanjet_execution_requests
        WHERE execution_id=$1 AND phase='SYNCING' AND lease_id=$2`,
      [binding.executionId, binding.leaseId],
    ).catch(() => [{ n: 0 }]);
    return Number(row?.n || 0);
  }
  /** THIS run's worker BUSINESS-OK receipt ordinals (strictly above the
   *  pre-cycle watermark — rehearsal ACKs are excluded by construction). */
  private async workerReceiptOrdinalsAbove(binding: ExecutionBinding, watermark: number): Promise<number[]> {
    const rows = await this.ds.query(
      `SELECT ordinal FROM chanjet_execution_requests
        WHERE execution_id=$1 AND phase='SYNCING' AND lease_id=$2
          AND kind='BUSINESS' AND status='ACKNOWLEDGED' AND result='OK' AND ordinal > $3
        ORDER BY ordinal`, [binding.executionId, binding.leaseId, watermark]).catch(() => []);
    return rows.map((r: { ordinal: number }) => Number(r.ordinal));
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
