import { BadRequestException } from '@nestjs/common';
import { OptimisticLockVersionMismatchError } from 'typeorm';
import { InventoryService } from './inventory.service';
import { WmsStockBalanceEntity } from '../entities/wms-stock-balance.entity';

describe('InventoryService', () => {
  const baseDto = {
    warehouse_code: 'W1',
    location_code: 'L1',
    spec_code: 'SP1',
    batch_no: 'B1',
    bill_no: 'BL-1',
    biz_type: 'TEST',
  };

  const buildSvc = () => {
    const manager = {
      findOne: jest.fn(),
      save:    jest.fn(async (_e, x) => x),
    };
    const em = {
      transaction: jest.fn(async (cb: (m: typeof manager) => unknown) => cb(manager)),
    };
    const cls = { get: jest.fn((k: string) =>
      k === 'user.storeCode' ? 'S1'
      : k === 'user.username'  ? 'tester'
      : null) };
    return { manager, em, cls, svc: new InventoryService(em as never, cls as never) };
  };

  it('atomicDecrement rejects qty <= 0', async () => {
    const { svc } = buildSvc();
    await expect(svc.atomicDecrement({ ...baseDto, qty: 0 })).rejects.toThrow(BadRequestException);
    await expect(svc.atomicDecrement({ ...baseDto, qty: -5 })).rejects.toThrow(BadRequestException);
  });

  it('atomicDecrement throws when balance not found', async () => {
    const { manager, svc } = buildSvc();
    manager.findOne.mockResolvedValue(null);
    await expect(svc.atomicDecrement({ ...baseDto, qty: 1 })).rejects.toThrow(/库存不存在/);
  });

  it('atomicDecrement blocks when available qty insufficient', async () => {
    const { manager, svc } = buildSvc();
    manager.findOne.mockResolvedValue({ qty: 10, locked_qty: 8 });
    await expect(svc.atomicDecrement({ ...baseDto, qty: 5 }))
      .rejects.toThrow(/可用库存不足/);
  });

  it('atomicDecrement deducts and writes ledger on success', async () => {
    const { manager, svc } = buildSvc();
    const balance = { qty: 100, locked_qty: 0 } as WmsStockBalanceEntity;
    manager.findOne.mockResolvedValue(balance);
    const result = await svc.atomicDecrement({ ...baseDto, qty: 30 });
    expect((result as WmsStockBalanceEntity).qty).toBe(70);
    expect(manager.save).toHaveBeenCalledTimes(2); // balance + ledger
  });

  it('atomicDecrement converts OptimisticLockVersionMismatchError to BadRequest', async () => {
    const { manager, svc } = buildSvc();
    manager.findOne.mockResolvedValue({ qty: 100, locked_qty: 0 });
    manager.save.mockImplementationOnce(async () => {
      throw new OptimisticLockVersionMismatchError('WmsStockBalance', 1, 2);
    });
    await expect(svc.atomicDecrement({ ...baseDto, qty: 5 }))
      .rejects.toThrow(/乐观锁拦截/);
  });
});
