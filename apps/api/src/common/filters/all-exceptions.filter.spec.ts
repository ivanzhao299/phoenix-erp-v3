import { ArgumentsHost, Controller, Get, Post, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { BackgroundTaskService } from '../../modules/background-control/background-task.service';
import { BackgroundManifestReader } from '../../modules/background-control/background-manifest.reader';
import { BackgroundLockBackend } from '../../modules/background-control/background-lock.backend';
import { BackgroundManifest } from '../../modules/background-control/background-control.types';
import { SysErrorLogsService } from '../../modules/system-monitor/services/sys-error-logs.service';
import { SysAlertsService } from '../../modules/system-monitor/services/sys-alerts.service';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { BackgroundHttpInterceptor } from '../../modules/background-control/background-http.interceptor';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
let sequence = 0;
@Controller('owned-bg-filter')
class OwnedExceptionController {
  @Get(':id')
  async readFailure() { await Promise.resolve(); throw new Error('OWNED_HTTP_READ_FAILURE'); }
  @Post(':id')
  async mutationFailure() { await Promise.resolve(); throw new Error('OWNED_HTTP_MUTATION_FAILURE'); }
}
function fixture() {
  const revision = 'a'.repeat(40);
  const manifest: BackgroundManifest = { protocolVersion: 1, phase: 'OPEN', owner: 'owned-filter-fixture', generation: 1, targetSha: revision,
    participants: [{ bootId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', containerId: 'b'.repeat(64), revision, allowedKinds: ['LOCAL', 'NOTIFICATION'] }] };
  const reader = new BackgroundManifestReader();
  jest.spyOn(reader, 'read').mockImplementation(() => reader.validate(manifest));
  let loss: () => void = () => undefined;
  const backend = { bindLoss: (callback: () => void) => { loss = callback; }, bindIdentity: jest.fn(),
    gateEnter: jest.fn(async () => true), gateExit: jest.fn(async () => undefined),
    executionEnter: jest.fn(async () => true), executionExit: jest.fn(async () => undefined), close: jest.fn(async () => undefined),
    status: () => ({ connected: true, broken: false }), probe: jest.fn(async () => undefined) };
  const tasks = new BackgroundTaskService(reader, backend as unknown as BackgroundLockBackend);
  tasks.identity.bootId = manifest.participants[0].bootId;
  const log = { writeLog: jest.fn(async (): Promise<void> => undefined) };
  const alerts = { createAlert: jest.fn(async () => 1) };
  const filter = new AllExceptionsFilter(tasks, log as unknown as SysErrorLogsService, alerts as unknown as SysAlertsService);
  const req = { method: 'GET', url: `/owned-filter-${++sequence}`, headers: {}, body: {}, user: { id: 7 } };
  const response = { status: jest.fn(), json: jest.fn() }; response.status.mockReturnValue(response);
  const host = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => response }) } as unknown as ArgumentsHost;
  return { tasks, manifest, reader, backend, filter, log, alerts, req, response, host, lose: () => loss() };
}

describe('exception side effects use actual background admission and settlement', () => {
  let fetchMock: jest.SpyInstance;
  beforeEach(() => {
    process.env.ALERT_WEBHOOK_URL = 'https://owned-fixture.invalid/alerts';
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as Response);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => { delete process.env.ALERT_WEBHOOK_URL; jest.restoreAllMocks(); });

  it('responds immediately but retains all three real promises until each settles across a fence', async () => {
    const f = fixture(), log = deferred(), alert = deferred(), webhook = deferred();
    f.log.writeLog.mockImplementation(() => log.promise);
    f.alerts.createAlert.mockImplementation(async () => { await alert.promise; return 1; });
    fetchMock.mockImplementation(async () => { await webhook.promise; return { ok: true }; });
    f.filter.catch(new Error('owned-fixture-failure'), f.host);
    expect(f.response.status).toHaveBeenCalledWith(500); expect(f.response.json).toHaveBeenCalledTimes(1);
    await tick(); expect(f.tasks.status()).toMatchObject({ inFlight: 3, taskGraphs: 3 });
    f.manifest.phase = 'FENCED'; f.manifest.generation++;
    let drained = false; const drain = f.tasks.shutdown(2000).then(() => { drained = true; });
    log.resolve(); await tick(); expect(f.tasks.status().inFlight).toBe(2); expect(drained).toBe(false);
    alert.resolve(); await tick(); expect(f.tasks.status().inFlight).toBe(1); expect(f.backend.close).not.toHaveBeenCalled();
    webhook.resolve(); await drain;
    expect(f.tasks.status().inFlight).toBe(0); expect(f.backend.close).toHaveBeenCalledTimes(1);
  });

  it('registers children synchronously before the mutation parent can finish', async () => {
    const f = fixture(), pending = deferred();
    f.log.writeLog.mockImplementation(() => pending.promise);
    f.alerts.createAlert.mockImplementation(async () => { await pending.promise; return 1; });
    fetchMock.mockImplementation(async () => { await pending.promise; return { ok: true }; });
    await f.tasks.run('owned-parent', 'LOCAL', async () => { f.filter.catch(new Error('owned'), f.host); });
    expect(f.tasks.status()).toMatchObject({ taskGraphs: 1, inFlight: 3, pendingChildren: 2 });
    expect(f.backend.executionExit).not.toHaveBeenCalled();
    pending.resolve(); await tick(); await f.tasks.shutdown(1000);
  });

  for (const denial of ['FENCED', 'CODE_HOLD', 'MISSING', 'CONTROL_GATE', 'POISON', 'STOPPING'] as const) {
    it(`${denial} denies every new side effect while preserving the HTTP response`, async () => {
      const f = fixture();
      if (denial === 'FENCED' || denial === 'CODE_HOLD') f.manifest.phase = denial;
      if (denial === 'MISSING') jest.spyOn(f.reader, 'read').mockImplementation(() => { throw new Error('OWNED_FIXTURE_MANIFEST_ABSENT'); });
      if (denial === 'CONTROL_GATE') f.backend.gateEnter.mockResolvedValue(false);
      if (denial === 'POISON') f.lose();
      if (denial === 'STOPPING') await f.tasks.shutdown(1000);
      f.filter.catch(new Error('owned'), f.host); await tick();
      expect(f.response.status).toHaveBeenCalledWith(500);
      expect(f.log.writeLog).not.toHaveBeenCalled(); expect(f.alerts.createAlert).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
      expect(f.tasks.status().inFlight).toBe(0);
      await f.tasks.shutdown(1000).catch(() => undefined);
    });
  }

  it('retains pending work and HOLD when drain times out; late settlement is not a successful drain', async () => {
    const f = fixture(), pending = deferred(); f.log.writeLog.mockImplementation(() => pending.promise);
    f.filter.catch(new ForbiddenException('owned-denial'), f.host); await tick();
    await expect(f.tasks.shutdown(10)).rejects.toThrow('DRAIN_TIMEOUT_OR_SESSION_LOST');
    expect(f.tasks.status()).toMatchObject({ inFlight: 1, poisoned: true }); expect(f.backend.close).not.toHaveBeenCalled();
    pending.resolve(); await tick(); expect(f.tasks.status()).toMatchObject({ inFlight: 0, poisoned: true, phase: 'HOLD' });
    await expect(f.tasks.shutdown(1000)).rejects.toThrow();
  });

  it('tracks PG alerts and 403 audit logs but does not create side effects for normal 404/429 responses', async () => {
    const f = fixture();
    f.filter.catch(Object.assign(new Error('owned-column-error'), { code: '42703' }), f.host); await tick();
    expect(f.response.status).toHaveBeenLastCalledWith(400); expect(f.alerts.createAlert).toHaveBeenCalledWith(expect.objectContaining({ alertType: 'PG_ERROR' }));
    expect(fetchMock).not.toHaveBeenCalled();
    f.filter.catch(new ForbiddenException('owned'), f.host); await tick(); expect(f.log.writeLog).toHaveBeenCalledTimes(2);
    f.filter.catch(new NotFoundException('owned'), f.host); f.filter.catch(new ThrottlerException(), f.host); await tick();
    expect(f.log.writeLog).toHaveBeenCalledTimes(2); expect(f.alerts.createAlert).toHaveBeenCalledTimes(1);
    await f.tasks.shutdown(1000);
  });

  it('does not consume webhook throttle while denied, and isolates NOTIFICATION permission from LOCAL writes', async () => {
    const f = fixture(); f.manifest.phase = 'FENCED';
    f.filter.catch(new Error('owned'), f.host); await tick(); expect(fetchMock).not.toHaveBeenCalled();
    f.manifest.phase = 'OPEN'; f.manifest.generation++; f.manifest.participants[0].allowedKinds = ['LOCAL'];
    f.filter.catch(new Error('owned'), f.host); await tick();
    expect(f.log.writeLog).toHaveBeenCalledTimes(1); expect(f.alerts.createAlert).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
    f.manifest.generation++; f.manifest.participants[0].allowedKinds.push('NOTIFICATION');
    f.filter.catch(new Error('owned'), f.host); await tick(); expect(fetchMock).toHaveBeenCalledTimes(1);
    f.filter.catch(new Error('owned'), f.host); await tick(); expect(fetchMock).toHaveBeenCalledTimes(1);
    await f.tasks.shutdown(1000);
  });

  it('classifies and retains the real createAlert → in-app notification call chain', async () => {
    const f = fixture(), notification = deferred();
    const query = jest.fn(async (sql: string): Promise<unknown[]> => {
      if (sql.includes('SELECT id')) return [];
      if (sql.includes('INSERT INTO sys_alerts')) return [{ id: 73 }];
      if (sql.includes('INSERT INTO sys_notifications')) { await notification.promise; return []; }
      throw new Error('UNEXPECTED_OWNED_FIXTURE_SQL');
    });
    const realAlerts = new SysAlertsService({ query } as unknown as DataSource);
    const filter = new AllExceptionsFilter(f.tasks, f.log as unknown as SysErrorLogsService, realAlerts);
    f.manifest.participants[0].allowedKinds = ['LOCAL'];
    filter.catch(new Error('owned'), f.host); await tick();
    expect(f.log.writeLog).toHaveBeenCalledTimes(1); expect(query).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
    f.manifest.generation++; f.manifest.participants[0].allowedKinds.push('NOTIFICATION');
    filter.catch(new Error('owned'), f.host); await tick();
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO sys_notifications'))).toBe(true);
    expect(f.tasks.status()).toMatchObject({ inFlight: 1, taskGraphs: 1 });
    f.manifest.generation++; f.manifest.phase = 'FENCED';
    let drained = false; const drain = f.tasks.shutdown(1000).then(() => { drained = true; });
    await tick(); expect(drained).toBe(false); notification.resolve(); await drain;
    expect(f.tasks.status().inFlight).toBe(0);
  });

  it.each(['get', 'post'] as const)('registers real Nest %s exception effects through the actual HTTP interceptor/filter chain', async method => {
    const f = fixture(), pending = deferred();
    f.log.writeLog.mockImplementation(() => pending.promise);
    const module = await Test.createTestingModule({ controllers: [OwnedExceptionController] }).compile();
    const app = module.createNestApplication();
    app.useGlobalInterceptors(new BackgroundHttpInterceptor(f.tasks)); app.useGlobalFilters(f.filter);
    try {
      await app.init();
      await request(app.getHttpServer())[method](`/owned-bg-filter/${++sequence}`).expect(500);
      await tick(); expect(f.log.writeLog).toHaveBeenCalledTimes(1); expect(f.alerts.createAlert).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1); expect(f.tasks.status().inFlight).toBe(1);
      pending.resolve(); await tick(); await f.tasks.shutdown(1000);
    } finally { pending.resolve(); await app.close(); }
  });

  it('awaits rejected effects without recursive alerts or unhandled rejections', async () => {
    const f = fixture(); f.log.writeLog.mockRejectedValue(new Error('owned-log-failure'));
    f.alerts.createAlert.mockRejectedValue(new Error('owned-alert-failure')); fetchMock.mockRejectedValue(new Error('owned-webhook-failure'));
    f.filter.catch(new Error('owned'), f.host); await tick();
    expect(f.log.writeLog).toHaveBeenCalledTimes(1); expect(f.alerts.createAlert).toHaveBeenCalledTimes(1); expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(f.tasks.status().inFlight).toBe(0); await f.tasks.shutdown(1000);
  });
});
