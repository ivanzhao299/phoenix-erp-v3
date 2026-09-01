import { GoneException } from '@nestjs/common';
import { GenericCrudController } from '../generic-crud/generic-crud.controller';
import { RetiredPosController, StoreController } from './store.controller';

describe('Store V1-5 legacy write retirement contract', () => {
  const gone = async (action: () => unknown) => {
    await expect(Promise.resolve().then(action)).rejects.toBeInstanceOf(GoneException);
    await expect(Promise.resolve().then(action)).rejects.toThrow('旧门店');
  };

  it('returns 410 from every legacy daily-close write action', async () => {
    const controller = new StoreController({} as any);
    await gone(() => controller.submitDailyClose());
    await gone(() => controller.updateDailyClose());
    await gone(() => controller.closeStoreDay());
    await gone(() => controller.submitV2DailyClose());
  });

  it('returns 410 from the retired POS sale write routes', async () => {
    const controller = new RetiredPosController();
    await gone(() => controller.createSale());
    await gone(() => controller.updateSale());
    await gone(() => controller.deleteSale());
    await gone(() => controller.refundSale());
    await gone(() => controller.openSession());
    await gone(() => controller.closeSession());
    await gone(() => controller.approveLoss());
    await gone(() => controller.confirmReceiving());
    await gone(() => controller.approveReplenishment());
  });

  it.each(['pos_sales', 'pos_sale_items', 'daily_close', 'store_inventory'])(
    'blocks Generic CRUD writes while preserving historical reads for %s',
    async (table) => {
      const controller = new GenericCrudController({} as any, {} as any, {} as any, {} as any);
      const req = { user: { username: 'admin', permissions: ['*'] } };
      await gone(() => (controller as any).checkTableAccess(table, req, 'POST'));
      await gone(() => (controller as any).checkTableAccess(table, req, 'PUT'));
      await gone(() => (controller as any).checkTableAccess(table, req, 'DELETE'));
      expect(() => (controller as any).checkTableAccess(table, req, 'GET')).not.toThrow();
    },
  );
});
