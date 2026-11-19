import { FarmService, dailyLogScopeWhere, deriveOrgScope, hasPositiveGradeBreakdown } from './farm.service';

describe('FarmService', () => {
  it('recognizes positive grade breakdowns in object and JSONB forms', () => {
    expect(hasPositiveGradeBreakdown({ GRADE_1: 1 })).toBe(true);
    expect(hasPositiveGradeBreakdown('{"GRADE_1":2}')).toBe(true);
    expect(hasPositiveGradeBreakdown({ GRADE_1: 0, GRADE_2: '' })).toBe(false);
  });

  describe('organization scope', () => {
    it('fails closed when DataScope is missing and the token has no storeCode', () => {
      expect(deriveOrgScope({
        user: { username: 'linhong', roles: ['ROLE_FARM_MGR'], permissions: [] },
      })).toEqual({
        isGlobal: false, farmCode: null, siteCode: null,
        farmCodes: [], siteCodes: [], companyCodes: [],
      });
    });

    it('does not treat a scoped farm manager without legacy storeCode as global', () => {
      const scope = deriveOrgScope({
        user: { username: 'linhong', roles: ['ROLE_FARM_MGR'], permissions: [] },
        dataScope: {
          isGlobal: false,
          allowedFarmCodes: ['LPH-MS'],
          allowedSiteCodes: ['SITE-MS'],
          allowedCompanyCodes: ['COMP-LAO-AGRI'],
        },
      });

      expect(scope).toMatchObject({
        isGlobal: false,
        farmCode: 'LPH-MS',
        siteCode: 'SITE-MS',
      });
    });

    it('uses house ownership as fallback for legacy daily logs without scope columns', () => {
      const params: unknown[] = ['2026-07-18'];
      const where = dailyLogScopeWhere({
        isGlobal: false,
        farmCode: 'LPH-MS',
        siteCode: null,
        farmCodes: ['LPH-MS'],
        companyCodes: [],
      }, params);

      expect(where).toContain('COALESCE(dl.farm_code, h.farm_code)');
      expect(params).toEqual(['2026-07-18', ['LPH-MS']]);
    });
  });

  function buildSvc() {
    const manager = { query: jest.fn() };
    const entityManager = {
      query: jest.fn(),
      transaction: jest.fn(async (cb: (manager: { query: jest.Mock }) => Promise<unknown>) => cb(manager)),
    };

    return {
      svc: new FarmService(entityManager as never, {
        resolveHouse: jest.fn(async (houseCode: string) => {
          const rows = await entityManager.query('', [houseCode]);
          if (!rows.length) throw new Error(`鸡舍不存在：${houseCode}`);
          return {
            houseCode,
            farmCode: rows[0].farm_code,
            siteCode: rows[0].site_code,
            companyCode: rows[0].company_code,
          };
        }),
      } as never),
      entityManager,
      manager,
    };
  }

  it('uses house ownership fallback for grade breakdown and trend queries', async () => {
    const { entityManager, svc } = buildSvc();
    entityManager.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);
    const scope = {
      isGlobal: false,
      farmCode: 'LPH-MS',
      siteCode: null,
      farmCodes: ['LPH-MS'],
      companyCodes: [],
    };

    await svc.getEggsBreakdown('2026-07-18', null, scope);
    await svc.getFarmTrend(7, scope);

    expect(entityManager.query.mock.calls[1][0]).toContain('LEFT JOIN brd_houses h');
    expect(entityManager.query.mock.calls[1][0]).toContain('COALESCE(dl.farm_code, h.farm_code)');
    expect(entityManager.query.mock.calls[2][0]).toContain('LEFT JOIN brd_houses h');
    expect(entityManager.query.mock.calls[2][0]).toContain('COALESCE(dl.farm_code, h.farm_code)');
    expect(entityManager.query.mock.calls[4][0]).toContain("UPPER(f.status) IN ('ACTIVE','GROWING','LAYING','PEAK','DECLINING')");
  });

  it('fills omitted zero quantities from ACTIVE product grades for inbound prefill', async () => {
    const { entityManager, svc } = buildSvc();
    entityManager.query
      .mockResolvedValueOnce([
        { grade_code: 'GRADE_1' }, { grade_code: 'GRADE_2' }, { grade_code: 'GRADE_3' },
        { grade_code: 'GRADE_4' }, { grade_code: 'GRADE_5' }, { grade_code: 'DIRTY' },
        { grade_code: 'CRACKED' }, { grade_code: 'BROKEN' }, { grade_code: 'DAMAGED' },
      ])
      .mockResolvedValueOnce([{
        eggs_by_grade: { GRADE_1: 120, BROKEN: 2 },
        eggs_produced: 122,
      }]);

    await expect(svc.getEggsBreakdown('2026-07-16', null)).resolves.toMatchObject({
      logs: 1,
      total: 122,
      missingBreakdownLogs: 0,
      reportedEggs: 122,
      eggsByGrade: {
        GRADE_1: 120, GRADE_2: 0, GRADE_3: 0, GRADE_4: 0, GRADE_5: 0,
        DIRTY: 0, CRACKED: 0, BROKEN: 2, DAMAGED: 0,
      },
    });
  });

  it('subtracts quantities already posted by daily egg inbound', async () => {
    const { entityManager, svc } = buildSvc();
    entityManager.query
      .mockResolvedValueOnce([{ grade_code: 'GRADE_1' }, { grade_code: 'GRADE_2' }])
      .mockResolvedValueOnce([
        {
          house_code: 'A001',
          eggs_by_grade: { GRADE_1: 100 },
          eggs_produced: 100,
          inbound_by_grade: { GRADE_1: 100 },
        },
        {
          house_code: 'A001',
          eggs_by_grade: { GRADE_1: 50 },
          eggs_produced: 50,
          inbound_by_grade: { GRADE_1: 100 },
        },
      ]);

    await expect(svc.getEggsBreakdown('2026-07-16', 'A001')).resolves.toMatchObject({
      logs: 2,
      reportedEggs: 150,
      total: 50,
      eggsByGrade: { GRADE_1: 50, GRADE_2: 0 },
    });
  });

  it('reports existing daily logs whose grade breakdown is missing', async () => {
    const { entityManager, svc } = buildSvc();
    entityManager.query
      .mockResolvedValueOnce([{ grade_code: 'GRADE_1' }])
      .mockResolvedValueOnce([
        { eggs_by_grade: null, eggs_produced: 90 },
        { eggs_by_grade: {}, eggs_produced: 30 },
      ]);

    await expect(svc.getEggsBreakdown('2026-07-16', 'A001')).resolves.toMatchObject({
      logs: 2,
      total: 0,
      missingBreakdownLogs: 2,
      reportedEggs: 120,
    });
  });
});
