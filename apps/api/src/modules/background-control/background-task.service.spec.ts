import { BackgroundTaskService } from './background-task.service';
import { BackgroundManifestReader } from './background-manifest.reader';
import { BackgroundLockBackend } from './background-lock.backend';
import { BackgroundAdmissionDeniedError, BackgroundManifest } from './background-control.types';
import { Logger } from '@nestjs/common';

const revision = 'a'.repeat(40);
function fixture() {
  const manifest: BackgroundManifest = { protocolVersion: 1, phase: 'OPEN', owner: 'test-owner', generation: 1, targetSha: revision,
    participants: [{ bootId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', containerId: 'f'.repeat(64), revision, allowedKinds: ['LOCAL', 'NOTIFICATION'] }] };
  const reader = new BackgroundManifestReader();
  jest.spyOn(reader, 'read').mockImplementation(() => reader.validate(manifest));
  let loss: () => void = () => undefined;
  const backend = {
    bindLoss: (fn: () => void) => { loss = fn; }, gateEnter: jest.fn(async () => true), gateExit: jest.fn(async () => undefined),
    bindIdentity: jest.fn(),
    executionEnter: jest.fn(async () => true), executionExit: jest.fn(async () => undefined), close: jest.fn(async () => undefined),
    status: () => ({ connected: true, broken: false, sessionPid: 71, databaseOid: 17,
      backendStartedAt: '2026-10-18T00:00:00.000Z', applicationName: 'phoenix-fence:fixture',
      connectionString: 'DO_NOT_EMIT_CONNECTION', queryArgs: 'DO_NOT_EMIT_ARGS' }),
    probe: jest.fn(async () => undefined),
  };
  const service = new BackgroundTaskService(reader, backend as unknown as BackgroundLockBackend);
  service.identity.bootId = manifest.participants[0].bootId;
  return { service, backend, manifest, reader, lose: () => loss() };
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
const tick = () => new Promise(resolve => setImmediate(resolve));

describe('background admission and whole task graph drain', () => {
  it('emits one boot record with an exact safe field allowlist after session verification', async () => {
    const f = fixture(); f.manifest.phase = 'FENCED'; f.manifest.owner = 'DO_NOT_EMIT_APPROVAL_OWNER';
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      await f.service.onModuleInit(); await f.service.onModuleInit();
      expect(f.backend.probe).toHaveBeenCalledTimes(1); expect(log).toHaveBeenCalledTimes(1);
      const line = log.mock.calls[0][0] as string;
      expect(line.startsWith('BACKGROUND_CONTROL_BOOT=')).toBe(true);
      const record = JSON.parse(line.slice('BACKGROUND_CONTROL_BOOT='.length));
      expect(Object.keys(record).sort()).toEqual(['bootId', 'controlSession', 'phase', 'protocolVersion']);
      expect(Object.keys(record.controlSession).sort()).toEqual(['applicationName', 'backendStartedAt', 'broken', 'connected', 'databaseOid', 'sessionPid']);
      expect(record).toMatchObject({ protocolVersion: 1, bootId: f.service.identity.bootId, phase: 'FENCED', controlSession: { connected: true, broken: false } });
      expect(line).not.toContain('DO_NOT_EMIT'); expect(line).not.toContain('hostname');
    } finally { await f.service.shutdown(1000); log.mockRestore(); }
  });
  it('does not emit a boot success record when control session verification fails', async () => {
    const f = fixture(); f.backend.probe.mockRejectedValueOnce(new Error('SESSION_FIXTURE_FAILED'));
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      await expect(f.service.onModuleInit()).rejects.toThrow('SESSION_FIXTURE_FAILED');
      expect(log).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
  it('holds execution before releasing admission and never enters work before both', async () => {
    const f = fixture();
    await f.service.run('one', 'LOCAL', async () => {
      expect(f.backend.executionEnter).toHaveBeenCalledTimes(1);
      expect(f.backend.gateExit).toHaveBeenCalledTimes(1);
      expect(f.service.status().inFlight).toBe(1);
    });
    expect(f.backend.executionExit).toHaveBeenCalledTimes(1);
  });
  it('FENCED denies outer jobs and scheduled jobs skip without invoking work', async () => {
    const f = fixture(); f.manifest.phase = 'FENCED'; const work = jest.fn();
    await expect(f.service.run('denied', 'LOCAL', work)).rejects.toBeInstanceOf(BackgroundAdmissionDeniedError);
    expect(await f.service.runScheduled('skip', 'LOCAL', work)).toBeUndefined();
    expect(work).not.toHaveBeenCalled(); expect(f.backend.executionEnter).not.toHaveBeenCalled();
  });
  it('coordinator exclusive gate denies immediately without blocking execution release', async () => {
    const f = fixture(); f.backend.gateEnter.mockResolvedValue(false); const work = jest.fn();
    await expect(f.service.run('race', 'LOCAL', work)).rejects.toThrow('ADMISSION_GATE_FENCED');
    expect(f.backend.gateExit).not.toHaveBeenCalled(); expect(work).not.toHaveBeenCalled();
  });
  it('tracks detached children and grandchildren after parent returns across a fence', async () => {
    const f = fixture(); const child = deferred(); const grandchild = deferred();
    await f.service.run('parent', 'LOCAL', async () => {
      f.service.spawn('child', 'NOTIFICATION', async () => {
        await child.promise;
        f.service.spawn('grandchild', 'NOTIFICATION', () => grandchild.promise);
      });
    });
    f.manifest.phase = 'FENCED'; f.manifest.generation++; expect(f.service.status().inFlight).toBe(1);
    expect(f.backend.executionExit).not.toHaveBeenCalled();
    child.resolve(); await tick(); expect(f.service.status().inFlight).toBe(1);
    grandchild.resolve(); await tick(); expect(f.service.status().inFlight).toBe(0);
    expect(f.backend.executionExit).toHaveBeenCalledTimes(1);
  });
  it('a timer retaining an already-completed ALS graph cannot reopen it', async () => {
    const f = fixture(); const start = deferred(); const completed = deferred(); const work = jest.fn();
    await f.service.run('parent', 'LOCAL', async () => {
      void start.promise.then(async () => {
        await expect(f.service.run('too-late', 'LOCAL', work)).rejects.toThrow('CHILD_UNAUTHORIZED'); completed.resolve();
      });
    });
    start.resolve(); await completed.promise; expect(work).not.toHaveBeenCalled();
  });
  it('nested children cannot escalate to disallowed external grants', async () => {
    const f = fixture();
    await f.service.run('parent', 'LOCAL', async () => {
      await expect(f.service.run('chanjet', 'CHANJET_SYNC', async () => undefined)).rejects.toThrow('CHILD_UNAUTHORIZED');
    });
    expect(f.backend.gateEnter).toHaveBeenCalledTimes(1);
  });
  it('connection loss poisons participant permanently even after manifest is open', async () => {
    const f = fixture(); f.lose(); const work = jest.fn();
    await expect(f.service.run('lost', 'LOCAL', work)).rejects.toThrow('PARTICIPANT_HOLD');
    expect(f.service.status().poisoned).toBe(true); expect(work).not.toHaveBeenCalled();
  });
  it('operation errors propagate and release admission rather than masquerading as scheduled skip', async () => {
    const f = fixture();
    await expect(f.service.runScheduled('error', 'LOCAL', async () => { throw new Error('BUSINESS_ERROR'); })).rejects.toThrow('BUSINESS_ERROR');
    expect(f.service.status().inFlight).toBe(0); expect(f.backend.executionExit).toHaveBeenCalledTimes(1);
  });
  it('a nested grant failure after business work starts is not silently treated as scheduled skip', async () => {
    const f = fixture();
    await expect(f.service.runScheduled('parent', 'LOCAL', async () =>
      f.service.run('forbidden', 'CHANJET_SYNC', async () => undefined))).rejects.toThrow('CHILD_UNAUTHORIZED');
  });
  it('shutdown also times out a stalled admission control session', async () => {
    const f = fixture(); const pending = deferred();
    f.backend.gateEnter.mockImplementation(async () => { await pending.promise; return true; });
    const admission = f.service.run('stalled', 'LOCAL', async () => undefined);
    await tick(); await expect(f.service.shutdown(5)).rejects.toThrow('DRAIN_TIMEOUT_OR_SESSION_LOST');
    pending.resolve(); await expect(admission).rejects.toThrow('PARTICIPANT_HOLD');
    expect(f.backend.close).not.toHaveBeenCalled();
  });
  it('shutdown racing execution acquisition releases the acquired lock without starting work', async () => {
    const f = fixture(); const pending = deferred(); const entered = deferred(); const work = jest.fn();
    f.backend.executionEnter.mockImplementation(async () => { entered.resolve(); await pending.promise; return true; });
    const admission = f.service.run('race', 'LOCAL', work); await entered.promise;
    const shutdown = f.service.shutdown(1000); pending.resolve();
    await expect(admission).rejects.toThrow('PARTICIPANT_HOLD'); await shutdown;
    expect(work).not.toHaveBeenCalled(); expect(f.backend.executionExit).toHaveBeenCalledTimes(1);
    expect(f.backend.close).toHaveBeenCalledTimes(1);
  });
  it('shutdown timeout is poisoned HOLD and does not close the locked session', async () => {
    const f = fixture(); const pending = deferred();
    f.service.spawn('long', 'LOCAL', () => pending.promise); await tick();
    await expect(f.service.shutdown(5)).rejects.toThrow('DRAIN_TIMEOUT_OR_SESSION_LOST');
    expect(f.backend.close).not.toHaveBeenCalled(); expect(f.service.status().poisoned).toBe(true);
    pending.resolve(); await tick();
  });
  it('shutdown drains children then closes session and blocks later admission', async () => {
    const f = fixture(); const pending = deferred();
    f.service.spawn('work', 'LOCAL', () => pending.promise); await tick();
    const shutdown = f.service.shutdown(1000); pending.resolve(); await shutdown;
    expect(f.backend.close).toHaveBeenCalledTimes(1);
    await expect(f.service.run('after', 'LOCAL', async () => undefined)).rejects.toThrow('PARTICIPANT_HOLD');
  });
  it('restart/mismatched bootId denies admission', async () => {
    const f = fixture(); f.service.identity.bootId = 'different';
    await expect(f.service.run('stale', 'LOCAL', async () => undefined)).rejects.toThrow('FENCED_OR_UNAUTHORIZED');
    expect(f.service.status().phase).toBe('HOLD');
  });
  it('invalid or missing manifest is denied instead of implicitly OPEN', async () => {
    const f = fixture(); jest.spyOn(f.reader, 'read').mockImplementation(() => { throw new BackgroundAdmissionDeniedError('MANIFEST_UNTRUSTED'); });
    await expect(f.service.run('missing', 'LOCAL', async () => undefined)).rejects.toThrow('MANIFEST_UNTRUSTED');
    expect(f.service.status().phase).toBe('HOLD');
  });
});
