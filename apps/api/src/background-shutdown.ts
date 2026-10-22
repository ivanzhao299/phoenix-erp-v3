import { INestApplication } from '@nestjs/common';
import { BackgroundTaskService } from './modules/background-control/background-task.service';

/** Drain before Nest disposes domain leases. Native shutdown hooks run too late. */
export function installBackgroundShutdown(
  app: Pick<INestApplication, 'close'>,
  tasks: Pick<BackgroundTaskService, 'shutdown'>,
  signals: Pick<NodeJS.Process, 'once'> = process,
) {
  const close = app.close.bind(app);
  let closing: Promise<void> | undefined;
  app.close = () => {
    closing ??= (async () => {
      let drainFailure: unknown;
      try {
        // Leave a bounded grace period for the container's SIGTERM handler to
        // finish Nest/TypeORM disposal before Docker's typed stop deadline.
        await tasks.shutdown(25_000);
      } catch (error) {
        // A failed drain is still a HOLD. We must nevertheless close the
        // application resources deterministically; otherwise the old runtime
        // remains alive until SIGKILL with its database pool attached.
        drainFailure = error;
      }
      try {
        await close();
      } catch (error) {
        if (!drainFailure) throw error;
      }
      if (drainFailure) throw drainFailure;
    })();
    return closing;
  };
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    signals.once(signal, () => {
      // Failure keeps the process fenced and domain leases intact. The deploy
      // coordinator treats a later forced termination as HOLD, never Drain PASS.
      void app.close().catch(() => console.error('BACKGROUND_SHUTDOWN_HOLD'));
    });
  }
}
