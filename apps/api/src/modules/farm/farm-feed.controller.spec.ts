import { FarmFeedController } from './farm-feed.controller';
import { FarmFeedService } from './farm-feed.service';
import { REQUIRE_MENU_KEY } from '../../common/guards/menu.guard';

describe('FarmFeedController ledger save payload compatibility', () => {
  const date = '2026-07-20';
  const originalScope = process.env.FARM_FEED_SCOPED_WRITES;
  afterEach(() => {
    if (originalScope === undefined) delete process.env.FARM_FEED_SCOPED_WRITES;
    else process.env.FARM_FEED_SCOPED_WRITES = originalScope;
  });

  function setup() {
    const feedService = {
      saveScopedDay: jest.fn().mockResolvedValue({ version: 1 }),
      saveLedger: jest.fn().mockResolvedValue({ code: 200, data: [] }),
      getHouses: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<Pick<FarmFeedService, 'saveScopedDay' | 'saveLedger' | 'getHouses'>>;
    return {
      controller: new FarmFeedController(feedService as unknown as FarmFeedService),
      saveScopedDay: feedService.saveScopedDay,
      saveLedger: feedService.saveLedger,
      getHouses: feedService.getHouses,
    };
  }

  it('keeps both legacy payloads available until rollout', async () => {
    delete process.env.FARM_FEED_SCOPED_WRITES;
    const { controller, saveLedger, saveScopedDay } = setup();
    const items = [{ material_name: 'A' }];
    const request = { user: { username: 'operator' } };
    await expect(controller.saveLedger({ date, items }, request)).resolves.toEqual({ code: 200, data: [] });
    await controller.saveLedger({ date, rows: items }, request);
    expect(saveLedger).toHaveBeenNthCalledWith(1, date, items, 'operator');
    expect(saveLedger).toHaveBeenNthCalledWith(2, date, items, 'operator');
    await expect(controller.saveScopedDay({ date, companyCode: 'CO', farmCode: 'FA' }, request)).rejects.toThrow('尚未开放登记');
    expect(saveScopedDay).not.toHaveBeenCalled();
  });

  it('reports a malformed rollout setting without opening either write path', async () => {
    process.env.FARM_FEED_SCOPED_WRITES = 'CO/*';
    const { controller, saveLedger, saveScopedDay } = setup();
    await expect(controller.saveLedger({ date, items: [] }, {})).rejects.toThrow('饲料账启用配置无效');
    await expect(controller.saveScopedDay({ date, companyCode: 'CO', farmCode: 'FA' }, {})).rejects.toThrow('饲料账启用配置无效');
    expect(saveLedger).not.toHaveBeenCalled();
    expect(saveScopedDay).not.toHaveBeenCalled();
  });

  it('closes unscoped writes only after the full cutover', async () => {
    process.env.FARM_FEED_SCOPED_WRITES = '*';
    const { controller, saveLedger } = setup();
    await expect(controller.saveLedger({ date, items: [] }, {})).rejects.toThrow('旧饲料账写入已关闭');
    expect(saveLedger).not.toHaveBeenCalled();
  });

  it('limits pilot writes to the configured farm and keeps the authorized actor', async () => {
    process.env.FARM_FEED_SCOPED_WRITES = 'CO/FA';
    const { controller, saveScopedDay } = setup();
    const dataScope = { isGlobal: true };
    const body = { date, companyCode: 'CO', farmCode: 'FA', version: 0, items: [] };
    const request = { dataScope, user: { userId: '01' } };
    await expect(controller.saveScopedDay({ ...body, farmCode: 'FB' }, request)).rejects.toThrow('尚未开放登记');
    await expect(controller.saveScopedDay(body, request)).resolves.toEqual({ code: 200, data: { version: 1 } });
    expect(saveScopedDay).toHaveBeenCalledWith(dataScope, body, '01', { isGlobal: false, allowedWarehouseCodes: [] });
  });

  it('guards local henhouse creation with the create action, not the edit action', () => {
    const requirement = Reflect.getMetadata(
      REQUIRE_MENU_KEY,
      FarmFeedController.prototype.createHouse,
    );

    expect(requirement).toEqual({
      menu: 'MENU_FARM_MASTER',
      perm: 'C',
      altMenus: ['MENU_FARM_DATA'],
      denialMessage: undefined,
    });
  });

  it('returns the full active house list for an administrator global scope', async () => {
    const { controller, getHouses } = setup();

    await controller.getHouses({
      user: { roles: ['ROLE_ADMIN'], storeCode: 'ALL' },
      dataScope: { isGlobal: true },
    });

    expect(getHouses).toHaveBeenCalledWith();
  });

  it('passes a single-farm user scope through to the house query', async () => {
    const { controller, getHouses } = setup();

    await controller.getHouses({
      user: { roles: ['ROLE_FARM_MGR'], storeCode: 'LPH_MENGSAI' },
      dataScope: {
        isGlobal: false,
        allowedFarmCodes: ['LPH_MENGSAI'],
        allowedSiteCodes: [],
        allowedCompanyCodes: ['COMP-LAO-AGRI'],
      },
    });

    expect(getHouses).toHaveBeenCalledWith(
      ['LPH_MENGSAI'],
      [],
      ['COMP-LAO-AGRI'],
    );
  });

  it('fails closed without querying houses when a non-global user has no scope', async () => {
    const { controller, getHouses } = setup();

    await expect(controller.getHouses({
      user: { roles: ['ROLE_FARM_MGR'], storeCode: 'ALL' },
      dataScope: {
        isGlobal: false,
        allowedFarmCodes: [],
        allowedSiteCodes: [],
        allowedCompanyCodes: [],
      },
    })).resolves.toEqual({ code: 200, data: [] });

    expect(getHouses).not.toHaveBeenCalled();
  });
});
