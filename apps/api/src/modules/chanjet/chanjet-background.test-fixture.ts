import type { BackgroundTaskService } from '../background-control/background-task.service';

/** Explicit test-only injection: never imported by a production provider. */
export function chanjetBackgroundFixture(deniedKinds: readonly string[] = []) {
  if (process.env.NODE_ENV !== 'test') throw new Error('CHANJET_BACKGROUND_FIXTURE_TEST_ONLY');
  const pending = new Set<Promise<unknown>>();
  const calls: Array<{ name: string; kind: string }> = [];
  function run<T>(name: string, kind: string, work: () => Promise<T>): Promise<T> {
    const task = (async () => {
      calls.push({ name, kind });
      if (deniedKinds.includes(kind)) throw new Error('BACKGROUND_ADMISSION_DENIED');
      return work();
    })();
    pending.add(task);
    void task.then(() => pending.delete(task), () => pending.delete(task));
    return task;
  }
  const fixture = {
    calls,
    pending,
    run,
    async runScheduled<T>(name: string, kind: string, work: () => Promise<T>) {
      if (deniedKinds.includes(kind)) { calls.push({ name, kind }); return undefined; }
      return run(name, kind, work);
    },
    spawn(name: string, kind: string, work: () => Promise<unknown>) {
      if (deniedKinds.includes(kind)) { calls.push({ name, kind }); return; }
      void run(name, kind, work).catch(() => undefined);
    },
    async settle() { while (pending.size) await Promise.allSettled([...pending]); },
  };
  return { ...fixture, service: fixture as unknown as BackgroundTaskService };
}
