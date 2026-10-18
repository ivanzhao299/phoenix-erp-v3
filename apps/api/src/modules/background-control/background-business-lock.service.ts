import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { BackgroundLockBackend, BUSINESS_LOCK_NAMES, BusinessLockName } from './background-lock.backend';
import { BackgroundTaskService } from './background-task.service';
import { BackgroundTaskKind } from './background-control.types';

export type BusinessLockResult<T> = { acquired: false } | { acquired: true; value: T };
type PrimaryFailure = 'NONE' | 'SESSION' | 'BEFORE_BUSINESS' | 'BUSINESS' | 'AFTER_BUSINESS';
type CleanupFailure = 'NONE' | 'UNLOCK' | 'RETIRE' | 'UNLOCK_AND_RETIRE' | 'RESOURCE_LOSS';
export class BackgroundBusinessLockHold extends Error {
  constructor(readonly primaryFailure: PrimaryFailure, readonly cleanupFailure: CleanupFailure) {
    super('BACKGROUND_BUSINESS_LOCK_HOLD'); this.name = 'BackgroundBusinessLockHold';
  }
}
const kinds: Record<BusinessLockName, BackgroundTaskKind> = {
  workflow_sla_scheduler: 'NOTIFICATION', credit_scheduler: 'LOCAL', egg_inventory_scheduler: 'LOCAL',
};

/** Each invocation owns a dedicated master session. Control and business lock
 * sessions never share a QueryRunner. Even healthy completion ends the owned
 * pg client before public release bookkeeping; no private pool API is used. */
@Injectable()
export class BackgroundBusinessLockService {
  private readonly reserved = new Set<BusinessLockName>();
  constructor(@InjectDataSource() private readonly dataSource: DataSource, private readonly tasks: BackgroundTaskService) {}

  async run<T>(name: BusinessLockName, work: () => Promise<T>): Promise<BusinessLockResult<T>> {
    if (!BUSINESS_LOCK_NAMES.includes(name)) throw new Error('BACKGROUND_BUSINESS_LOCK_NAME_REQUIRED');
    return this.tasks.run(`business-lock.${name}`, kinds[name], async () => {
      if (this.reserved.has(name)) return { acquired: false };
      const backend = new BackgroundLockBackend(this.dataSource);
      // The global control boot nonce must remain unique in pg_stat_activity.
      // This child resource is owned by the parent graph, with its own nonce.
      backend.bindIdentity(randomUUID());
      backend.bindLoss(() => this.tasks.resourceHold());
      // At most one acquisition/live/cleanup resource per fixed key per process.
      this.reserved.add(name);
      let settled!: () => void;
      const callerFinished = new Promise<void>(resolve => { settled = resolve; });
      // Register BEFORE acquisition, while the parent graph and grant are live.
      // A deadline ends caller waiting, never ownership of late driver work.
      let resourceRegistered = false;
      const cleanup = this.tasks.run('business-lock.resource-settlement', kinds[name], async () => {
        resourceRegistered = true;
        await callerFinished;
        while (backend.status().cleanup.debt) await new Promise<void>(resolve => setTimeout(resolve, 25));
        this.reserved.delete(name);
      });
      void cleanup.catch(() => this.tasks.resourceHold());
      // run registers a live child synchronously before invoking its callback.
      // If a concurrent poison rejected it, do not acquire any DB resource.
      if (!resourceRegistered) { this.reserved.delete(name); settled(); await cleanup; throw new Error('BACKGROUND_BUSINESS_RESOURCE_REGISTRATION_REQUIRED'); }
      let acquired = false, primaryError: unknown;
      let stage: PrimaryFailure = 'SESSION', primaryFailure: PrimaryFailure = 'NONE', cleanupFailure: CleanupFailure = 'NONE';
      let result: BusinessLockResult<T> | undefined;
      try {
        await backend.probe();
        acquired = await backend.businessEnter(name);
        if (!acquired) result = { acquired: false };
        else {
          await backend.probe(); stage = 'BEFORE_BUSINESS';
          if (backend.status().broken || this.tasks.status().poisoned || this.tasks.status().stopping) throw new Error('BACKGROUND_BUSINESS_LOCK_RESOURCE_HOLD');
          stage = 'BUSINESS'; const value = await work(); stage = 'AFTER_BUSINESS';
          if (this.tasks.status().poisoned || this.tasks.status().stopping) throw new Error('BACKGROUND_BUSINESS_LOCK_RESOURCE_HOLD');
          await backend.probe(); result = { acquired: true, value };
        }
      } catch (error) { primaryError = error; primaryFailure = stage; }
      // Retire even if unlock failed. Keep both categories without serializing
      // business arguments, driver text, connection settings or a raw stack.
      try {
        if (acquired && !backend.status().broken) { await backend.businessExit(name); await backend.probe(); }
      } catch { cleanupFailure = 'UNLOCK'; }
      try { await backend.close(); }
      catch { cleanupFailure = cleanupFailure === 'UNLOCK' ? 'UNLOCK_AND_RETIRE' : 'RETIRE'; }
      finally { settled(); }
      if (cleanupFailure !== 'NONE' || backend.status().broken || this.tasks.status().poisoned || this.tasks.status().stopping) {
        this.tasks.resourceHold(); throw new BackgroundBusinessLockHold(primaryFailure, cleanupFailure === 'NONE' ? 'RESOURCE_LOSS' : cleanupFailure);
      }
      if (primaryFailure !== 'NONE') throw primaryError;
      if (!result) { this.tasks.resourceHold(); throw new BackgroundBusinessLockHold(primaryFailure, 'RESOURCE_LOSS'); }
      return result;
    });
  }
}
