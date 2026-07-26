import { FarmFeedController } from './farm-feed.controller';
import { FarmFeedService } from './farm-feed.service';
import { REQUIRE_MENU_KEY } from '../../common/guards/menu.guard';

describe('FarmFeedController ledger save payload compatibility', () => {
  const date = '2026-07-20';
  const rows = [{ material_name: '玉米', inbound_qty: 8 }];

  function setup() {
    const feedService = {
      saveLedger: jest.fn().mockResolvedValue({ code: 200, data: rows }),
    } as unknown as jest.Mocked<Pick<FarmFeedService, 'saveLedger'>>;
    return {
      controller: new FarmFeedController(feedService as unknown as FarmFeedService),
      saveLedger: feedService.saveLedger,
    };
  }

  it('accepts the PC feed ledger rows payload and persists it', async () => {
    const { controller, saveLedger } = setup();

    await expect(controller.saveLedger(
      { date, rows },
      { user: { username: 'admin' } },
    )).resolves.toEqual({ code: 200, data: rows });

    expect(saveLedger).toHaveBeenCalledWith(date, rows, 'admin');
  });

  it('retains support for the legacy items payload', async () => {
    const { controller, saveLedger } = setup();

    await controller.saveLedger(
      { date, items: rows },
      { user: { sub: 'operator-id' } },
    );

    expect(saveLedger).toHaveBeenCalledWith(date, rows, 'operator-id');
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
});
