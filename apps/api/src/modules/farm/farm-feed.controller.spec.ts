import { FarmFeedController } from './farm-feed.controller';
import { FarmFeedService } from './farm-feed.service';
import { REQUIRE_MENU_KEY } from '../../common/guards/menu.guard';

describe('FarmFeedController ledger save payload compatibility', () => {
  const date = '2026-07-20';

  function setup() {
    const feedService = {
      saveScopedDay: jest.fn().mockResolvedValue({ version: 1 }),
      getHouses: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<Pick<FarmFeedService, 'saveScopedDay' | 'getHouses'>>;
    return {
      controller: new FarmFeedController(feedService as unknown as FarmFeedService),
      saveScopedDay: feedService.saveScopedDay,
      getHouses: feedService.getHouses,
    };
  }

  it('retains a clear conflict for an old unscoped write', () => {
    const { controller, saveScopedDay } = setup();
    expect(() => controller.saveLedger()).toThrow('旧饲料账写入已关闭');
    expect(saveScopedDay).not.toHaveBeenCalled();
  });

  it('uses auth identity and data scope for scoped saves', async () => {
    const { controller, saveScopedDay } = setup();
    const dataScope = { isGlobal: true };
    const body = { date, companyCode: 'CO', farmCode: 'FA', version: 0, items: [] };
    await expect(controller.saveScopedDay(body,{dataScope,user:{userId:'01'}})).resolves.toEqual({ code: 200, data: {version:1} });
    expect(saveScopedDay).toHaveBeenCalledWith(dataScope,body,'01',{isGlobal:false,allowedWarehouseCodes:[]});
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
