import { FarmService } from './farm.service';

describe('FarmService', () => {
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
  });
});
