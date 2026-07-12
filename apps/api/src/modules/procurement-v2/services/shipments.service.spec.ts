import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ShipmentsService } from './shipments.service';
import { Prc2PurchaseOrderEntity } from '../entities/prc2-purchase-order.entity';
import { Prc2ShipmentEntity } from '../entities/prc2-shipment.entity';

describe('ShipmentsService purchase order linkage', () => {
  const po = {
    id: '42',
    poNo: 'PO2-20260707-00002',
    companyId: '7',
    companyCode: 'LAO-AGRI',
    companyName: '老挝凤凰农业发展有限公司',
    projectId: '9',
    projectCode: 'P-FARM',
    projectName: '凤凰农场',
  };

  function buildService(options?: { existingShipment?: Partial<Prc2ShipmentEntity>; poRow?: typeof po | null }) {
    const saved: unknown[] = [];
    const mgr = {
      query: jest.fn(async () => undefined),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn(async () => ({ max: null })),
      })),
      findOne: jest.fn(async (entity: unknown) => {
        if (entity === Prc2PurchaseOrderEntity) return options?.poRow === undefined ? po : options.poRow;
        if (entity === Prc2ShipmentEntity) {
          return {
            id: '88',
            shipmentNo: 'SHP2-20260707-00001',
            status: 'DRAFT',
            companyCode: 'LAO-AGRI',
            projectCode: 'P-FARM',
            ...options?.existingShipment,
          };
        }
        return null;
      }),
      create: jest.fn((_entity: unknown, value: unknown) => value),
      save: jest.fn(async (_entity: unknown, value: unknown) => {
        saved.push(value);
        return value;
      }),
    };
    const ds = {
      transaction: jest.fn(async (fn: (manager: typeof mgr) => unknown) => fn(mgr)),
    };
    const cls = {
      get: jest.fn((key: string) => key === 'user' ? { userId: 'u1', username: 'tester' } : undefined),
    };
    const scopeHelper = {
      assertWritableOwnership: jest.fn(),
      applyToQb: jest.fn(),
      assertOwnership: jest.fn(),
    };

    const service = new ShipmentsService({} as never, {} as never, {} as never, ds as never, cls as never, scopeHelper as never);
    return { service, mgr, ds, scopeHelper, saved };
  }

  it('creates a shipment linked by poNo and fills poId plus ownership fields from the purchase order', async () => {
    const { service, mgr, scopeHelper } = buildService();

    const result = await service.create({
      poNo: po.poNo,
      carrierName: '测试承运商',
    });

    expect(mgr.findOne).toHaveBeenCalledWith(Prc2PurchaseOrderEntity, { where: { poNo: po.poNo } });
    expect(scopeHelper.assertWritableOwnership).toHaveBeenCalledWith(
      { companyCode: po.companyCode, projectCode: po.projectCode },
      '采购订单',
    );
    expect(result).toMatchObject({
      poId: po.id,
      poNo: po.poNo,
      companyCode: po.companyCode,
      companyName: po.companyName,
      projectCode: po.projectCode,
      projectName: po.projectName,
      carrierName: '测试承运商',
      status: 'DRAFT',
    });
  });

  it('updates a draft shipment linked by poId and fills the matching poNo', async () => {
    const { service } = buildService();

    const result = await service.update('88', {
      poId: po.id,
    });

    expect(result).toMatchObject({
      poId: po.id,
      poNo: po.poNo,
      companyCode: po.companyCode,
      projectCode: po.projectCode,
    });
  });

  it('rejects mismatched poId and poNo instead of saving an inconsistent association', async () => {
    const { service } = buildService();

    await expect(service.create({
      poId: po.id,
      poNo: 'PO2-OTHER',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns 404 when the referenced purchase order does not exist', async () => {
    const { service } = buildService({ poRow: null });

    await expect(service.create({
      poNo: po.poNo,
    })).rejects.toBeInstanceOf(NotFoundException);
  });
});
