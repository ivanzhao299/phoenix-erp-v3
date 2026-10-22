import { INestApplication } from '@nestjs/common';
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
        console.error('BACKGROUND_SHUTDOWN_HOLD');
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
