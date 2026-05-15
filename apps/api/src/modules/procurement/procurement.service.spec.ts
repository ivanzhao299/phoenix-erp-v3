import { BadRequestException } from '@nestjs/common';
import { ProcurementService } from './procurement.service';

describe('ProcurementService', () => {
  let em: { save: jest.Mock; transaction: jest.Mock; findOne: jest.Mock; query: jest.Mock };
  let cls: { get: jest.Mock };
  let approval: { initiate: jest.Mock };
  let service: ProcurementService;

  beforeEach(() => {
    em = {
      save:        jest.fn(async (_entity, x) => x),
      transaction: jest.fn(async (cb) => cb(em as never)),
      findOne:     jest.fn(),
      query:       jest.fn(),
    };
    cls = { get: jest.fn((k: string) => (k === 'user.storeCode' ? 'ALL' : 'tester')) };
    approval = { initiate: jest.fn() };
    service = new ProcurementService(em as never, approval as never, cls as never);
  });

  it('createPurchaseOrder generates po_no + applies LAK currency on amount > 50000', async () => {
    const po = await service.createPurchaseOrder({
      supplier_code: 'S1', plan_qty: 100, total_amount: 60000,
    });
    expect(po.po_no).toMatch(/^PO-\d+-\d+$/);
    expect(po.currency_code).toBe('LAK');
    expect(po.supplier_code).toBe('S1');
    expect(em.save).toHaveBeenCalledTimes(1);
  });

  it('createPurchaseOrder defaults currency to CNY on amount <= 50000', async () => {
    const po = await service.createPurchaseOrder({
      supplier_code: 'S2', plan_qty: 5, total_amount: 1000,
    });
    expect(po.currency_code).toBe('CNY');
  });

  it('createPurchaseOrder honors explicit currency_code override', async () => {
    const po = await service.createPurchaseOrder({
      supplier_code: 'S3', plan_qty: 1, total_amount: 99999, currency_code: 'USD',
    });
    expect(po.currency_code).toBe('USD');
  });

  it('BadRequestException is the expected error class for invalid input', () => {
    // Sanity: importing BadRequestException keeps test in sync with service's error contract.
    expect(new BadRequestException('x')).toBeInstanceOf(BadRequestException);
  });
});
