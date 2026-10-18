import { AsyncLocalStorage } from 'async_hooks';
import { BackgroundTaskService } from '../background-control/background-task.service';
import { BackgroundManifestReader } from '../background-control/background-manifest.reader';
import { ApprovalEngineService } from '../approval-engine/approval-engine.service';
import { WorkflowNotificationService } from '../workflow/workflow-notification.service';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { PushNotificationService } from './push-notification.service';
import * as webpush from 'web-push';

jest.mock('web-push', () => ({ setVapidDetails: jest.fn(), sendNotification: jest.fn() }));

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Domain contract fixture only: the real multi-process lease protocol is tested in background-control.
function backgroundFixture() {
  let fenced = false;
  let pending = 0;
  const graph = new AsyncLocalStorage<boolean>();
  const run = jest.fn(async (_name: string, _kind: string, work: () => Promise<unknown>) => {
    if (fenced && !graph.getStore()) throw new Error('BACKGROUND_ADMISSION_DENIED');
    pending += 1;
    try { return await graph.run(true, work); } finally { pending -= 1; }
  });
  return {
    service: { run } as unknown as BackgroundTaskService,
    run,
    fence: () => { fenced = true; },
    pending: () => pending,
  };
}

const payload = { instanceId: '1', bizType: 'PR', bizId: '2', assigneeUserId: '3' };

