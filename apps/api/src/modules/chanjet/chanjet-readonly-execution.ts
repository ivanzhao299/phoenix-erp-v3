import { AsyncLocalStorage } from 'node:async_hooks';
import { ForbiddenException } from '@nestjs/common';
const execution = new AsyncLocalStorage<string>();
/** The scheduler owns the durable job and PostgreSQL lock for the entire async call chain. */
export function withReadonlyOrchestration<T>(runId: string, callback: () => Promise<T>): Promise<T> {
  return execution.run(runId, callback);
}
export function requireReadonlyOrchestration(): void {
  if (!execution.getStore()) throw new ForbiddenException({ reason: 'READONLY_ORCHESTRATION_REQUIRED', message: 'Use the protected durable readonly queue' });
}
