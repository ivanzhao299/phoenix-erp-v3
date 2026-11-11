import { writeFlock } from './flock-write-policy';
import { GenericCrudService } from './generic-crud.service';

describe('flock provenance writes', () => {
  const payload = { flock_no: 'FK1', farm_code: 'F1', house_code: 'H1', breed_code: 'B1' };
  function fixture(current?: Record<string, unknown>, facts: unknown[] = []) {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM brd_flocks') && sql.includes('FOR UPDATE')) return current ? [current] : [];
      if (sql.includes('FROM sys_dict')) return [{ dict_code: 'B1', dict_label_zh: '已核实品种' }];
      if (sql.includes('FROM brd_houses')) return [{ farm_code: 'F1', company_code: 'C1', mapped_site_code: 'S1' }];
      if (sql.includes('FROM brd_daily_logs')) return facts;
      return [];
    });
    const tx = { query };
    const transaction = jest.fn(async (run: (manager: typeof tx) => unknown) => run(tx));
    return { manager: { transaction } as never, query, transaction };
  }
  it('requires a standard breed rather than accepting a display name as identity', async () => {
    const f = fixture();
    await expect(writeFlock(f.manager, { ...payload, breed_code: '', strain: '海兰褐' })).rejects.toThrow('标准');
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
  });
  it('rejects inactive/missing breed at the backend', async () => {
    const f = fixture(); f.query.mockImplementation(async () => []);
    await expect(writeFlock(f.manager, payload)).rejects.toThrow('唯一有效');
  });
  it('rejects a spoofed company or mismatched farm before writing', async () => {
    const f = fixture();
    await expect(writeFlock(f.manager, { ...payload, company_code: 'OTHER' })).rejects.toThrow('权威归属');
    await expect(writeFlock(f.manager, { ...payload, farm_code: 'OTHER' })).rejects.toThrow('归属不一致');
  });
  it('takes the canonical breed display and organisation from locked masters', async () => {
    const f = fixture();
    await expect(writeFlock(f.manager, { ...payload, strain: 'wrong' })).resolves.toMatchObject({ msg: 'Created successfully' });
    const call = f.query.mock.calls.find(([sql]) => sql.startsWith('INSERT')) as unknown as [string, unknown[]];
    expect(call[0]).toContain('company_code');
    expect(call[1]).toContain('已核实品种');
    expect(call[1]).toContain('C1');
    expect(call[1]).not.toContain('wrong');
  });
  it('does not silently relabel provenance after production has been recorded', async () => {
    const f = fixture({ ...payload, breed_code: 'OLD' }, [{ exists: 1 }]);
    await expect(writeFlock(f.manager, { breed_code: 'B1' }, { pkName: 'flock_no', id: 'FK1' })).rejects.toThrow('专项追溯治理');
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });
  it('normalizes only an explicitly selected code matching all exact historic breed labels', async () => {
    const same = fixture({ ...payload, breed_code: null, strain: '已核实品种', breed_type: '已核实品种' }, [{ exists: 1 }]);
    await expect(writeFlock(same.manager, { breed_code: 'B1' }, { pkName: 'flock_no', id: 'FK1' })).resolves.toMatchObject({ msg: 'Updated successfully' });
    const uncertain = fixture({ ...payload, breed_code: null, strain: '已核实品种', breed_type: '另一个品种' }, [{ exists: 1 }]);
    await expect(writeFlock(uncertain.manager, { breed_code: 'B1' }, { pkName: 'flock_no', id: 'FK1' })).rejects.toThrow('专项追溯治理');
  });
  it('rejects invalid or timestamp dates rather than shifting date-only provenance', async () => {
    for (const start_date of ['2026-02-30', '2025-12-31T16:00:00.000Z']) {
      const f = fixture();
      await expect(writeFlock(f.manager, { ...payload, start_date })).rejects.toThrow('YYYY-MM-DD');
    }
    const f = fixture({ ...payload, start_date: '2026-01-01', placement_date: '2026-01-01' }, [{ exists: 1 }]);
    await expect(writeFlock(f.manager, { start_date: '2026-01-01', current_qty: 20 }, { pkName: 'flock_no', id: 'FK1' })).resolves.toMatchObject({ msg: 'Updated successfully' });
    expect(f.query.mock.calls[0][0]).toContain('start_date::text AS start_date');
  });
  it('does not allow another primary key or unsafe field names', async () => {
    const f = fixture();
    await expect(writeFlock(f.manager, payload, { pkName: 'house_code', id: 'H1' })).rejects.toThrow('flock_no');
    await expect(writeFlock(f.manager, { 'x);DROP TABLE': 1 })).rejects.toThrow('字段无效');
    expect(f.transaction).not.toHaveBeenCalled();
  });
});

describe('flock business-date reads', () => {
  it('serializes date-only values in PostgreSQL rather than JS local-midnight dates', async () => {
    const fact = { flock_no: 'FK1', start_date: '2026-01-01', placement_date: '2026-01-01', elimination_date: null };
    const query = jest.fn().mockResolvedValue([{ flock_fact: fact }]);
    const service = new GenericCrudService({ query } as never);
    await expect(service.findAll('brd_flocks', {})).resolves.toEqual([fact]);
    expect(query.mock.calls[0][0]).toContain('row_to_json(flock_rows)');
    await expect(service.findOneByColumn('brd_flocks', 'flock_no', 'FK1')).resolves.toEqual(fact);
    expect(query.mock.calls[1][0]).toContain('row_to_json(flock_row)');
    await expect(service.findAllBreedingScoped('brd_flocks', {}, {farmCodes:['F1'],siteCodes:[],companyCodes:[]})).resolves.toEqual([fact]);
    expect(query.mock.calls[2][0]).toContain('row_to_json(flock_rows)');
    expect(query.mock.calls[2][0]).toContain('"farm_code" = ANY');
    expect(query.mock.calls[2][1]).toContainEqual(['F1']);
  });
});
