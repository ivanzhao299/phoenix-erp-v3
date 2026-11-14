import { BadRequestException } from '@nestjs/common';
import { LookupController } from './lookup.controller';

describe('GET /api/lookup/egg-source-profile contract', () => {
  const PROFILE_ROW = {
    profileCode: 'ESP-COMP-LAO-XINGCHI-HOUSE_DP_01-2026-11-10',
    companyCode: 'COMP-LAO-XINGCHI', farmCode: 'FARM-DP', siteCode: 'SITE-DONGPENG-LAYER',
    houseCode: 'HOUSE_DP_01', productMode: 'VARIANT', varietyCode: 'EGG_PINK',
    varietyName: '粉壳蛋', shellColor: 'PINK',
  };

  function makeController(em: any, { global = true, companies = null as string[] | null, user = { userId: 'u1', roles: ['ROLE_ADMIN'] } } = {}) {
    const cls = { get: (key: string) => (key === 'user' ? user : undefined) };
    const dataScope = { resolve: async () => ({ isGlobal: global, allowedCompanyCodes: companies ?? (global ? null : []), allowedFarmCodes: [], allowedWarehouseCodes: [], allowedSiteCodes: [] }) };
    return new LookupController(undefined as never, em, cls as never, dataScope as never, undefined as never);
  }

  it('returns the active house profile with variety attributes, latest effective first', async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const em = { query: jest.fn(async (sql: string, params: unknown[]) => { queries.push({ sql, params }); return [PROFILE_ROW]; }) };
    const result = await makeController(em).eggSourceProfile('HOUSE_DP_01', '2026-11-14');
    expect(result).toEqual({ code: 200, data: PROFILE_ROW });
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain('FROM md_egg_source_profiles p');
    expect(queries[0].sql).toContain("p.status='ACTIVE'");
    expect(queries[0].sql).toContain('LIMIT 1');
    // 有效期窗口：生效日 <= 业务日，失效日空或 >= 业务日
    expect(queries[0].sql).toContain('p.effective_date <= COALESCE($2::date, CURRENT_DATE)');
    expect(queries[0].sql).toMatch(/\(p\.expire_date IS NULL OR p\.expire_date >= COALESCE\(\$2::date, CURRENT_DATE\)\)/);
    expect(queries[0].params[0]).toBe('HOUSE_DP_01');
  });

  it('defaults eggDate to today when omitted', async () => {
    const em = { query: jest.fn(async (_sql: string, _params?: unknown[]) => [PROFILE_ROW]) };
    await makeController(em).eggSourceProfile('HOUSE_DP_01');
    expect(em.query.mock.calls[0]?.[1]).toEqual(['HOUSE_DP_01', null]);
  });

  it('scopes non-global users to their companies', async () => {
    const em = { query: jest.fn(async (_sql: string, _params?: unknown[]) => []) };
    await makeController(em, { global: false, companies: ['COMP-LAO-XINGCHI'] }).eggSourceProfile('HOUSE_DP_01', '2026-11-14');
    const [sql, params] = em.query.mock.calls[0] ?? [];
    expect(sql).toContain('p.company_code = ANY($3)');
    expect(params?.[2]).toEqual(['COMP-LAO-XINGCHI']);
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
    await expect(controller.eggSourceProfile('HOUSE_DP_01', '2026/11/14')).rejects.toThrow(BadRequestException);
  });
});
