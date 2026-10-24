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
  let markerWritten = false;
  // Synchronous fd-2 write: pipe buffers do not survive process exits, and the
  // fault observation contract requires this marker exactly once.
  const writeMarker = () => {
    if (markerWritten) return;
    markerWritten = true;
    try { writeSync(2, 'BACKGROUND_SHUTDOWN_HOLD\n'); } catch { /* retained HOLD still recorded */ }
  };
  app.close = () => {
    closing ??= (async () => {
      // Keep the drain bounded well inside Docker's typed 30-second stop
      // deadline, leaving enough time for Nest/TypeORM to dispose pools.
      try {
        await tasks.shutdown(3_000);
      } catch (error) {
        // A failed drain is a HOLD. The single BACKGROUND_SHUTDOWN_HOLD marker
        // is emitted while the HTTP listener still serves the fenced status
        // and denial observations. The process keeps its domain leases and
        // never converts a drain failure into an unobserved self-exit or a
        // successful close; the owner's later forced termination is the
        // documented HOLD outcome.
        writeMarker();
        try { writeSync(2, `BACKGROUND_SHUTDOWN_REASON=${String((error as Error | undefined)?.message ?? error).slice(0, 120)}\n`); } catch { /* diagnostics only */ }
        throw error;
      }
      if (closeOwnedResources) {
        try { await closeOwnedResources(); } catch { /* healthy drain already settled owned work */ }
      }
      await close();
    })();
    return closing;
  };
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    signals.once(signal, () => {
      // Tolerate a minimal tasks double (tests inject shutdown-only fakes).
      let poisoned = false;
      try { poisoned = (tasks as BackgroundTaskService).status().poisoned === true; } catch { poisoned = false; }
      try { writeSync(2, `BACKGROUND_SHUTDOWN_SIGNAL=${signal},poisoned=${String(poisoned)}\n`); } catch { /* diagnostics only */ }
      if (poisoned) {
        // An already-poisoned runtime is fenced before any close attempt: the
        // marker is emitted synchronously in the same observable tick, the
        // bounded drain records stopping and retires the owned runner, and no
        // self-exit path is ever entered. The owner's forced termination is
        // the only exit.
        writeMarker();
        void tasks.shutdown(3_000).catch(() => undefined);
        return;
      }
      void app.close().then(
        () => { if (signals === process) process.exit(0); },
        () => { /* HOLD: stay fenced until the owner's forced termination */ },
      );
    });
  }
}
