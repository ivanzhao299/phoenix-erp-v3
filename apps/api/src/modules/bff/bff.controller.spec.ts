import { DashboardBffController } from './bff.controller';

describe('DashboardBffController', () => {
  function buildController() {
    const em = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
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
