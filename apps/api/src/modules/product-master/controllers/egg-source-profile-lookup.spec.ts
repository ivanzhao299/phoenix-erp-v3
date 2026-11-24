import { BadRequestException } from '@nestjs/common';
import { LookupController } from './lookup.controller';

describe('GET /api/lookup/egg-source-profile contract', () => {
  function makeController(em: any, { global = true, companies = null as string[] | null, user = { userId: 'u1', roles: ['ROLE_ADMIN'] } } = {}) {
    const cls = { get: (key: string) => (key === 'user' ? user : undefined) };
    const dataScope = { resolve: async () => ({ isGlobal: global, allowedCompanyCodes: companies ?? (global ? null : []), allowedFarmCodes: [], allowedWarehouseCodes: [], allowedSiteCodes: [] }) };
    return new LookupController(undefined as never, em, cls as never, dataScope as never, undefined as never);
  }

  it('filters the selected house by its real company and visible company, farm or site before reading any profile', async () => {
    const query = jest.fn(async (_sql: string, _params: unknown[]) => []);
    const em = { transaction: (read: Function) => read({query}) };
    const result = await makeController(em, {global:false,companies:['COMP-A']})
      .eggSourceProfile('HOUSE-A','2026-11-14','COMP-B');
    expect(result.data).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('f.company_code=$2');
    expect(sql).toContain('f.farm_code=ANY');
    expect(params).toEqual(['HOUSE-A','COMP-B',false,['COMP-A'],[],[]]);
  });

  it('returns data null without hitting the DB for users with an empty company scope', async () => {
    const em = { query: jest.fn(async () => { throw new Error('must not query'); }) };
    const result = await makeController(em, { global: false, user: undefined }).eggSourceProfile('HOUSE_DP_01');
    expect(result).toEqual({ code: 200, data: null });
    expect(em.query).not.toHaveBeenCalled();
  });

  it('rejects a missing houseCode and malformed dates fail-closed', async () => {
    const controller = makeController({ query: jest.fn() });
    await expect(controller.eggSourceProfile('')).rejects.toThrow(BadRequestException);
    await expect(controller.eggSourceProfile('HOUSE_DP_01', '2026-02-30')).rejects.toThrow(BadRequestException);
    await expect(controller.eggSourceProfile('HOUSE_DP_01', '2026/11/14')).rejects.toThrow(BadRequestException);
  });
});
