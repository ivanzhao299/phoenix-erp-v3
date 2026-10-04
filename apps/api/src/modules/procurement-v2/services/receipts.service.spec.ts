import { BadRequestException } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { Prc2PurchaseOrderEntity } from '../entities/prc2-purchase-order.entity';
import { Prc2ReceiptEntity } from '../entities/prc2-receipt.entity';
import { Prc2ReceiptItemEntity } from '../entities/prc2-receipt-item.entity';
import { Prc2OrderItemEntity } from '../entities/prc2-order-item.entity';

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

  it('rejects a receipt whose company/project does not match the PO', async () => {
    const { service, mgr } = buildService();
    (await mgr.findOne(Prc2PurchaseOrderEntity) as any).poNo = 'PO-1';

    await expect(service.create({
      poId: 'po-1', poNo: 'PO-1', companyCode: 'OTHER-COMPANY', items: [],
    } as never)).rejects.toMatchObject({
      response: { message: expect.stringContaining('公司') },
    });
  });

  function buildConfirmService(receiptItem: Record<string, unknown>, poItem: Record<string, unknown> | null) {
    const po = {
      id: 'po-1', poNo: 'PO-1', status: 'APPROVED', companyCode: 'COMP-LAO-AGRI', projectCode: 'PRJ-1',
    };
    const receipt = {
      id: 'rcp-1', receiptNo: 'RCV-1', status: 'DRAFT', warehouseCode: 'WH-1',
      companyCode: 'COMP-LAO-AGRI', projectCode: 'PRJ-1', poId: 'po-1', receiptDate: '2026-10-04',
    };
    const mgr = {
      findOne: jest.fn(async (entity: unknown) => {
        if (entity === Prc2ReceiptEntity) return receipt;
        if (entity === Prc2PurchaseOrderEntity) return po;
        if (entity === Prc2OrderItemEntity) return poItem;
        return null;
      }),
      find: jest.fn(async (entity: unknown) => entity === Prc2ReceiptItemEntity ? [receiptItem] : []),
      update: jest.fn(), save: jest.fn(), create: jest.fn((_: unknown, value: unknown) => value),
      query: jest.fn(), createQueryBuilder: jest.fn(),
    };
    const ds = {
      manager: mgr,
      transaction: jest.fn(async (fn: (manager: typeof mgr) => unknown) => fn(mgr)),
    };
    const wms = {
      assertPurchaseReceiptWarehouseUsage: jest.fn(), inboundFromReceipt: jest.fn(),
    };
    const scopeHelper = {
      assertWritableOwnership: jest.fn(), assertWritableWarehouse: jest.fn(),
    };
    const cls = { get: jest.fn(() => ({ userId: 'buyer-1', username: 'buyer' })) };
    const service = new ReceiptsService(
      {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
      ds as never, cls as never, scopeHelper as never, wms as never,
    );
    return { service, mgr, wms };
  }

  it('rejects a missing poItemId before changing PO quantities or inventory', async () => {
    const { service, mgr, wms } = buildConfirmService({ itemName: 'Feed', actualQty: 1 }, null);

    await expect(service.confirm('rcp-1', {})).rejects.toBeInstanceOf(BadRequestException);
    expect(mgr.update).not.toHaveBeenCalled();
    expect(wms.inboundFromReceipt).not.toHaveBeenCalled();
  });

  it('rejects a poItemId belonging to another PO before inventory posting', async () => {
    const { service, mgr, wms } = buildConfirmService(
      { itemName: 'Feed', poItemId: 'poi-foreign', actualQty: 1 },
      { id: 'poi-foreign', poId: 'po-other', qty: 10, receivedQty: 0 },
    );

    await expect(service.confirm('rcp-1', {})).rejects.toBeInstanceOf(BadRequestException);
    expect(mgr.update).not.toHaveBeenCalled();
    expect(wms.inboundFromReceipt).not.toHaveBeenCalled();
  });

  it('locks the receipt row before checking status to serialize concurrent confirmation', async () => {
    const { service, mgr } = buildConfirmService(
      { itemName: 'Feed' },
      null,
    );

    await expect(service.confirm('rcp-1', {})).rejects.toBeInstanceOf(BadRequestException);
    expect(mgr.findOne).toHaveBeenCalledWith(Prc2ReceiptEntity, {
      where: { id: 'rcp-1' },
      lock: { mode: 'pessimistic_write' },
    });
  });
});
