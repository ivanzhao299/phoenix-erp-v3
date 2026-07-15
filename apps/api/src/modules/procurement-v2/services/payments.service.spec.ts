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
});
