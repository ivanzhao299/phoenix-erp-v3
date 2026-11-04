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
      manager.query.mockResolvedValue([]);

      await expect(svc.submitBreedingDailyLog({
        log_date: '2026-07-07',
        shift: 'MORNING',
        house_code: ' H001 ',
        eggs_produced: 0,
        mortality_qty: 0,
        opening_qty: 100,
      })).resolves.toEqual({ code: 200, msg: '日报提交成功', ledgerSkipped: false });

      const insert = manager.query.mock.calls.find(([query]) => String(query).includes('INSERT INTO "brd_daily_logs"'));
      expect(insert).toBeTruthy();
      expect(insert![1]).toContain('H001');
      expect(insert![1]).not.toContain(' H001 ');
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

      const insert = manager.query.mock.calls.find(([query]) => String(query).includes('INSERT INTO "brd_daily_logs"'))!;
      const sql = insert[0] as string;
      const values = insert[1] as unknown[];
      expect(values[sql.match(/\(([^)]+)\) VALUES/)![1].split(',').indexOf('"eggs_produced"')]).toBe(150);
      expect(manager.query.mock.calls.some(([query]) => String(query).includes('INSERT INTO inv_ledger') && String(query).includes("'FARM_IN'"))).toBe(false);
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

      expect(manager.query.mock.calls.some(([query]) => String(query).includes('INSERT INTO inv_ledger') && String(query).includes("'FARM_IN'"))).toBe(false);
    });

    it('reverses the legacy FARM_IN exactly once when grades are backfilled onto a no-grade report', async () => {
      const { manager, entityManager, svc } = buildSvc();
      entityManager.query.mockResolvedValue([{ grade_code: 'GRADE_1' }, { grade_code: 'GRADE_2' }]);
      manager.query.mockImplementation(async (sql: string, params?: unknown[]) => {
        if (sql.includes('SELECT eggs_by_grade, eggs_produced FROM brd_daily_logs')) {
          return [{ eggs_by_grade: null, eggs_produced: 300 }];
        }
        if (sql.includes('net_farm_in')) return [{ net_farm_in: 300 }];
        if (sql.includes('SELECT batch_no FROM inv_batches')) return [{ batch_no: 'PRD-EGG-OLD' }];
        return [];
      });

      await svc.submitBreedingDailyLog({
        log_date: '2026-07-16', shift: 'MORNING', house_code: 'H001', company_code: 'COMP-A',
        eggs_by_grade: { GRADE_1: 150, GRADE_2: 150 }, mortality_qty: 0, opening_qty: 1000,
      });

      const reversal = manager.query.mock.calls.find(([query]) => String(query).includes("INSERT INTO inv_ledger") && String(query).includes("'FARM_REVERSED'"));
      expect(reversal).toBeTruthy();
      expect(reversal![1]).toEqual(expect.arrayContaining(['PRD-EGG-OLD', 300, 'SYS']));
      expect(String(reversal![1][4])).toContain('冲销历史 FARM_IN 300枚');
      expect(manager.query.mock.calls.some(([query]) => String(query).includes('INSERT INTO inv_ledger') && String(query).includes("'FARM_IN'"))).toBe(false);
    });

    it('refuses removing grades while the report already feeds TEMP_PRODUCTION stock', async () => {
      const { manager, entityManager, svc } = buildSvc();
      entityManager.query.mockResolvedValue([]);
      manager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT eggs_by_grade, eggs_produced FROM brd_daily_logs')) {
          return [{ eggs_by_grade: { GRADE_1: 100 }, eggs_produced: 100 }];
        }
        if (sql.includes('TEMP_PRODUCTION')) return [{ '?column?': 1 }];
        return [];
      });

      await expect(svc.submitBreedingDailyLog({
        log_date: '2026-07-16', shift: 'MORNING', house_code: 'H001',
        eggs_by_grade: {}, eggs_produced: 100, mortality_qty: 0,
      })).rejects.toThrow('不能移除分级明细');
      expect(manager.query.mock.calls.some(([query]) => String(query).includes('INSERT INTO "brd_daily_logs"'))).toBe(false);
    });

    it('keeps the non-blocking contract when no PRD-EGG batch exists, but reports the skipped ledger loudly', async () => {
      const { manager, entityManager, svc } = buildSvc();
      entityManager.query.mockResolvedValue([]);
      manager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT eggs_by_grade, eggs_produced FROM brd_daily_logs')) return [];
        if (sql.includes('SELECT batch_no FROM inv_batches')) return [];
        return [];
      });

      // The daily report must never be blocked by the legacy ledger path
      // (breeding-regression A4 contract), but the skip is explicit in the
      // response instead of a silent stock lie.
      await expect(svc.submitBreedingDailyLog({
        log_date: '2026-07-16', shift: 'MORNING', house_code: 'H001', company_code: 'COMP-A',
        eggs_produced: 120, mortality_qty: 0, opening_qty: 1000,
      })).resolves.toEqual({
        code: 200,
        msg: '日报提交成功（警告：无可用 PRD-EGG 批次，本次 FARM_IN 未记账，请维护批次后补账）',
        ledgerSkipped: true,
      });
      expect(manager.query.mock.calls.some(([query]) => String(query).includes('INSERT INTO inv_ledger'))).toBe(false);
    });

    it('refuses the grade backfill when the original FARM_IN never exists', async () => {
      const { manager, entityManager, svc } = buildSvc();
      entityManager.query.mockResolvedValue([{ grade_code: 'GRADE_1' }]);
      manager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT eggs_by_grade, eggs_produced FROM brd_daily_logs')) {
          return [{ eggs_by_grade: null, eggs_produced: 300 }];
        }
        if (sql.includes('net_farm_in')) return [{ net_farm_in: 0 }];
        return [];
      });

      await expect(svc.submitBreedingDailyLog({
        log_date: '2026-07-16', shift: 'MORNING', house_code: 'H001',
        eggs_by_grade: { GRADE_1: 300 }, mortality_qty: 0,
      })).rejects.toThrow('净额为 0 枚，不足以冲销 300 枚');
      expect(manager.query.mock.calls.some(([query]) => String(query).includes('INSERT INTO inv_ledger'))).toBe(false);
    });

    it('refuses the grade backfill when earlier adjustments already consumed the net FARM_IN', async () => {
      const { manager, entityManager, svc } = buildSvc();
      entityManager.query.mockResolvedValue([{ grade_code: 'GRADE_1' }]);
      manager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT eggs_by_grade, eggs_produced FROM brd_daily_logs')) {
          return [{ eggs_by_grade: null, eggs_produced: 500 }];
        }
        if (sql.includes('net_farm_in')) return [{ net_farm_in: 120 }];
        return [];
      });

      await expect(svc.submitBreedingDailyLog({
        log_date: '2026-07-16', shift: 'MORNING', house_code: 'H001',
        eggs_by_grade: { GRADE_1: 500 }, mortality_qty: 0,
      })).rejects.toThrow('净额为 120 枚，不足以冲销 500 枚');
      expect(manager.query.mock.calls.some(([query]) => String(query).includes('INSERT INTO inv_ledger'))).toBe(false);
    });

    it('treats a repeated grade backfill as an idempotent no-op, never a second reversal', async () => {
      const { manager, entityManager, svc } = buildSvc();
      entityManager.query.mockResolvedValue([{ grade_code: 'GRADE_1' }]);
      manager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT eggs_by_grade, eggs_produced FROM brd_daily_logs')) {
          return [{ eggs_by_grade: null, eggs_produced: 300 }];
        }
        if (sql.includes("note LIKE '日报补录分级：冲销历史 FARM_IN%'")) return [{ '?column?': 1 }];
        return [];
      });

      await expect(svc.submitBreedingDailyLog({
        log_date: '2026-07-16', shift: 'MORNING', house_code: 'H001',
        eggs_by_grade: { GRADE_1: 300 }, mortality_qty: 0,
      })).resolves.toEqual({ code: 200, msg: '日报提交成功', ledgerSkipped: false });
      expect(manager.query.mock.calls.some(([query]) => String(query).includes('INSERT INTO inv_ledger'))).toBe(false);
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
      })).resolves.toEqual({ code: 200, msg: '日报提交成功', ledgerSkipped: false });

      const insert = manager.query.mock.calls.find(([query]) => String(query).includes('INSERT INTO "brd_daily_logs"'));
      expect(insert![1]).toEqual(expect.arrayContaining(['LPH-MS-02', 'SITE-MS-02', 'COMP-LAO-AGRI']));
      expect(insert![1]).not.toEqual(expect.arrayContaining(['SPOOFED-FARM', 'SPOOFED-SITE', 'SPOOFED-COMPANY']));
    });
  });

  it('does not create a legacy FARM_IN delta when updating a graded daily report', async () => {
    const { manager, svc } = buildSvc();
    manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT eggs_produced')) return [{
        eggs_produced: 100,
        mortality_qty: 0,
        log_date: '2026-07-16',
        flock_no: 'FLOCK-A',
        house_code: 'H001',
        company_code: 'COMP-A',
        eggs_by_grade: { GRADE_1: 100 },
      }];
      if (sql.includes('SELECT COALESCE(SUM(mortality_qty)')) return [{ total_mortality: 0, total_eggs: 120 }];
      if (sql.includes('SELECT current_qty')) return [];
      return [];
    });

    await expect(svc.updateBreedingDailyLog(7, {
      house_code: 'H001', flock_no: 'FLOCK-A', log_date: '2026-07-16',
      eggs_produced: 120, eggs_by_grade: { GRADE_1: 120 }, mortality_qty: 0,
    })).resolves.toEqual({ code: 200, msg: '日报更新成功' });
    expect(manager.query).not.toHaveBeenCalledWith(expect.stringContaining("INSERT INTO inv_ledger"), expect.anything());
  });

  it('reverses the original FARM_IN amount when an update backfills grades onto a no-grade report', async () => {
    const { manager, svc } = buildSvc();
    manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT eggs_produced')) return [{
        eggs_produced: 400,
        mortality_qty: 0,
        log_date: '2026-07-16',
        flock_no: 'FLOCK-A',
        house_code: 'H001',
        company_code: 'COMP-A',
        eggs_by_grade: null,
      }];
      if (sql.includes('net_farm_in')) return [{ net_farm_in: 400 }];
      if (sql.includes('SELECT batch_no FROM inv_batches')) return [{ batch_no: 'PRD-EGG-OLD' }];
      if (sql.includes('SELECT COALESCE(SUM(mortality_qty)')) return [{ total_mortality: 0, total_eggs: 400 }];
      if (sql.includes('SELECT current_qty')) return [];
      return [];
    });

    await expect(svc.updateBreedingDailyLog(7, {
      house_code: 'H001', flock_no: 'FLOCK-A', log_date: '2026-07-16',
      eggs_by_grade: { GRADE_1: 200, GRADE_2: 200 }, mortality_qty: 0,
    })).resolves.toEqual({ code: 200, msg: '日报更新成功' });

    const reversal = manager.query.mock.calls.find(([query]) => String(query).includes("INSERT INTO inv_ledger") && String(query).includes("'FARM_REVERSED'"));
    expect(reversal).toBeTruthy();
    expect(reversal![1]).toEqual(expect.arrayContaining(['PRD-EGG-OLD', 400]));
    expect(String(reversal![1][4])).toContain('冲销历史 FARM_IN 400枚（2026-07-16 H001）');
    expect(manager.query.mock.calls.some(([query]) => String(query).includes('INSERT INTO inv_ledger') && String(query).includes("'FARM_IN'"))).toBe(false);
  });

  it('refuses an update that strips grades from a report already posted to TEMP_PRODUCTION stock', async () => {
    const { manager, svc } = buildSvc();
    manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT eggs_produced')) return [{
        eggs_produced: 100,
        mortality_qty: 0,
        log_date: '2026-07-16',
        flock_no: 'FLOCK-A',
        house_code: 'H001',
        company_code: 'COMP-A',
        eggs_by_grade: { GRADE_1: 100 },
      }];
      if (sql.includes('TEMP_PRODUCTION')) return [{ '?column?': 1 }];
      return [];
    });

    await expect(svc.updateBreedingDailyLog(7, {
      house_code: 'H001', flock_no: 'FLOCK-A', log_date: '2026-07-16',
      eggs_by_grade: {}, eggs_produced: 100, mortality_qty: 0,
    })).rejects.toThrow('不能移除分级明细');
    expect(manager.query.mock.calls.some(([query]) => String(query).includes('UPDATE "brd_daily_logs"'))).toBe(false);
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
