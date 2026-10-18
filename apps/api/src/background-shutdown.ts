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
      await tasks.shutdown(30_000);
      await close();
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
