import { ConflictException, ValidationPipe } from '@nestjs/common';
import { PackagingTerminalBffController } from './bff.controller';
import { SubmitGradingDto } from './dto/grading.dto';

const payload = {
  shiftId: 55,
  sourceBatchIds: [45],
  outputs: { GRADE_1: 300 },
  idempotencyKey: 'grading-55-45-test-key',
};

function buildController(options: { netQty?: number; sourceShiftId?: number; productionDate?: unknown } = {}) {
  let stored: { code: string; total_output: number; payload_hash: string; status: string; is_test: boolean } | null = null;
  const links: unknown[][] = [];
  const manager: any = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('WHERE idempotency_key = $1')) return stored ? [stored] : [];
      if (sql.includes('FROM pkg_work_shifts') && sql.includes('FOR UPDATE')) {
        return [{ id: 55, production_date: options.productionDate ?? '2026-09-09', status: 'OPEN', is_test: false }];
      }
      if (sql.includes('FROM pkg_source_batches') && sql.includes('FOR UPDATE')) {
        return [{ id: 45, batch_code: 'SRC-45', shift_id: options.sourceShiftId ?? 55,
          house_code: 'HOUSE-1', net_qty: options.netQty ?? 300 }];
      }
      if (sql.includes('FROM pkg_grading_source_links') && sql.includes('GROUP BY')) return [];
      if (sql.includes('INSERT INTO pkg_grading_records')) {
        stored = { status: 'ACTIVE', is_test: false, code: 'GRD-TEST', total_output: Number(params[5]), payload_hash: String(params[7]) };
        return [{ id: 71, code: 'GRD-TEST' }];
      }
      if (sql.includes('INSERT INTO pkg_grading_source_links')) { links.push(params); return []; }
      return [];
    }),
  };
  let queue = Promise.resolve();
  const em: any = {
    transaction: jest.fn((work: (m: any) => Promise<unknown>) => {
      const result = queue.then(() => work(manager));
      queue = result.then(() => undefined, () => undefined);
      return result;
    }),
    query: manager.query,
  };
  const scope = { assertActiveHouseOwnership: jest.fn().mockResolvedValue(undefined) };
  return {
    controller: new PackagingTerminalBffController(em, {} as never, scope as never),
    manager,
    links,
  };
}

describe('PackagingTerminal grading governance', () => {
  it('returns only positive remaining batches for the requested open shift', async () => {
    const em: any = { query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM pkg_work_shifts')) return [{ id: 55, status: 'OPEN', is_test: false }];
      return [{ id: 45, shift_id: 55, house_code: 'HOUSE-1', gradable_qty: 20 }];
    }) };
    const scope = { assertActiveHouseOwnership: jest.fn().mockResolvedValue(undefined) };
    const controller = new PackagingTerminalBffController(em, {} as never, scope as never);
    await expect(controller.getPendingGradingSourceBatches('55')).resolves.toMatchObject({
      data: [{ id: 45, gradable_qty: 20 }],
    });
    expect(em.query).toHaveBeenCalledWith(expect.stringContaining('COALESCE(linked.input_qty, 0)'), [55]);
    expect(em.query).toHaveBeenCalledWith(expect.stringContaining("psb.batch_status = 'RECEIVED'"), [55]);
  });

  it('validates the shared shiftId/sourceBatchIds contract', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    await expect(pipe.transform(payload, { type: 'body', metatype: SubmitGradingDto }))
      .resolves.toMatchObject({ shiftId: 55, sourceBatchIds: [45] });
    await expect(pipe.transform({ ...payload, sourceBatchIds: [] }, { type: 'body', metatype: SubmitGradingDto }))
      .rejects.toMatchObject({ status: 400 });
    const { idempotencyKey: _removed, ...missingKey } = payload;
    await expect(pipe.transform(missingKey, { type: 'body', metatype: SubmitGradingDto }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('formats a database Date value as an ISO production date before insert', async () => {
    const { controller, manager } = buildController({ productionDate: new Date(2026, 8, 10) });
    await expect(controller.submitGrading(payload)).resolves.toMatchObject({ data: { code: 'GRD-TEST' } });
    const insert = manager.query.mock.calls.find(([sql]: [string]) => sql.includes('INSERT INTO pkg_grading_records'));
    expect(insert?.[1]?.[3]).toBe('2026-09-10');
  });

  it('hard-rejects output above the locked source remainder', async () => {
    const { controller, manager } = buildController({ netQty: 299 });
    await expect(controller.submitGrading(payload)).rejects.toBeInstanceOf(ConflictException);
    expect(manager.query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO pkg_grading_records'), expect.anything());
  });

  it('isolates sources from another shift', async () => {
    const { controller } = buildController({ sourceShiftId: 54 });
    await expect(controller.submitGrading(payload)).rejects.toThrow('来源批次不存在或不属于当前班次');
  });

  it('filters VOID sources from pending and locked grading submission queries', async () => {
    const { controller, manager } = buildController();
    await controller.submitGrading(payload);
    expect(manager.query.mock.calls.some(([sql]: [string]) =>
      sql.includes('FROM pkg_source_batches') && sql.includes("batch_status = 'RECEIVED'"))).toBe(true);
  });

  it('rejects legacy grading without source links as a conflict instead of a 500', async () => {
    const em: any = { query: jest.fn(async (sql: string) => sql.includes('FROM pkg_work_shifts') ? [{ status: 'OPEN', is_test: false }] : []) };
    em.transaction = (work: any) => work(em);
    const scope = { assertActiveHouseOwnership: jest.fn().mockResolvedValue(undefined) };
    const controller = new PackagingTerminalBffController(em, {} as never, scope as never);
    await expect(controller.submitPacking({
      idempotencyKey: 'legacy-packing', gradingCodes: ['GRD-LEGACY'], productionDate: '2026-09-10', shiftId: 55,
      batches: [{ grade: 'GRADE_1', boxes: 1, eggs: 30 }],
    })).rejects.toThrow('存在无有效来源关联的分级记录，禁止包装');
  });

  it('replays the same key and payload without a second grading/link insert', async () => {
    const { controller, manager, links } = buildController();
    await expect(controller.submitGrading(payload)).resolves.toMatchObject({ data: { idempotentReplay: false } });
    await expect(controller.submitGrading(payload)).resolves.toMatchObject({
      data: { code: 'GRD-TEST', totalOutput: 300, idempotentReplay: true },
    });
    expect(manager.query.mock.calls.filter(([sql]: [string]) => sql.includes('INSERT INTO pkg_grading_records'))).toHaveLength(1);
    expect(links).toHaveLength(1);
  });

  it('serializes concurrent repeats and returns one original plus one replay', async () => {
    const { controller, manager } = buildController();
    const results = await Promise.all([controller.submitGrading(payload), controller.submitGrading(payload)]);
    expect(results.map(result => result.data.idempotentReplay).sort()).toEqual([false, true]);
    expect(manager.query.mock.calls.filter(([sql]: [string]) => sql.includes('INSERT INTO pkg_grading_records'))).toHaveLength(1);
  });

  it('rejects reuse of an idempotency key with a different payload', async () => {
    const { controller } = buildController();
    await controller.submitGrading(payload);
    await expect(controller.submitGrading({ ...payload, outputs: { GRADE_2: 300 } }))
      .rejects.toThrow('幂等键已用于不同分级载荷');
  });
});
