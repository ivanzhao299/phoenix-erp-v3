import { REQUIRE_MENU_KEY, MenuRequirement } from '../../common/guards/menu.guard';
import { DashboardBffController, PackagingTerminalBffController } from './bff.controller';

describe('DashboardBffController', () => {
  function buildController() {
    const em = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('FROM inv_batches') && sql.includes('SUM(qty_available)')) {
          return [{ total: 999, batch_count: 3, params }];
        }
        if (sql.includes('FROM brd_flocks')) {
          return [{ total: 1200, params }];
        }
        return [];
      }),
    };

    return {
      controller: new DashboardBffController(em as never),
      em,
    };
  }

  describe('getKpi', () => {
    it('uses the same active flock status scope as the farm overview for group KPI population', async () => {
      const { controller, em } = buildController();

      const res = await controller.getKpi({
        user: { username: 'admin', storeCode: 'ALL', permissions: ['*'] },
      });

      const flockCall = em.query.mock.calls.find(([sql]) => String(sql).includes('FROM brd_flocks'));
      expect(flockCall).toBeDefined();
      expect(String(flockCall?.[0])).toContain("status IN ('LAYING','ACTIVE','laying','active')");
      expect(flockCall?.[1]).toEqual([]);
      expect(res.data.meta.layingTotal).toBe(1200);
    });

    it('reports dashboard stock from flock population instead of egg inventory balance', async () => {
      const { controller } = buildController();

      const res = await controller.getKpi({
        user: { username: 'admin', storeCode: 'ALL', permissions: ['*'] },
      });

      expect(res.data.stats.stock).toEqual({ value: '1,200', unit: '羽', trend: null });
      expect(res.data.meta.stockAvailableTotal).toBe(999);
      expect(res.data.meta.stockMetricSource).toBe('brd_flocks.status IN ACTIVE/LAYING SUM(current_qty)');
      expect(res.data.meta.eggInventoryMetricSource).toBe('inv_batches.status=AVAILABLE SUM(qty_available)');
    });

    it('keeps farm scope while counting ACTIVE and LAYING flocks for restricted KPI population', async () => {
      const { controller, em } = buildController();

      await controller.getKpi({
        user: { username: 'farm-manager', storeCode: 'LPH_MENGSAI', permissions: [] },
      });

      const flockCall = em.query.mock.calls.find(([sql]) => String(sql).includes('FROM brd_flocks'));
      expect(flockCall).toBeDefined();
      expect(String(flockCall?.[0])).toContain("status IN ('LAYING','ACTIVE','laying','active')");
      expect(String(flockCall?.[0])).toContain('farm_code = $1');
      expect(flockCall?.[1]).toEqual(['LPH_MENGSAI']);
    });
  });
});

describe('PackagingTerminalBffController', () => {
  it('allows collection editors to close a collection shift', () => {
    const requirement = Reflect.getMetadata(
      REQUIRE_MENU_KEY,
      PackagingTerminalBffController.prototype.closeShift,
    ) as MenuRequirement;

    expect(requirement).toEqual({
      menu: 'MENU_PKG_OP',
      perm: 'E',
      altMenus: ['MENU_PROD_COLLECTION'],
      denialMessage: undefined,
    });
  });

  it('rejects inconsistent collection quantities before touching the database', async () => {
    const em = { query: jest.fn() };
    const controller = new PackagingTerminalBffController(em as never, {} as never);

    await expect(controller.receiveBatch({
      houseCode: 'HOUSE-01',
      totalQty: 100,
      dirtyQty: 10,
      crackedQty: 5,
      receivedQty: 85,
    }, { user: { id: 1 } })).rejects.toThrow('采集数量');

    expect(em.query).not.toHaveBeenCalled();
  });

  it('persists all source quantity columns for a new received batch', async () => {
    const em = {
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('SELECT * FROM pkg_source_batches')) return [{ id: 1, batch_code: 'SRC-1' }];
        return [];
      }),
    };
    const controller = new PackagingTerminalBffController(em as never, {} as never);

    await expect(controller.receiveBatch({
      batchCode: 'SRC-1',
      houseCode: 'HOUSE-01',
      totalQty: 100,
      dirtyQty: 10,
      crackedQty: 5,
      receivedQty: 100,
    }, { user: { id: 1 } })).resolves.toMatchObject({ code: 200 });

    const insertCall = em.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO pkg_source_batches'));
    expect(insertCall).toBeDefined();
    expect(String(insertCall?.[0])).toContain('total_qty, dirty_qty, cracked_qty');
    expect(insertCall?.[1]).toEqual(expect.arrayContaining(['HOUSE-01', 100, 10, 5, 100]));
  });

  it('keeps total collection separate from the gradable balance', async () => {
    const em = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('AS total_gradable')) {
          return [{ total_received: 800, total_gradable: 780 }];
        }
        if (sql.includes('AS total_graded')) return [{ total_graded: 0 }];
        return [];
      }),
    };
    const controller = new PackagingTerminalBffController(em as never, {} as never);

    await expect(controller.submitGrading({
      productionDate: '2026-07-21',
      outputs: { GRADE_1: 781 },
    })).rejects.toThrow('可分级余量 780');

    const sourceCall = em.query.mock.calls.find(([sql]) => String(sql).includes('AS total_gradable'));
    expect(String(sourceCall?.[0])).toContain('SUM(total_qty - dirty_qty - cracked_qty)');
  });
});
