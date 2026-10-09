import { AsyncLocalStorage } from 'node:async_hooks';
import { ForbiddenException } from '@nestjs/common';
const execution = new AsyncLocalStorage<{ runId: string; assertOwner?: () => void }>();
/** The scheduler owns the durable job and PostgreSQL lock for the entire async call chain. */
export function withReadonlyOrchestration<T>(runId: string, callback: () => Promise<T>, assertOwner?: () => void): Promise<T> {
  return execution.run({ runId, assertOwner }, callback);
}
/** Guard each business call/response within an orchestration; independent probes are unchanged. */
export function assertReadonlyOrchestrationOwnerIfPresent(): void {
  execution.getStore()?.assertOwner?.();
}
export function requireReadonlyOrchestration(): void {
  if (!execution.getStore()) throw new ForbiddenException({ reason: 'READONLY_ORCHESTRATION_REQUIRED', message: 'Use the protected durable readonly queue' });
  assertReadonlyOrchestrationOwnerIfPresent();
}
