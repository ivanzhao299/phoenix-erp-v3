import { FarmService, dailyLogScopeWhere, deriveOrgScope } from './farm.service';

describe('FarmService', () => {
  describe('organization scope', () => {
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
      svc: new FarmService(entityManager as never),
      entityManager,
      manager,
    };
  }

  describe('submitBreedingDailyLog', () => {
    it.each([
      undefined,
      null,
      '',
      '   ',
      '加载中...',
      '加载中…',
    ])('rejects missing house_code before touching SQL: %p', async (houseCode) => {
      const { entityManager, svc } = buildSvc();

      await expect(svc.submitBreedingDailyLog({
        log_date: '2026-07-07',
        shift: 'MORNING',
        house_code: houseCode,
        eggs_produced: 10,
      })).rejects.toThrow('请先选择鸡舍后再提交');

      expect(entityManager.query).not.toHaveBeenCalled();
      expect(entityManager.transaction).not.toHaveBeenCalled();
    });

    it('trims a selected house_code and writes the daily log', async () => {
      const { manager, svc } = buildSvc();

      await expect(svc.submitBreedingDailyLog({
        log_date: '2026-07-07',
        shift: 'MORNING',
        house_code: ' H001 ',
        eggs_produced: 0,
        mortality_qty: 0,
        opening_qty: 100,
      })).resolves.toEqual({ code: 200, msg: '日报提交成功' });

      expect(manager.query).toHaveBeenCalledTimes(1);
      expect(manager.query.mock.calls[0][0]).toContain('INSERT INTO "brd_daily_logs"');
      expect(manager.query.mock.calls[0][1]).toContain('H001');
      expect(manager.query.mock.calls[0][1]).not.toContain(' H001 ');
    });

    it('binds ownership from the house and accepts any farm in the guarded scope', async () => {
      const { entityManager, manager, svc } = buildSvc();
      entityManager.query.mockResolvedValueOnce([{
        farm_code: 'LPH-MS-02',
        site_code: 'SITE-MS-02',
        company_code: 'COMP-LAO-AGRI',
      }]);

      await expect(svc.submitBreedingDailyLog({
        log_date: '2026-07-07',
        shift: 'MORNING',
        house_code: 'H002',
        farm_code: 'SPOOFED-FARM',
        site_code: 'SPOOFED-SITE',
        company_code: 'SPOOFED-COMPANY',
        eggs_produced: 0,
        mortality_qty: 0,
        opening_qty: 100,
      }, {
        isGlobal: false,
        farmCode: 'LPH-MS-01',
        siteCode: 'SITE-MS-01',
        farmCodes: ['LPH-MS-01', 'LPH-MS-02'],
        siteCodes: ['SITE-MS-01', 'SITE-MS-02'],
        companyCodes: ['COMP-LAO-AGRI'],
      })).resolves.toEqual({ code: 200, msg: '日报提交成功' });

      const values = manager.query.mock.calls[0][1];
      expect(values).toEqual(expect.arrayContaining(['LPH-MS-02', 'SITE-MS-02', 'COMP-LAO-AGRI']));
      expect(values).not.toEqual(expect.arrayContaining(['SPOOFED-FARM', 'SPOOFED-SITE', 'SPOOFED-COMPANY']));
    });
  });

  it('uses house ownership fallback for grade breakdown and trend queries', async () => {
    const { entityManager, svc } = buildSvc();
    entityManager.query
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

    expect(entityManager.query.mock.calls[0][0]).toContain('LEFT JOIN brd_houses h');
    expect(entityManager.query.mock.calls[0][0]).toContain('COALESCE(dl.farm_code, h.farm_code)');
    expect(entityManager.query.mock.calls[1][0]).toContain('LEFT JOIN brd_houses h');
    expect(entityManager.query.mock.calls[1][0]).toContain('COALESCE(dl.farm_code, h.farm_code)');
  });
});