describe('notification background admission and complete delivery graph', () => {
  it('denies manual dispatcher before querying or claiming delivery', async () => {
    const bg = backgroundFixture();
    const ds = { query: jest.fn() };
    const push = { sendToUser: jest.fn() };
    const service = new NotificationDispatcherService(ds as any, push as any, bg.service);
    bg.fence();
    await expect(service.fire('APPROVAL_PENDING', {})).rejects.toThrow('BACKGROUND_ADMISSION_DENIED');
    expect(ds.query).not.toHaveBeenCalled();
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('keeps workflow task admitted until the pending push settles after a fence', async () => {
    const bg = backgroundFixture();
    const delivery = deferred();
    const push = { sendToUser: jest.fn(() => delivery.promise) };
    const notification = { create: jest.fn().mockResolvedValue({}) };
    const service = new WorkflowNotificationService({} as any, notification as any, push as any, bg.service);
    let done = false;
    const work = service.onTaskCreated(payload).then(() => { done = true; });
    await new Promise(resolve => setImmediate(resolve));
    bg.fence();
    expect(push.sendToUser).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);
    expect(bg.pending()).toBe(1);
    delivery.resolve();
    await work;
    expect(bg.pending()).toBe(0);
  });

  it.each(['onInstanceCompleted', 'onInstanceRejected'] as const)('%s does not release admission before push completion', async method => {
    const bg = backgroundFixture();
    const delivery = deferred();
    const push = { sendToUser: jest.fn(() => delivery.promise) };
    const service = new WorkflowNotificationService({} as any, { create: jest.fn().mockResolvedValue({}) } as any, push as any, bg.service);
    const work = service[method]({ ...payload, starterUserId: '3', result: method === 'onInstanceCompleted' ? 'APPROVED' : 'REJECTED' });
    await new Promise(resolve => setImmediate(resolve));
    expect(bg.pending()).toBe(1);
    delivery.resolve();
    await work;
    expect(bg.pending()).toBe(0);
  });

  it('waits for all station writes after one fails and preserves no-push-on-station-failure behavior', async () => {
    const bg = backgroundFixture();
    const station = deferred();
    const notification = { create: jest.fn().mockRejectedValueOnce(new Error('station unavailable')).mockReturnValueOnce(station.promise) };
    const push = { sendToUser: jest.fn() };
    const ds = { query: jest.fn().mockResolvedValue([{ user_id: '3' }, { user_id: '4' }]) };
    const service = new WorkflowNotificationService(ds as any, notification as any, push as any, bg.service);
    const work = service.onTaskCreated({ ...payload, assigneeUserId: undefined, assigneeRoleCode: 'ROLE_APPROVER' });
    await new Promise(resolve => setImmediate(resolve));
    expect(bg.pending()).toBe(1);
    expect(push.sendToUser).not.toHaveBeenCalled();
    station.resolve();
    await work;
    expect(push.sendToUser).not.toHaveBeenCalled();
    expect(bg.pending()).toBe(0);
  });

  it('registers approval deferred work synchronously and retains its complete child Promise', async () => {
    const jobs: Array<() => Promise<unknown>> = [];
    const spawn = jest.fn((_name, _kind, work) => { jobs.push(work); });
    const service = Object.create(ApprovalEngineService.prototype) as any;
    service.background = { spawn };
    const delivery = deferred();
    const notify = jest.fn(() => delivery.promise);
    service.deferNotification('approval.fixture', notify);
    expect(spawn).toHaveBeenCalledWith('approval.fixture', 'NOTIFICATION', expect.any(Function));
    expect(notify).not.toHaveBeenCalled();
    let done = false;
    const job = jobs[0]().then(() => { done = true; });
    await new Promise(resolve => setImmediate(resolve));
    expect(notify).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);
    delivery.resolve();
    await job;
    expect(done).toBe(true);
  });

  it('approval fanout waits for every sibling after an early failure, then reports failure', async () => {
    const service = Object.create(ApprovalEngineService.prototype) as any;
    const sibling = deferred();
    let done = false;
    const failure = new Error('notification admission refused');
    const work = service.settleNotifications([Promise.reject(failure), sibling.promise]);
    const checked = expect(work).rejects.toThrow(failure).then(() => { done = true; });
    await new Promise(resolve => setImmediate(resolve));
    expect(done).toBe(false);
    sibling.resolve();
    await checked;
  });

  it('real task graph retains the approval child after the mutating parent returns', async () => {
    const backend = {
      bindLoss: jest.fn(), bindIdentity: jest.fn(), status: jest.fn(() => ({ connected: true, poisoned: false })), gateEnter: jest.fn().mockResolvedValue(true), gateExit: jest.fn().mockResolvedValue(undefined),
      executionEnter: jest.fn().mockResolvedValue(true), executionExit: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };
    let background!: BackgroundTaskService;
    const manifest = new BackgroundManifestReader();
    jest.spyOn(manifest, 'read').mockImplementation(() => manifest.validate({
      protocolVersion: 1, phase: 'OPEN', owner: 'notification-fixture', generation: 1,
      targetSha: 'b'.repeat(40), participants: [{ bootId: background.identity.bootId,
        containerId: 'a'.repeat(64), revision: 'b'.repeat(40), allowedKinds: ['LOCAL', 'NOTIFICATION'] }],
    }));
    background = new BackgroundTaskService(manifest, backend as any);
    expect(backend.bindIdentity).toHaveBeenCalledWith(background.identity.bootId);
    const engine = Object.create(ApprovalEngineService.prototype) as any;
    engine.background = background;
    const delivery = deferred();
    await background.run('http.fixture', 'LOCAL', async () => {
      engine.deferNotification('approval.fixture', () => delivery.promise);
    });
    expect(background.status().inFlight).toBe(1);
    expect(backend.executionExit).not.toHaveBeenCalled();
    let drained = false;
    const drain = background.shutdown(1000).then(() => { drained = true; });
    await new Promise(resolve => setImmediate(resolve));
    expect(drained).toBe(false);
    delivery.resolve();
    await drain;
    expect(background.status().inFlight).toBe(0);
    expect(backend.executionExit).toHaveBeenCalledTimes(1);
  });

  it('WebPush blocks before subscription access while fenced even if configured', async () => {
    const bg = backgroundFixture();
    const ds = { query: jest.fn() };
    const service = new PushNotificationService(ds as any, {} as any, bg.service);
    (service as any).vapidReady = true;
    bg.fence();
    await expect(service.sendToUser('3', {})).rejects.toThrow('BACKGROUND_ADMISSION_DENIED');
    expect(ds.query).not.toHaveBeenCalled();
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('WebPush keeps expired-subscription cleanup inside the admitted delivery Promise', async () => {
    const bg = backgroundFixture();
    const cleanup = deferred<unknown[]>();
    const ds = { query: jest.fn()
      .mockResolvedValueOnce([{ id: '1', endpoint: 'https://invalid.example.test/push', p256dh: 'synthetic', auth: 'synthetic' }])
      .mockReturnValueOnce(cleanup.promise) };
    const service = new PushNotificationService(ds as any, {} as any, bg.service);
    (service as any).vapidReady = true;
    jest.mocked(webpush.sendNotification).mockRejectedValueOnce({ statusCode: 410 });
    const work = service.sendToUser('3', { title: 'Fixture' });
    await new Promise(resolve => setImmediate(resolve));
    expect(ds.query).toHaveBeenCalledTimes(2);
    expect(bg.pending()).toBe(1);
    cleanup.resolve([]);
    await work;
    expect(bg.pending()).toBe(0);
  });
});
