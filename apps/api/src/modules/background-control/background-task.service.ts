import { BeforeApplicationShutdown, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { BackgroundAdmissionDeniedError, BackgroundIdentity, BackgroundTaskKind } from './background-control.types';
import { BackgroundManifestReader } from './background-manifest.reader';
import { BackgroundLockBackend } from './background-lock.backend';

interface TaskGraph { count: number; closed: boolean; grants: ReadonlySet<BackgroundTaskKind> }
@Injectable()
export class BackgroundTaskService implements BeforeApplicationShutdown, OnModuleInit {
  private readonly logger = new Logger(BackgroundTaskService.name);
  private readonly context = new AsyncLocalStorage<TaskGraph>();
  private readonly graphs = new Set<TaskGraph>();
  private queue: Promise<unknown> = Promise.resolve();
  private poisoned = false;
  private stopping = false;
  private executionHeld = false;
  private lastOwner?: string;
  private lastGeneration?: number;
  private shutdownPromise?: Promise<void>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private heartbeatPending = false;
  private initialization?: Promise<void>;
  private statusObservation?: Promise<ReturnType<BackgroundTaskService['status']>>;
  readonly identity: BackgroundIdentity = {
    bootId: randomUUID(),
  };
  constructor(private readonly manifest: BackgroundManifestReader, private readonly backend: BackgroundLockBackend) {
    backend.bindLoss(() => { this.poisoned = true; });
    backend.bindIdentity(this.identity.bootId);
  }
  onModuleInit(): Promise<void> {
    if (!this.initialization) this.initialization = this.initialize();
    return this.initialization;
  }
  private async initialize() {
    // A control-only session is established even while startup work is default denied.
    await this.serialized(async () => { await this.backend.probe(); });
    const { protocolVersion, bootId, phase, controlSession } = this.status();
    // Explicit allowlist: never serialize the manifest, approval owner, DB config or task arguments.
    this.logger.log(`BACKGROUND_CONTROL_BOOT=${JSON.stringify({ protocolVersion, bootId, phase, controlSession: {
      connected: controlSession.connected, broken: controlSession.broken,
      sessionPid: controlSession.sessionPid, databaseOid: controlSession.databaseOid,
      backendStartedAt: controlSession.backendStartedAt, applicationName: controlSession.applicationName,
    } })}`);
    this.heartbeat = setInterval(() => {
      if (this.stopping || this.poisoned || this.heartbeatPending) return;
      // Reserve before enqueueing: the serialized control session may be stalled.
      this.heartbeatPending = true;
      void this.serialized(async () => {
        if (!this.stopping && !this.poisoned) await this.backend.probe();
      }).catch(() => { this.poisoned = true; }).finally(() => { this.heartbeatPending = false; });
    }, 1000);
    this.heartbeat.unref();
  }
  private serialized<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private async admit(kind: BackgroundTaskKind): Promise<TaskGraph> {
    return this.serialized(async () => {
      if (this.stopping || this.poisoned) throw new BackgroundAdmissionDeniedError('PARTICIPANT_HOLD');
      let entered = false;
      try {
        entered = await this.backend.gateEnter();
        if (!entered) throw new BackgroundAdmissionDeniedError('ADMISSION_GATE_FENCED');
        const m = this.manifest.authorize(this.identity, kind);
        if (!this.executionHeld) {
          if (!await this.backend.executionEnter()) throw new BackgroundAdmissionDeniedError('EXECUTION_GATE_HELD');
          this.executionHeld = true;
        }
        if (this.poisoned || this.stopping) throw new BackgroundAdmissionDeniedError('PARTICIPANT_HOLD');
        const participant = m.participants.find(p => p.bootId === this.identity.bootId)!;
        const graph: TaskGraph = { count: 1, closed: false, grants: new Set(participant.allowedKinds) };
        this.graphs.add(graph); this.lastOwner = m.owner; this.lastGeneration = m.generation;
        return graph;
      } catch (error) {
        if (!(error instanceof BackgroundAdmissionDeniedError)) this.poisoned = true;
        throw error;
      } finally {
        if (entered) {
          try {
            // Shutdown can win after execution admission but before graph registration.
            if (this.executionHeld && this.graphs.size === 0 && !this.poisoned) {
              await this.backend.executionExit(); this.executionHeld = false;
            }
          } finally { await this.backend.gateExit(); }
        }
      }
    });
  }
  private async finish(graph: TaskGraph) {
    graph.count--;
    if (graph.count !== 0) return;
    graph.closed = true;
    await this.serialized(async () => {
      this.graphs.delete(graph);
      if (this.graphs.size === 0 && this.executionHeld && !this.poisoned) {
        await this.backend.executionExit(); this.executionHeld = false;
      }
    });
  }
  async run<T>(_name: string, kind: BackgroundTaskKind, work: () => Promise<T>): Promise<T> {
    const parent = this.context.getStore();
    let graph: TaskGraph;
    if (parent) {
      if (parent.closed || this.poisoned || !parent.grants.has(kind)) throw new BackgroundAdmissionDeniedError('CHILD_UNAUTHORIZED');
      graph = parent; graph.count++;
    } else graph = await this.admit(kind);
    try { return await this.context.run(graph, work); }
    finally { await this.finish(graph); }
  }
  async runScheduled<T>(name: string, kind: BackgroundTaskKind, work: () => Promise<T>): Promise<T | undefined> {
    let started = false;
    try { return await this.run(name, kind, async () => { started = true; return work(); }); }
    catch (error) { if (!started && error instanceof BackgroundAdmissionDeniedError) return undefined; throw error; }
  }
  spawn(name: string, kind: BackgroundTaskKind, work: () => Promise<unknown>): void {
    // Calling run synchronously registers a nested child before its parent can settle.
    let started = false;
    void this.run(name, kind, async () => { started = true; return work(); }).catch(error => {
      if (started || !(error instanceof BackgroundAdmissionDeniedError)) this.logger.error('BACKGROUND_TASK_FAILED');
    });
  }
  /** Internal one-way resource failure signal. It cannot grant admission or
   * discard work; the registered owner must still observe actual settlement. */
  resourceHold(): void { this.poisoned = true; }
  /** Sample after already-owned control queries settle. This does not pause
   * heartbeat, discard business graphs or grant admission. Concurrent readers
   * share only the in-progress read; a completed snapshot is never cached. */
  observeStatus(): Promise<ReturnType<BackgroundTaskService['status']>> {
    if (this.statusObservation) return this.statusObservation;
    const work = this.serialized(async () => this.status());
    this.statusObservation = work;
    void work.then(() => {
      if (this.statusObservation === work) this.statusObservation = undefined;
    }, () => {
      if (this.statusObservation === work) this.statusObservation = undefined;
    });
    return work;
  }
  status() {
    let phase = 'HOLD';
    let owner: string | null = this.lastOwner ?? null;
    let generation: number | null = this.lastGeneration ?? null;
    try {
      const manifest = this.manifest.read();
      phase = manifest.phase; owner = manifest.owner; generation = manifest.generation;
      if (phase === 'OPEN' && !manifest.participants.some(p => p.bootId === this.identity.bootId
        && manifest.targetSha === p.revision)) phase = 'HOLD';
    } catch { /* Missing control is HOLD. */ }
    return {
      protocolVersion: 1, ...this.identity, hostname: hostname(), phase: this.poisoned || this.stopping ? 'HOLD' : phase,
      inFlight: [...this.graphs].reduce((count, graph) => count + graph.count, 0),
      pendingChildren: [...this.graphs].reduce((count, graph) => count + Math.max(0, graph.count - 1), 0),
      taskGraphs: this.graphs.size, poisoned: this.poisoned, stopping: this.stopping,
      owner, generation,
      controlSession: this.backend.status(),
    };
  }
  shutdown(deadlineMs = 30000): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.stopping = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { this.poisoned = true; reject(new BackgroundAdmissionDeniedError('DRAIN_TIMEOUT_OR_SESSION_LOST')); }, deadlineMs);
    });
    this.shutdownPromise = Promise.race([this.drain(deadlineMs), timeout]).finally(() => clearTimeout(timer));
    return this.shutdownPromise;
  }
  private async drain(deadlineMs: number): Promise<void> {
    const deadline = Date.now() + deadlineMs;
    await this.serialized(async () => undefined);
    if (this.poisoned) throw new BackgroundAdmissionDeniedError('DRAIN_TIMEOUT_OR_SESSION_LOST');
    while (this.graphs.size > 0) {
      if (Date.now() >= deadline || this.poisoned) {
        this.poisoned = true; throw new BackgroundAdmissionDeniedError('DRAIN_TIMEOUT_OR_SESSION_LOST');
      }
      await new Promise(resolve => setTimeout(resolve, Math.min(25, Math.max(1, deadline - Date.now()))));
    }
    await this.serialized(async () => {
      if (this.poisoned) throw new BackgroundAdmissionDeniedError('DRAIN_TIMEOUT_OR_SESSION_LOST');
      if (this.executionHeld) { await this.backend.executionExit(); this.executionHeld = false; }
      await this.backend.close();
    });
  }
  beforeApplicationShutdown() {
    // The outer maintenance shutdown records the original drain failure and
    // keeps the operation in HOLD. Nest must still continue its remaining
    // teardown hooks (especially TypeORM pool disposal); rethrowing the cached
    // rejection here would abort that teardown and leave an unnamed backend.
    return this.shutdown().catch(() => {
      this.logger.error('BACKGROUND_SHUTDOWN_HOLD');
      return undefined;
    });
  }
}
