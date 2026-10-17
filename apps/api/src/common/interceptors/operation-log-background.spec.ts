import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { BackgroundTaskService } from '../../modules/background-control/background-task.service';
import { BackgroundHttpInterceptor } from '../../modules/background-control/background-http.interceptor';
import { BackgroundManifestReader } from '../../modules/background-control/background-manifest.reader';
import { OperationLogInterceptor } from './operation-log.interceptor';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => { resolve = yes; });
  return { promise, resolve };
}

function fixture() {
  let fenced = false;
  const backend = {
    bindLoss: jest.fn(), bindIdentity: jest.fn(), status: jest.fn(() => ({ connected: true, poisoned: false })), gateEnter: jest.fn().mockResolvedValue(true), gateExit: jest.fn().mockResolvedValue(undefined),
    executionEnter: jest.fn().mockResolvedValue(true), executionExit: jest.fn().mockResolvedValue(undefined), close: jest.fn(),
  };
  let tasks!: BackgroundTaskService;
  let generation = 1;
  const manifest = new BackgroundManifestReader();
  jest.spyOn(manifest, 'read').mockImplementation(() => manifest.validate({
    protocolVersion: 1, phase: fenced ? 'FENCED' : 'OPEN', owner: 'audit-fixture', generation,
    targetSha: 'b'.repeat(40), participants: [{ bootId: tasks.identity.bootId,
      containerId: 'a'.repeat(64), revision: 'b'.repeat(40), allowedKinds: ['LOCAL'] }],
  }));
  tasks = new BackgroundTaskService(manifest, backend as any);
  expect(backend.bindIdentity).toHaveBeenCalledWith(tasks.identity.bootId);
  const ds = { query: jest.fn().mockResolvedValue([]) };
  const cls = { get: jest.fn(() => ({ userId: '11', username: 'fixture', roles: ['ROLE_TEST'] })) };
  const audit = new OperationLogInterceptor(ds as any, cls as any, tasks);
  const http = new BackgroundHttpInterceptor(tasks);
  const request = { method: 'POST', path: '/api/v2/procurement/funds', headers: {}, ip: '127.0.0.1' };
  const context = { getType: () => 'http', switchToHttp: () => ({ getRequest: () => request }) } as ExecutionContext;
  return { tasks, ds, audit, http, context, backend, fence: () => { fenced = true; generation += 1; } };
}

describe('operation audit remains in background admission graph', () => {
  it('retains lease after successful response until audit insert completes', async () => {
    const f = fixture();
    const insert = deferred();
    f.ds.query.mockReturnValueOnce(insert.promise);
    const response = await lastValueFrom(f.http.intercept(f.context, {
      handle: () => f.audit.intercept(f.context, { handle: () => of({ id: '1', fundNo: 'TEST-1' }) }),
    }));
    expect(response).toEqual({ id: '1', fundNo: 'TEST-1' });
    expect(f.tasks.status().inFlight).toBe(1);
    expect(f.backend.executionExit).not.toHaveBeenCalled();
    expect(f.ds.query).toHaveBeenCalledTimes(1);
    insert.resolve();
    await f.tasks.shutdown(1000);
    expect(f.tasks.status().inFlight).toBe(0);
    expect(f.backend.executionExit).toHaveBeenCalledTimes(1);
  });

  it('retains failed-response audit until insert settles without replacing original error', async () => {
    const f = fixture();
    const insert = deferred();
    f.ds.query.mockReturnValueOnce(insert.promise);
    const error = new Error('business rejection');
    const response = lastValueFrom(f.http.intercept(f.context, {
      handle: () => f.audit.intercept(f.context, { handle: () => throwError(() => error) }),
    }));
    await expect(response).rejects.toBe(error);
    expect(f.tasks.status().inFlight).toBe(1);
    expect(f.ds.query.mock.calls[0][1][14]).toBe('FAIL');
    insert.resolve();
    await f.tasks.shutdown(1000);
    expect(f.tasks.status().inFlight).toBe(0);
  });

  it.each(['success', 'error'])('FENCED blocks %s handler and audit with zero DB writes', async outcome => {
    const f = fixture();
    f.fence();
    const handler = jest.fn(() => outcome === 'success' ? of({ id: '1' }) : throwError(() => new Error('unreachable')));
    await expect(lastValueFrom(f.http.intercept(f.context, {
      handle: () => f.audit.intercept(f.context, { handle: handler }),
    }))).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(handler).not.toHaveBeenCalled();
    expect(f.ds.query).not.toHaveBeenCalled();
    await f.tasks.shutdown(1000);
  });

  it('audit DB errors stay non-blocking and are logged without database error detail', async () => {
    const f = fixture();
    f.ds.query.mockRejectedValueOnce(new Error('private SQL detail fixture-token'));
    const logger = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(lastValueFrom(f.http.intercept(f.context, {
        handle: () => f.audit.intercept(f.context, { handle: () => of({ id: '1' }) }),
      }))).resolves.toEqual({ id: '1' });
      await f.tasks.shutdown(1000);
      expect(logger).toHaveBeenCalledWith('[OperationLogInterceptor] AUDIT_WRITE_FAILED');
      expect(JSON.stringify(logger.mock.calls)).not.toContain('fixture-token');
    } finally { logger.mockRestore(); }
  });
});
