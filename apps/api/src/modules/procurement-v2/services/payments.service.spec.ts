import { BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { Prc2ApLedgerEntity } from '../entities/prc2-ap-ledger.entity';

describe('PaymentsService AP allocation resolution', () => {
  const currentAp = {
    id: '22', apNo: 'AP2-20260713-00001', poId: '5', poNo: 'PO2-20260713-00001',
    companyCode: 'COMP-LAO-AGRI', projectCode: 'PRJ-FARM',
  };

  function makeService() {
    const scopeHelper = { assertWritableOwnership: jest.fn() };
    const service = Object.create(PaymentsService.prototype) as any;
    service.scopeHelper = scopeHelper;
    return { service, scopeHelper };
  }

  it('resolves a stale AP id through stable AP and purchase-order references', async () => {
    const { service, scopeHelper } = makeService();
    const mgr = {
      findOne: jest.fn(async (entity: unknown, opts: { where: Record<string, string> }) => {
        expect(entity).toBe(Prc2ApLedgerEntity);
        if (opts.where.id === '11') return null;
        const value = Object.values(opts.where)[0];
        return [currentAp.apNo, currentAp.poId, currentAp.poNo].includes(value) ? currentAp : null;
      }),
    };
    await expect(service.resolveApForAllocation(mgr, {
      apId: '11', apNo: currentAp.apNo, poId: currentAp.poId, poNo: currentAp.poNo,
    }, true)).resolves.toEqual(currentAp);
    expect(scopeHelper.assertWritableOwnership).toHaveBeenCalled();
  });

  it('rejects references that resolve to different AP rows', async () => {
    const { service } = makeService();
    const mgr = {
      findOne: jest.fn(async (_entity: unknown, opts: { where: Record<string, string> }) => (
        opts.where.apNo ? currentAp : opts.where.poNo ? { ...currentAp, id: '23' } : null
      )),
    };
    await expect(service.resolveApForAllocation(mgr, { apNo: currentAp.apNo, poNo: currentAp.poNo }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('inherits company ownership from the resolved AP before DataScope validation', async () => {
    const { service, scopeHelper } = makeService();
    const saved: any[] = [];
    const mgr = {
      findOne: jest.fn(async () => currentAp),
      create: jest.fn((_entity: unknown, value: unknown) => value),
      save: jest.fn(async (_entity: unknown, value: any[]) => { saved.push(...value); }),
    };
    await service.saveAllocations(mgr, 'pay-1', [{
      apId: currentAp.id,
      allocatedAmountOriginal: 10,
    }], 1, {
      companyId: 'company-1', companyCode: currentAp.companyCode, companyName: 'Lao Agri',
      projectId: 'project-1', projectCode: currentAp.projectCode, projectName: 'Farm',
    });
    expect(scopeHelper.assertWritableOwnership).toHaveBeenCalledWith(
      { companyCode: currentAp.companyCode, projectCode: currentAp.projectCode }, '采购付款分摊',
    );
    expect(saved[0]).toMatchObject({ companyCode: currentAp.companyCode, projectCode: currentAp.projectCode });
  });

  it('rejects a cross-company allocation instead of bypassing DataScope', async () => {
    const { service } = makeService();
    const mgr = {
      findOne: jest.fn(async () => currentAp),
      create: jest.fn((_entity: unknown, value: unknown) => value),
      save: jest.fn(),
    };
    await expect(service.saveAllocations(mgr, 'pay-1', [{
      apId: currentAp.id,
      companyCode: 'COMP-OTHER',
      allocatedAmountOriginal: 10,
    }], 1, {
      companyId: 'company-1', companyCode: currentAp.companyCode, companyName: 'Lao Agri',
      projectId: 'project-1', projectCode: currentAp.projectCode, projectName: 'Farm',
    })).rejects.toThrow('付款分摊公司 COMP-OTHER 与 AP 台账公司 COMP-LAO-AGRI 不一致');
  });

  it('rejects an approved company payment with no AP allocation', async () => {
    const service = Object.create(PaymentsService.prototype) as any;
    const pay = {
      id: 'pay-1', status: 'APPROVED', companyCode: 'COMP-LAO-AGRI', projectCode: 'PRJ-FARM',
      isShareholderPayment: false, payerType: 'COMPANY', payerAccount: 'ACC-1', currencyCode: 'CNY', amountOriginal: 100,
    };
    const mgr = {
      findOne: jest.fn().mockResolvedValue(pay),
      find: jest.fn().mockResolvedValue([]),
      query: jest.fn().mockResolvedValue([{
        id: 'cash-1', account_code: 'ACC-1', account_name: 'Cash', company_code: 'COMP-LAO-AGRI',
        company_name: 'Company', currency_code: 'CNY', current_balance: '1000', status: 'ACTIVE',
      }]),
    };
    service.ds = { transaction: jest.fn((fn: (manager: unknown) => unknown) => fn(mgr)) };
    service.scopeHelper = { assertWritableOwnership: jest.fn() };
    service.cls = { get: jest.fn(() => ({ userId: 'u1' })) };

    await expect(service.pay('pay-1', {})).rejects.toThrow('必须关联至少一条 AP 台账');
  });
});
