import { randomUUID } from 'node:crypto';
import { admissionHold, validateExecutionManifest, ExecutionManifest } from './chanjet-execution-manifest';

type Tx = { query(sql: string, parameters?: unknown[]): Promise<AdmissionRow[]> };
export type AdmissionManager = { transaction<T>(callback: (tx: Tx) => Promise<T>): Promise<T> };
export type AdmissionTransactionOwner = { run<T>(start: () => Promise<T>): Promise<T> };
export type AdmissionPhase = 'REGISTERED' | 'PROBING' | 'PROBED' | 'SYNCING' | 'VERIFIED' | 'HOLD';
export type RequestPhase = 'PROBING' | 'SYNCING';
export type RequestResult = 'OK' | 'BUSINESS_FAILURE' | 'TRANSPORT_FAILURE';
const REQUEST_RESULTS: readonly RequestResult[] = ['OK', 'BUSINESS_FAILURE', 'TRANSPORT_FAILURE'];
export type RequestKind = 'BUSINESS' | 'DISCOVERY' | 'CERTIFICATE' | 'TOKEN' | 'RESEND';
export type AdmissionRow = {
  execution_id: string; approval_id: string; owner_id: string; manifest: ExecutionManifest;
  canonical_manifest: string; manifest_digest: string; request_cap: number; request_count: number;
  started_at: Date; deadline_at: Date; phase: AdmissionPhase; lease_id: string; hold_reason: string;
  db_now: Date;
};
export type ExecutionContext = { manifest: unknown; leaseId: string; phase: RequestPhase; deadlineAt?: Date };

/**
 * Storage-only control primitive; not Injectable and has no provider HTTP path.
 * The API scheduler supplies its task-graph transaction owner. Independent root
 * CLIs retain their existing FD9/production/mapping/tuple supervision contract.
 * DB constraints preserve bindings under ordinary DML, not a hostile table owner.
 */
/**
 * Minimal raw executor for guard-only statements (the stop write). Deliberately
 * NOT deadline-bound: the stop must stay persistable even after the execution
 * deadline has passed, and it must not queue behind a saturated business pool.
 */
export type StandaloneExecutor = { query(sql: string, parameters?: unknown[]): Promise<unknown[]> };

