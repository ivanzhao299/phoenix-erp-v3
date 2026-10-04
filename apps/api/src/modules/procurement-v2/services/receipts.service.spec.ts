import { BadRequestException } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { Prc2PurchaseOrderEntity } from '../entities/prc2-purchase-order.entity';
import { Prc2ReceiptEntity } from '../entities/prc2-receipt.entity';

describe('ReceiptsService purchase warehouse usage guard', () => {
  function buildService() {
    const po = {
      id: 'po-1', poNo: 'PO2-20261004-00001', status: 'APPROVED', companyCode: 'COMP-LAO-AGRI', projectCode: 'PRJ-1',
    };
    const receipt = {
      id: 'rcp-1', status: 'DRAFT', warehouseCode: 'LPH_MS_EGG_FARM',
      companyCode: 'COMP-LAO-AGRI', projectCode: 'PRJ-1',
    };
    const mgr = {
      findOne: jest.fn(async (entity: unknown) => {
        if (entity === Prc2PurchaseOrderEntity) return po;
        if (entity === Prc2ReceiptEntity) return receipt;
        return null;
      }),
    };
    const ds = {
      manager: mgr,
      transaction: jest.fn(async (fn: (manager: typeof mgr) => unknown) => fn(mgr)),
    };
    const scopeHelper = {
      assertWritableOwnership: jest.fn(), assertWritableWarehouse: jest.fn(),
    };
    const wms = {
      assertPurchaseReceiptWarehouseUsage: jest.fn(async () => {
        throw new BadRequestException('采购收货仅允许饲料/药品疫苗/采购到货/原料包材仓');
      }),
      inboundFromReceipt: jest.fn(),
    };
    const cls = { get: jest.fn(() => ({ userId: 'buyer-1', username: 'buyer' })) };
    const service = new ReceiptsService(
      {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
      ds as never, cls as never, scopeHelper as never, wms as never,
    );
    return { service, mgr, scopeHelper, wms };
  }

  it('checks warehouse usage while creating a receipt', async () => {
    const { service, mgr, scopeHelper, wms } = buildService();
    await expect(service.create({
      poId: 'po-1', poNo: 'PO2-20261004-00001', warehouseCode: 'LPH_MS_EGG_FARM', items: [],
    } as never)).rejects.toMatchObject({
      response: { message: '采购收货仅允许饲料/药品疫苗/采购到货/原料包材仓' },
    });
    expect(scopeHelper.assertWritableWarehouse).toHaveBeenCalledWith('LPH_MS_EGG_FARM', '采购收货单');
    expect(wms.assertPurchaseReceiptWarehouseUsage).toHaveBeenCalledWith(mgr, 'LPH_MS_EGG_FARM');
  });

  it('rejects a mismatched PO number instead of persisting an inconsistent receipt link', async () => {
    const { service, wms } = buildService();
    await expect(service.create({
      poId: 'po-1', poNo: 'PO2-WRONG', warehouseCode: 'LPH_MS_EGG_FARM', items: [],
    } as never)).rejects.toMatchObject({
      response: { message: expect.stringContaining('采购订单引用不一致') },
    });
    expect(wms.assertPurchaseReceiptWarehouseUsage).not.toHaveBeenCalled();
  });

  it('rechecks warehouse usage while confirming a receipt before any stock posting', async () => {
    const { service, mgr, wms } = buildService();
    await expect(service.confirm('rcp-1', {})).rejects.toBeInstanceOf(BadRequestException);
    expect(wms.assertPurchaseReceiptWarehouseUsage).toHaveBeenCalledWith(mgr, 'LPH_MS_EGG_FARM');
    expect(wms.inboundFromReceipt).not.toHaveBeenCalled();
  });

  it('provides a no-write warehouse validation path for production regression', async () => {
    const { service, wms } = buildService();
    await expect(service.validateWarehouseUsage('LPH_MS_EGG_FARM')).rejects.toBeInstanceOf(BadRequestException);
    expect(wms.assertPurchaseReceiptWarehouseUsage).toHaveBeenCalledWith(
      expect.anything(), 'LPH_MS_EGG_FARM',
    );
    expect(wms.inboundFromReceipt).not.toHaveBeenCalled();
  });
});
