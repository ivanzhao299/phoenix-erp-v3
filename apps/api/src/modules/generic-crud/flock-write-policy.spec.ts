import { writeFlock } from './flock-write-policy';

describe('flock provenance writes', () => {
  const payload = { flock_no: 'FK1', farm_code: 'F1', house_code: 'H1', breed_code: 'B1' };
  function fixture(current?: Record<string, unknown>, facts: unknown[] = []) {
    const query = jest.fn(async (sql: string) => {
      if (sql.startsWith('SELECT * FROM brd_flocks')) return current ? [current] : [];
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
  it('does not allow another primary key or unsafe field names', async () => {
    const f = fixture();
    await expect(writeFlock(f.manager, payload, { pkName: 'house_code', id: 'H1' })).rejects.toThrow('flock_no');
    await expect(writeFlock(f.manager, { 'x);DROP TABLE': 1 })).rejects.toThrow('字段无效');
    expect(f.transaction).not.toHaveBeenCalled();
  });
});
