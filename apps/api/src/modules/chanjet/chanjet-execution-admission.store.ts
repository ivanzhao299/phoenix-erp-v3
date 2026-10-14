import { randomUUID } from 'node:crypto';
import { admissionHold, validateExecutionManifest, ExecutionManifest } from './chanjet-execution-manifest';

type Tx = { query(sql: string, parameters?: unknown[]): Promise<AdmissionRow[]> };
export type AdmissionManager = { transaction<T>(callback: (tx: Tx) => Promise<T>): Promise<T> };
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
 * Unwired control foundation, intentionally not Injectable or exported by a Nest module.
 * No HTTP, scheduler or provider code imports this store. Future registration belongs
 * only to the exact-SHA root CLI after its FD9/production/mapping/tuple guards.
 * DB constraints preserve bindings under ordinary DML, not a hostile table owner.
 */
export class ChanjetExecutionAdmissionStore {
  /**
   * Every store transaction is DB-time bounded: with a trusted deadline the
   * statement/lock timeouts equal the remaining execution budget; without one
   * a conservative constant still prevents indefinite waits. Timeouts raise
   * inside the transaction, which rolls back and surfaces as a hold — no
   * background transaction survives the caller's failure.
   */
  private static timeoutBound(deadlineAt?: Date): number {
    if (deadlineAt instanceof Date && Number.isFinite(deadlineAt.getTime())) {
      return Math.max(1, Math.min(deadlineAt.getTime() - Date.now(), 15_000));
    }
    return 2_000;
  }
  constructor(private readonly manager: AdmissionManager | undefined) {}
  private async transaction<T>(callback: (tx: Tx) => Promise<T>, deadlineAt?: Date): Promise<T> {
    if (!this.manager || typeof this.manager.transaction !== 'function') return admissionHold();
    const bound = ChanjetExecutionAdmissionStore.timeoutBound(deadlineAt);
    const timed = async (tx: Tx): Promise<T> => {
      await tx.query(`SET LOCAL statement_timeout=${bound}`);
      await tx.query(`SET LOCAL lock_timeout=${Math.min(bound, 1_000)}`);
      return callback(tx);
    };
    try { return await this.manager.transaction(timed); } catch { return admissionHold(); }
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
  async holdExecution(context: ExecutionContext, reason: 'TRANSPORT_FAILURE' | 'CANCELLED' | 'ACK_UNVERIFIED' | 'RESERVE_UNVERIFIED'): Promise<void> {
    if (!/^[A-Z][A-Z0-9_]{0,47}$/.test(reason)) admissionHold();
    await this.transaction(async tx => {
      const r = await this.lock(tx,context.manifest);
      if (r.phase === 'HOLD' || r.phase === 'VERIFIED') return;
      await tx.query(`UPDATE chanjet_execution_admissions SET phase='HOLD',lease_id='',hold_reason=$2 WHERE execution_id=$1`, [r.execution_id,reason]);
    });
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
