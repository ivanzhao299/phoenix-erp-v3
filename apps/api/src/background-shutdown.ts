import { INestApplication } from '@nestjs/common';
import { writeSync } from 'node:fs';
import { BackgroundTaskService } from './modules/background-control/background-task.service';

/** Drain before Nest disposes domain leases. Native shutdown hooks run too late. */
export function installBackgroundShutdown(
  app: Pick<INestApplication, 'close'>,
  tasks: Pick<BackgroundTaskService, 'shutdown'>,
  signals: Pick<NodeJS.Process, 'once'> = process,
  closeOwnedResources?: () => Promise<void>,
) {
  const close = app.close.bind(app);
  let closing: Promise<void> | undefined;
  app.close = () => {
    closing ??= (async () => {
      try { writeSync(2, 'BACKGROUND_SHUTDOWN_CLOSING\n'); } catch { /* diagnostics only */ }
      // Keep the drain bounded well inside Docker's typed 30-second stop
      // deadline, leaving enough time for Nest/TypeORM to dispose pools.
      try {
        await tasks.shutdown(3_000);
      } catch (error) {
        // A failed drain is a HOLD. The single BACKGROUND_SHUTDOWN_HOLD marker
        // is emitted here, while the HTTP listener still serves the fenced
        // status and denial observations. The process then stays alive with
        // its domain leases retained until the owner's documented forced
        // termination; the signal path never converts a drain failure into an
        // unobserved self-exit or into a successful close.
        // Synchronous stderr write: pipe buffers do not survive process.exit,
        // and the fault observation contract requires this marker exactly once.
        try { writeSync(2, 'BACKGROUND_SHUTDOWN_HOLD\n'); writeSync(1, 'BACKGROUND_SHUTDOWN_HOLD\n'); } catch { /* retained HOLD still throws */ }
        try { writeSync(2, `BACKGROUND_SHUTDOWN_REASON=${String((error as Error | undefined)?.message ?? error).slice(0, 120)}\n`); } catch { /* diagnostics only */ }
        throw error;
      }
      try { writeSync(2, 'BACKGROUND_SHUTDOWN_DRAIN=RESOLVED\n'); writeSync(1, 'BACKGROUND_SHUTDOWN_DRAIN=RESOLVED\n'); } catch { /* diagnostics only */ }
      if (closeOwnedResources) {
        try { await closeOwnedResources(); } catch { /* healthy drain already settled owned work */ }
      }
      await close();
    })();
    return closing;
  };
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    signals.once(signal, () => {
      // Diagnostic-only line (distinct from the fault marker count): records
      // the admission state the drain actually observed.
      try { writeSync(2, `BACKGROUND_SHUTDOWN_SIGNAL=${signal},poisoned=${String((tasks as BackgroundTaskService).status().poisoned)},stopping=${String((tasks as BackgroundTaskService).status().stopping)}\n`); } catch { /* diagnostics only */ }
      // Diagnostic liveness heartbeat: bounded, distinguishes an early clean
      // exit from a drain that is still working through its bounded budget.
      let aliveTicks = 0;
      const alive = setInterval(() => {
        aliveTicks += 1;
        try { writeSync(2, `BACKGROUND_SHUTDOWN_ALIVE=${aliveTicks}\n`); } catch { /* diagnostics only */ }
        if (aliveTicks >= 20) clearInterval(alive);
      }, 250);
      alive.unref();
      // Success exits promptly inside the container stop budget. Failure keeps
      // the process fenced and observable; the deploy coordinator treats the
      // later forced termination as HOLD, never Drain PASS.
      void app.close().then(
        () => { if (signals === process) process.exit(0); },
        () => { /* HOLD: stay fenced until the owner's forced termination */ },
      );
    });
  }
}
