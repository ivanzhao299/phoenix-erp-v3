import { FarmService, dailyLogScopeWhere, deriveOrgScope } from './farm.service';

describe('FarmService', () => {
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

    it('derives eggs_produced from the canonical GRADE_1..5 saleable grades', async () => {
      const { entityManager, manager, svc } = buildSvc();
      manager.query.mockResolvedValue([]);
      entityManager.query.mockResolvedValueOnce([
        { grade_code: 'GRADE_1' }, { grade_code: 'GRADE_2' }, { grade_code: 'GRADE_3' },
        { grade_code: 'GRADE_4' }, { grade_code: 'GRADE_5' },
      ]);

      await svc.submitBreedingDailyLog({
        log_date: '2026-07-16',
        shift: 'MORNING',
        house_code: 'H001',
        eggs_by_grade: {
          GRADE_1: 10, GRADE_2: 20, GRADE_3: 30, GRADE_4: 40, GRADE_5: 50,
          DIRTY: 3, CRACKED: 2, BROKEN: 1, DAMAGED: 4,
        },
        mortality_qty: 0,
        opening_qty: 1000,
      });

      const sql = manager.query.mock.calls[0][0] as string;
      const values = manager.query.mock.calls[0][1] as unknown[];
      expect(values[sql.match(/\(([^)]+)\) VALUES/)![1].split(',').indexOf('"eggs_produced"')]).toBe(150);
      expect(manager.query.mock.calls.some(([query]) => String(query).includes("'FARM_IN'"))).toBe(false);
    });

    it('skips the legacy FARM_IN ledger when an explicit total accompanies grades', async () => {
      const { entityManager, manager, svc } = buildSvc();
      entityManager.query.mockResolvedValueOnce([
        { grade_code: 'GRADE_1' }, { grade_code: 'GRADE_2' },
      ]);
      manager.query.mockResolvedValue([]);

      await svc.submitBreedingDailyLog({
        log_date: '2026-07-16',
        shift: 'MORNING',
        house_code: 'H001',
        eggs_produced: 200,
        eggs_by_grade: { GRADE_1: 100, GRADE_2: 100 },
        mortality_qty: 0,
        opening_qty: 1000,
      });

      expect(manager.query.mock.calls.some(([query]) => String(query).includes("'FARM_IN'"))).toBe(false);
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
    expect(entityManager.query.mock.calls[3][0]).toContain("UPPER(f.status) IN ('LAYING','PEAK','DECLINING')");
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