export class ChanjetExecutionAdmissionStore {
  private standalone: StandaloneExecutor | undefined;
  /** Controlled DB entry: registers the guard-write executor. */
  setStandaloneExecutor(executor: StandaloneExecutor): void {
    this.standalone = executor;
  }
  /**
   * Absolute-deadline DB access. Three distinct bounds are maintained:
   *   1. per-SQL budget: recomputed as the REMAINING execution budget before
   *      every statement (a transaction of several short statements cannot
   *      silently outlive the execution deadline);
   *   2. pool/transaction acquisition: bounded by the absolute-deadline race
   *      below — the caller returns on time; a late-acquired transaction runs
   *      its deadline check before any SQL, so no callback SQL executes on
   *      a late-acquired connection. Already-started
   *      transactions can still settle after caller timeout. Pool acquisition
   *      itself cannot be per-call cancelled through the TypeORM manager
   *      interface — documented limitation; self-created sources set
   *      connectionTimeoutMillis instead;
   *   3. without a trusted deadline a conservative per-statement constant
   *      still prevents unbounded waits (scope callers reject instead).
   */
  private static timeoutBound(deadlineAt: Date | undefined, now = Date.now()): number {
    if (deadlineAt instanceof Date && Number.isFinite(deadlineAt.getTime())) {
      return Math.max(1, Math.min(deadlineAt.getTime() - now, 15_000));
    }
    return 2_000;
  }
  constructor(private readonly manager: AdmissionManager | undefined, private readonly owner?: AdmissionTransactionOwner) {}
  private ownedTransaction<T>(callback: (tx: Tx) => Promise<T>): Promise<T> {
    const start = () => this.manager!.transaction(callback);
    return this.owner ? this.owner.run(start) : start();
  }
  private async transaction<T>(callback: (tx: Tx) => Promise<T>, deadlineAt?: Date): Promise<T> {
    if (!this.manager || typeof this.manager.transaction !== 'function') return admissionHold();
    const timed = async (tx: Tx): Promise<T> => {
      // Per-statement remaining budget: every SQL re-derives its own timeout
      // from the absolute deadline, so cumulative execution cannot exceed it.
      const boundedTx: Tx = {
        query: async (sql: string, parameters?: unknown[]) => {
          // Expired: abort before executing ANY statement (including the
          // timeout guards) so a late-acquired transaction cannot even start
          // callback work, let alone commit it.
          if (deadlineAt instanceof Date && Date.now() >= deadlineAt.getTime()) {
            throw new Error('CHANJET_EXECUTION_DEADLINE');
          }
          const budget = ChanjetExecutionAdmissionStore.timeoutBound(deadlineAt);
          await tx.query(`SET LOCAL statement_timeout=${budget}`);
          await tx.query(`SET LOCAL lock_timeout=${Math.min(budget, 1_000)}`);
          return tx.query(sql, parameters);
        },
      };
      return callback(boundedTx);
    };
    if (!(deadlineAt instanceof Date) || !Number.isFinite(deadlineAt.getTime())) {
      // No trusted deadline: still bounded per statement by the constant.
      try { return await this.ownedTransaction(timed); } catch { return admissionHold(); }
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // The race ends caller waiting only. The owner registers the entire
      // manager promise before acquisition, including commit/rollback/release.
      // Late-acquired callback SQL is denied by its deadline check; this is
      // not cancellation or proof that an already-started commit did not occur.
      return await Promise.race([
        this.ownedTransaction(timed),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('CHANJET_EXECUTION_DEADLINE')), Math.max(1, deadlineAt.getTime() - Date.now()));
        }),
      ]);
    } catch {
      return admissionHold();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  /** A persisted stop (hold_reason <> '') is recorded with phase=HOLD; the phase
   *  checks below already fail every further mutation — this guard makes the
   *  reason explicit at each entry point. */
  private static stopped(row: AdmissionRow): boolean {
    return typeof row.hold_reason === 'string' && row.hold_reason !== '';
  }
  private async lock(tx: Tx, value: unknown): Promise<AdmissionRow> {
    const b = validateExecutionManifest(value);
    const rows = await tx.query(`SELECT *, clock_timestamp() AS db_now FROM chanjet_execution_admissions
      WHERE execution_id=$1 FOR UPDATE`, [b.manifest.executionId]);
    if (rows.length !== 1 || rows[0].canonical_manifest !== b.canonical || rows[0].manifest_digest !== b.digest
      || JSON.stringify(validateExecutionManifest(rows[0].manifest).manifest) !== b.canonical) return admissionHold();
    const [counts] = await tx.query(`SELECT count(*)::integer AS n, COALESCE(max(ordinal),0)::integer AS ordinal
      FROM chanjet_execution_requests WHERE execution_id=$1`, [b.manifest.executionId]);
    const receipts = counts as unknown as { n: number; ordinal: number };
    if (!Number.isInteger(rows[0].request_count) || rows[0].request_count < 0
      || receipts.n !== rows[0].request_count || receipts.ordinal !== rows[0].request_count) return admissionHold();
    // SELECT's target clock can precede a lock wait. Always sample again after acquiring the lock.
    const [clock] = await tx.query('SELECT clock_timestamp() AS db_now');
    rows[0].db_now = clock.db_now;
    return rows[0];
  }
  private async held(tx: Tx, row: AdmissionRow, reason: 'DEADLINE' | 'CAP' | 'INTERRUPTED'): Promise<void> {
    if (row.phase === 'HOLD' || row.phase === 'VERIFIED') return;
    await tx.query(`UPDATE chanjet_execution_admissions SET phase='HOLD',lease_id='',hold_reason=$2 WHERE execution_id=$1`, [row.execution_id,reason]);
  }
  private expired(row: AdmissionRow): boolean {
    if (!(row.db_now instanceof Date) || !(row.deadline_at instanceof Date)) return admissionHold();
    return row.db_now.getTime() >= row.deadline_at.getTime();
  }
  private context(row: AdmissionRow, context: ExecutionContext): void {
    if (typeof context.leaseId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(context.leaseId)
      || context.leaseId !== row.lease_id || context.phase !== row.phase || !['PROBING','SYNCING'].includes(context.phase)) admissionHold();
  }
  /** INSERT-only: exact duplicates and a new executionId for the same approval both reject. */
  async registerFromReviewedRootManifest(value: unknown): Promise<AdmissionRow> {
    const b = validateExecutionManifest(value), m = b.manifest;
    return this.transaction(async tx => {
      const rows = await tx.query(`INSERT INTO chanjet_execution_admissions
        (execution_id,approval_id,owner_id,floor_sha,manifest,canonical_manifest,manifest_digest,
         request_cap,total_timeout_ms,http_timeout_ms,verification_expires_at)
        VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11::timestamptz) RETURNING *,clock_timestamp() AS db_now`,
      [m.executionId,m.approval.approvalId,m.ownerId,m.approval.floorSha,b.canonical,b.canonical,b.digest,
        m.requestCap,m.totalTimeoutMs,m.httpTimeoutMs,m.approval.verification.expiresAt]);
      if (rows.length !== 1) return admissionHold();
      return rows[0];
    });
  }
  /** Read an exact binding; never register, extend, reset or replay it. */
  async load(value: unknown): Promise<AdmissionRow> {
    return this.transaction(tx => this.lock(tx,value));
  }
  async begin(value: unknown, phase: 'PROBING' | 'SYNCING', leaseId: string): Promise<AdmissionRow> {
    if (!['PROBING','SYNCING'].includes(phase) || typeof leaseId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(leaseId)) return admissionHold();
    const row = await this.transaction(async tx => {
      const r = await this.lock(tx,value);
      if (ChanjetExecutionAdmissionStore.stopped(r) || r.phase !== (phase === 'PROBING' ? 'REGISTERED' : 'PROBED')) return admissionHold();
      if (this.expired(r)) { await this.held(tx,r,'DEADLINE'); return null; }
      if (phase === 'SYNCING') {
        const used = await tx.query('SELECT execution_id FROM chanjet_execution_requests WHERE execution_id=$1 AND lease_id=$2 LIMIT 1', [r.execution_id,leaseId]);
        if (used.length) return admissionHold();
      }
      const [next] = await tx.query(`WITH changed AS (UPDATE chanjet_execution_admissions SET phase=$2,lease_id=$3
        WHERE execution_id=$1 RETURNING *) SELECT *,clock_timestamp() AS db_now FROM changed`, [r.execution_id,phase,leaseId]);
      return next;
    });
    return row || admissionHold();
  }
  /** The caller receives a ticket only AFTER reservation transaction commit acknowledgement. */
  async reserve(context: ExecutionContext, kind: RequestKind): Promise<{ ticket: string; ordinal: number; deadlineAt: Date }> {
    if (!context || !['BUSINESS','DISCOVERY','CERTIFICATE','TOKEN','RESEND'].includes(kind)) return admissionHold();
    const ticket = randomUUID();
    const result = await this.transaction(async tx => {
      const r = await this.lock(tx,context.manifest); this.context(r,context);
      if (ChanjetExecutionAdmissionStore.stopped(r)) return admissionHold();
      if (this.expired(r)) { await this.held(tx,r,'DEADLINE'); return null; }
      if (r.request_count >= r.request_cap) { await this.held(tx,r,'CAP'); return null; }
      const [next] = await tx.query(`WITH changed AS (UPDATE chanjet_execution_admissions SET request_count=request_count+1
        WHERE execution_id=$1 RETURNING *) SELECT *,clock_timestamp() AS db_now FROM changed`, [r.execution_id]);
      await tx.query(`INSERT INTO chanjet_execution_requests (ticket,execution_id,ordinal,lease_id,kind,phase)
        VALUES ($1,$2,$3,$4,$5,$6)`, [ticket,r.execution_id,next.request_count,context.leaseId,kind,r.phase]);
      return { ticket, ordinal:next.request_count, deadlineAt:next.deadline_at };
    }, context.deadlineAt);
    return result || admissionHold();
  }
  async acknowledge(context: ExecutionContext, ticket: string, result: RequestResult): Promise<void> {
    if (!context || typeof ticket !== 'string' || !/^[a-f0-9-]{36}$/.test(ticket)) return admissionHold();
    if (!REQUEST_RESULTS.includes(result)) admissionHold();
    const accepted = await this.transaction(async tx => {
      const r = await this.lock(tx,context.manifest); this.context(r,context);
      if (ChanjetExecutionAdmissionStore.stopped(r)) return admissionHold();
      if (this.expired(r)) { await this.held(tx,r,'DEADLINE'); return false; }
      const rows = await tx.query(`WITH changed AS (UPDATE chanjet_execution_requests SET status='ACKNOWLEDGED',result=$5
        WHERE ticket=$1 AND execution_id=$2 AND lease_id=$3 AND phase=$4 AND status='RESERVED' RETURNING execution_id) SELECT execution_id FROM changed`,
      [ticket,r.execution_id,context.leaseId,context.phase,result]);
      if (rows.length !== 1) return admissionHold();
      return true;
    }, context.deadlineAt);
    if (!accepted) admissionHold();
  }

  /**
   * Mirror-write boundary gate for execution-bound workers: re-reads the row
   * under lock (bounded by the execution deadline) and refuses when the
   * execution has been durably held or drifted. Called at the REAL mirror
   * write boundaries (snapshot upsert, aggregate delete/upsert,
   * reconciliation) — the terminal SUCCESS gate does NOT replace this.
   */
  async assertWritable(context: ExecutionContext): Promise<AdmissionRow> {
    const row = await this.transaction(async tx => {
      const r = await this.lock(tx, context.manifest);
      this.context(r, context);
      if (ChanjetExecutionAdmissionStore.stopped(r)) return admissionHold();
      if (this.expired(r)) { await this.held(tx, r, 'DEADLINE'); return admissionHold(); }
      return r;
    }, context.deadlineAt);
    return row || admissionHold();
  }

  /**
   * Post-reserve revalidation executed BEFORE any HTTP leaves: re-reads the
   * row under lock and rejects when the execution has been persistently held
   * or drifted since the reservation committed. The already-committed receipt
   * stays RESERVED — evidence, never refunded or deleted.
   */
  async assertSendable(context: ExecutionContext): Promise<AdmissionRow> {
    const row = await this.transaction(async tx => {
      const r = await this.lock(tx,context.manifest); this.context(r,context);
      if (ChanjetExecutionAdmissionStore.stopped(r)) return admissionHold();
      if (this.expired(r)) { await this.held(tx,r,'DEADLINE'); return admissionHold(); }
      return r;
    }, context.deadlineAt);
    return row || admissionHold();
  }

  /**
   * Persist a terminal stop for the whole execution (transport failure,
   * cancellation, unverifiable commit/acknowledgement) via the same HOLD
   * transition the CAP/DEADLINE holds use — the stop survives process and
   * connection boundaries and every later mutation fails closed. Successful
   * business exchanges never call this.
   */
  async holdExecution(context: ExecutionContext, reason: 'TRANSPORT_FAILURE' | 'CANCELLED' | 'ACK_UNVERIFIED' | 'RESERVE_UNVERIFIED' | 'DEADLINE'): Promise<'CONFIRMED' | 'ALREADY_STOPPED' | 'NO_HOLD_NEEDED'> {
    if (!/^[A-Z][A-Z0-9_]{0,47}$/.test(reason)) admissionHold();
    if (this.standalone) {
      // ONE atomic UPDATE whose WHERE clause carries the FULL registration
      // binding (execution, owner, approval, floor, canonical manifest,
      // digest) and excludes terminal phases. A wrong tuple updates zero rows
      // and is classified by a follow-up read — a valid execution is never
      // changed. TypeORM wraps UPDATE..RETURNING as [rows, affectedCount], so
      // the result is unwrapped before the count check. The guard statement
      // deliberately runs WITHOUT the execution-deadline binding (guard
      // exemption; bounded by the standalone executor's own caps).
      const binding = validateExecutionManifest(context.manifest);
      const m = binding.manifest;
      const raw = await this.standalone.query(
        `UPDATE chanjet_execution_admissions
         SET phase='HOLD', lease_id='', hold_reason=$6
         WHERE execution_id=$1 AND owner_id=$2 AND approval_id=$3 AND floor_sha=$4
           AND canonical_manifest=$5 AND manifest_digest=$7
           AND phase IN ('REGISTERED','PROBING','PROBED','SYNCING')
         RETURNING execution_id`,
        [m.executionId, m.ownerId, m.approval.approvalId, m.approval.floorSha, binding.canonical, reason, binding.digest],
      );
      const updated = (Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : raw) as Array<{ execution_id: string }>;
      if (updated.length === 1) return 'CONFIRMED'; // exactly one row changed
      if (updated.length > 1) admissionHold(); // cannot happen (pkey)
      // zero rows: classify atomically by reading the current row state — the
      // FULL registration binding must match before a terminal state is
      // acknowledged; a wrong tuple never confirms a hold
      const existing = await this.standalone.query(
        'SELECT phase, hold_reason, owner_id, approval_id, floor_sha, canonical_manifest, manifest_digest FROM chanjet_execution_admissions WHERE execution_id=$1',
        [m.executionId],
      ) as Array<{ phase: string; hold_reason: string; owner_id: string; approval_id: string; floor_sha: string; canonical_manifest: string; manifest_digest: string }>;
      if (!existing.length) admissionHold(); // unregistered execution
      const r0 = existing[0];
      const bindingMatches = r0.owner_id === m.ownerId
        && r0.approval_id === m.approval.approvalId
        && r0.floor_sha === m.approval.floorSha
        && r0.canonical_manifest === binding.canonical
        && r0.manifest_digest === binding.digest;
      if (!bindingMatches) admissionHold(); // row bound to a DIFFERENT registration
      if (r0.phase === 'HOLD') return 'ALREADY_STOPPED'; // stop already persisted
      if (r0.phase === 'VERIFIED') return 'NO_HOLD_NEEDED'; // verified: no hold applies
      admissionHold(); // live execution with mismatched binding: must not be changed
    }
    const result = await this.transaction(async tx => {
      const r = await this.lock(tx,context.manifest);
      if (r.phase === 'HOLD' || r.phase === 'VERIFIED') return 'ALREADY_STOPPED';
      await tx.query(`UPDATE chanjet_execution_admissions SET phase='HOLD',lease_id='',hold_reason=$2 WHERE execution_id=$1`, [r.execution_id,reason]);
      return 'CONFIRMED';
    }, context.deadlineAt);
    return result ?? 'UNCONFIRMED';
  }
  async finish(context: ExecutionContext, phase: 'PROBED' | 'VERIFIED'): Promise<AdmissionRow> {
    if (!context || !['PROBED','VERIFIED'].includes(phase)) return admissionHold();
    const next = await this.transaction(async tx => {
      const r = await this.lock(tx,context.manifest); this.context(r,context);
      if (ChanjetExecutionAdmissionStore.stopped(r)) return admissionHold();
      if (r.phase !== (phase === 'PROBED' ? 'PROBING' : 'SYNCING')) return admissionHold();
      if (this.expired(r)) { await this.held(tx,r,'DEADLINE'); return null; }
      // Trigger independently rejects outstanding RESERVED tickets and phase regression.
      const [row] = await tx.query(`WITH changed AS (UPDATE chanjet_execution_admissions SET phase=$2,lease_id=''
        WHERE execution_id=$1 RETURNING *) SELECT *,clock_timestamp() AS db_now FROM changed`, [r.execution_id,phase]);
      return row;
    }, context.deadlineAt);
    return next || admissionHold();
  }
  /** Called only by future restart reconciliation; active/ambiguous work is never resumed. */
  async recoverInterrupted(value: unknown): Promise<AdmissionRow> {
    await this.transaction(async tx => {
      const r = await this.lock(tx,value);
      if (['PROBING','SYNCING'].includes(r.phase)) await this.held(tx,r,'INTERRUPTED');
      else if (this.expired(r)) await this.held(tx,r,'DEADLINE');
    });
    return this.load(value);
  }
}
