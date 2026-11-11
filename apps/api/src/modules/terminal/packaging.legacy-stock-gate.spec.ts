import { ConflictException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { PackagingService } from './packaging.service';
import { PackagingController } from './packaging.controller';
import { TerminalService } from './terminal.service';
import { MenuGuard } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';

/** A table-backed policy double: the real guard and real policy SQL run. */
function fixture() {
  const state = {
    profiles: [] as any[],
    shifts: [{ id: 17, house_code: 'HOUSE-A', shift_date: '2026-11-10', status: 'PENDING' }] as any[],
    tasks: [{ id: 23, task_no: 'LEGACY-23', shift_id: 17, house_code: 'HOUSE-A', batch_no: 'RAW-A', status: 'IN_PROGRESS', task_type: 'GRADING' }] as any[],
    batches: [{ batch_no: 'RAW-A', company_code: 'COMP-A' }] as any[],
    houses: [{ house_code: 'HOUSE-A', farm_code: 'FARM-A', status: 'ACTIVE' }, { house_code: 'HOUSE-B', farm_code: 'FARM-B', status: 'ACTIVE' }] as any[],
    farms: [{ farm_code: 'FARM-A', company_code: 'COMP-A', status: 'ACTIVE' }, { farm_code: 'FARM-B', company_code: 'COMP-B', status: 'ACTIVE' }] as any[],
  };
  const db = {
    query: jest.fn(async (sql: string, args: any[] = []) => {
      if (sql.includes('FROM md_egg_source_profiles')) {
        const rows = state.profiles.filter(row => row.company_code === args[0]);
        return sql.includes("status = 'ACTIVE'") || sql.includes("status='ACTIVE'")
          ? rows.filter(row => row.status === 'ACTIVE') : rows;
      }
      if (sql.includes('FROM brd_houses')) {
        return state.houses.filter(house => house.house_code === args[0])
          .flatMap(house => state.farms.filter(farm => farm.farm_code === house.farm_code)
            .filter(farm => !sql.includes("f.status = 'ACTIVE'") || farm.status === 'ACTIVE')
            .map(farm => ({ ...house, company_code: farm.company_code })))
          .filter(house => !sql.includes("h.status = 'ACTIVE'") || house.status === 'ACTIVE');
      }
      if (sql.includes('FROM pkg_shifts')) return state.shifts.filter(row => row.id === args[0]);
      if (sql.includes('FROM inv_batches')) return state.batches.filter(row => row.batch_no === args[0]);
      if (sql.includes('FROM pkg_tasks')) {
        return sql.includes('WHERE shift_id')
          ? state.tasks.filter(row => row.shift_id === args[0] && row.status !== 'CANCELLED')
          : state.tasks.filter(row => row.task_no === args[0] || String(row.id) === args[0]);
      }
      throw new Error(`Unexpected SQL in guard-only test: ${sql}`);
    }),
    transaction: jest.fn(async () => { throw new Error('Old write protocol reached'); }),
  };
  const integration = { completePackagingBatch: jest.fn() };
  const service = new PackagingService(db as any, integration as any);
  const guard = (records = state.tasks, body: any = {}) => (service as any).assertLegacyStockWriteAllowed(records, body);
  const noMutation = () => {
    expect(db.transaction).not.toHaveBeenCalled();
    expect(integration.completePackagingBatch).not.toHaveBeenCalled();
    expect(db.query.mock.calls.every(([sql]) => !/^\s*(INSERT|UPDATE|DELETE|SAVEPOINT)/i.test(sql))).toBe(true);
  };
  return { state, db, integration, service, guard, noMutation };
}

describe('terminal legacy stock company gate', () => {
  it('rejects ALL as an unowned legacy placeholder when no persisted house exists', async () => {
    const f = fixture();
    await expect(f.guard([{ company_code: 'ALL' }])).rejects.toMatchObject({ status: 409 });
    f.noMutation();
  });

  it('derives the company from a unique persisted house owner when legacy batch company is ALL', async () => {
    const f = fixture();
    f.state.batches[0].company_code = 'ALL';
    await expect(f.guard([{ house_code: 'HOUSE-A', batch_no: 'RAW-A', company_code: 'ALL' }])).resolves.toBeUndefined();
    f.noMutation();
  });

  it('still rejects ALL legacy batch rows when the unique house company is configured', async () => {
    const f = fixture();
    f.state.batches[0].company_code = 'ALL';
    f.state.profiles.push({ profile_code: 'SOURCE-A', company_code: 'COMP-A', status: 'INACTIVE' });
    await expect(f.guard([{ house_code: 'HOUSE-A', batch_no: 'RAW-A', company_code: 'ALL' }])).rejects.toMatchObject({ status: 409 });
    f.noMutation();
  });

  it('permits a known unconfigured company through the real policy query, not empty ownership metadata', async () => {
    const f = fixture();
    f.state.profiles.push({ profile_code: 'OTHER', company_code: 'COMP-B', status: 'ACTIVE' });
    await expect(f.guard()).resolves.toBeUndefined();
    expect(f.db.query).toHaveBeenCalledWith(expect.stringContaining('FROM md_egg_source_profiles'), ['COMP-A']);
    expect(f.db.query).toHaveBeenCalledWith(expect.stringContaining('FROM brd_houses'), ['HOUSE-A']);
    expect(f.db.query.mock.calls.some(([sql]) => sql.includes('pkg_work_shifts'))).toBe(false);
    f.noMutation();
  });

  it.each(['ACTIVE', 'INACTIVE'])('rejects configured %s profiles even when expired, before all four old write protocols', async status => {
    const f = fixture();
    f.state.profiles.push({ profile_code: 'SOURCE-A', company_code: 'COMP-A', status, expire_date: '2020-01-01' });
    const calls = [
      () => f.service.completeShift(17, { total_qty: 30 }, 7),
      () => f.service.reopenShift(17, { reason: 'test' }, 7),
      () => f.service.submitGrade('LEGACY-23', { grade_results: { A: 30 } }, 7),
      () => f.service.packComplete('LEGACY-23', { packed_qty: 30 }, 7),
    ];
    for (const run of calls) {
      await expect(run()).rejects.toMatchObject({ status: 409, message: expect.stringContaining('当前包装作业中心') });
    }
    f.noMutation();
  });

  it('rejects a real non-ALL legacy company that disagrees with the house owner', async () => {
    const f = fixture();
    await expect(f.guard([{ house_code: 'HOUSE-A', company_code: 'COMP-B' }])).rejects.toMatchObject({ status: 409 });
    f.noMutation();
  });

  it('does not allow a caller to select an unconfigured company instead of the persisted company', async () => {
    const f = fixture();
    f.state.profiles.push({ profile_code: 'SOURCE-A', company_code: 'COMP-A', status: 'ACTIVE' });
    await expect(f.service.packComplete('LEGACY-23', { company_code: 'COMP-B' }, 7)).rejects.toBeInstanceOf(ConflictException);
    await expect(f.guard(undefined, { sourceContext: { companyCode: 'COMP-B' } })).rejects.toMatchObject({ status: 409 });
    f.noMutation();
  });

  it.each(['unknown-house', 'unknown-company', 'ambiguous-house', 'unknown-shift', 'duplicate-batch', 'mixed-batch-company', 'mixed-shift-house', 'mixed-snapshot-house'])('fails closed with zero mutations for %s', async kind => {
    const f = fixture();
    if (kind === 'unknown-house') f.state.houses = [];
    if (kind === 'unknown-company') { f.state.tasks = [{ task_no: 'ORPHAN', status: 'PENDING' }]; }
    if (kind === 'ambiguous-house') f.state.houses.push({ house_code: 'HOUSE-A', farm_code: 'FARM-B' });
    if (kind === 'unknown-shift') f.state.shifts = [];
    if (kind === 'duplicate-batch') f.state.batches.push({ ...f.state.batches[0] });
    if (kind === 'mixed-batch-company') f.state.batches[0].company_code = 'COMP-B';
    if (kind === 'mixed-shift-house') f.state.shifts[0].house_code = 'HOUSE-B';
    if (kind === 'mixed-snapshot-house') f.state.batches[0].source_profile_snapshot = [{ houseCode: 'HOUSE-A' }, { houseCode: 'HOUSE-B' }];
    await expect(f.guard()).rejects.toMatchObject({ status: 409 });
    f.noMutation();
  });

  it('does not treat request company/global defaults as authority for an orphan task', async () => {
    const f = fixture();
    await expect(f.guard([{ status: 'PENDING' }], { company_code: 'COMP-A', isGlobal: true })).rejects.toMatchObject({ status: 409 });
    await expect(f.guard([{ company_code: 'UNKNOWN' }])).rejects.toMatchObject({ status: 409 });
    expect(f.db.query.mock.calls.some(([sql]) => sql.includes('md_egg_source_profiles'))).toBe(false);
    f.noMutation();
  });

  it('accepts persisted task company or source-batch company without inventing a house', async () => {
    const f = fixture();
    await expect(f.guard([{ company_code: 'COMP-A' }])).resolves.toBeUndefined();
    await expect(f.guard([{ batch_no: 'RAW-A' }])).resolves.toBeUndefined();
    f.noMutation();
  });

  it('rejects policy query failures rather than returning a successful legacy response', async () => {
    const f = fixture();
    const original = f.db.query.getMockImplementation()!;
    f.db.query.mockImplementation(async (sql, args) => {
      if (sql.includes('FROM md_egg_source_profiles')) throw new Error('metadata unavailable');
      return original(sql, args);
    });
    await expect(f.service.packComplete('LEGACY-23', {}, 7)).rejects.toMatchObject({ status: 409 });
    f.noMutation();
  });

  it('uses frozen house/farm identity without requiring active masters for policy classification', async () => {
    const f = fixture();
    f.state.houses[0].status = 'INACTIVE';
    f.state.farms[0].status = 'INACTIVE';
    await expect(f.guard()).resolves.toBeUndefined();
    f.noMutation();
  });

  it.each(['DONE', 'COMPLETED', 'GRADED'])('returns completed %s tasks without metadata checks or new writes', async status => {
    const f = fixture();
    f.state.tasks[0].status = status;
    f.state.profiles.push({ profile_code: 'SOURCE-A', company_code: 'COMP-A', status: 'INACTIVE' });
    const original = f.db.query.getMockImplementation()!;
    f.db.query.mockImplementation(async (sql, args) => {
      if (!sql.includes('FROM pkg_tasks')) throw new Error('Frozen history must not resolve live masters');
      return original(sql, args);
    });
    await expect(f.service.submitGrade('LEGACY-23', {}, 7)).resolves.toMatchObject({ code: 200, data: { status } });
    await expect(f.service.packComplete('LEGACY-23', {}, 7)).resolves.toMatchObject({ code: 200, data: { status } });
    f.noMutation();
  });

  it('keeps already completed collection reads outside the policy gate', async () => {
    const f = fixture();
    f.state.shifts[0].status = 'DONE';
    await expect(f.service.completeShift(17, { total_qty: 30 }, 7)).resolves.toMatchObject({ code: 400 });
    expect(f.db.query).toHaveBeenCalledTimes(1);
    f.noMutation();
  });
});

describe('legacy stock gate HTTP behavior', () => {
  let app: INestApplication;
  const f = fixture();
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PackagingController],
      providers: [
        { provide: PackagingService, useValue: f.service },
        { provide: TerminalService, useValue: {} },
      ],
    }).overrideGuard(MenuGuard).useValue({ canActivate: () => true })
      .overrideGuard(DataScopeGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  beforeEach(() => { Object.assign(f.state, fixture().state); });

  it.each(['ACTIVE', 'INACTIVE'])('returns HTTP 409, never HTTP 2xx, for %s company through actual legacy routes', async status => {
    f.state.profiles = [{ profile_code: 'SOURCE-A', company_code: 'COMP-A', status }];
    for (const [path, body] of [
      ['/api/packaging/shifts/17/complete', { total_qty: 30 }],
      ['/api/packaging/shifts/17/reopen', { reason: 'test' }],
      ['/api/packaging/tasks/LEGACY-23/grade', { grade_results: { A: 30 } }],
      ['/api/packaging/tasks/LEGACY-23/pack-complete', { packed_qty: 30 }],
    ] as const) {
      const response = await request(app.getHttpServer()).post(path).send(body).expect(409);
      expect(response.body.message).toContain('当前包装作业中心');
    }
    f.noMutation();
  });

  it.each(['wrong-context', 'unknown-house', 'mixed-source'])('returns non-2xx for %s on the actual bare legacy packaging API', async kind => {
    const body: any = { packed_qty: 30 };
    if (kind === 'wrong-context') body.company_code = 'COMP-B';
    if (kind === 'unknown-house') f.state.houses = [];
    if (kind === 'mixed-source') f.state.batches[0].company_code = 'COMP-B';
    await request(app.getHttpServer()).post('/api/packaging/tasks/LEGACY-23/pack-complete').send(body).expect(409);
    f.noMutation();
  });
});
