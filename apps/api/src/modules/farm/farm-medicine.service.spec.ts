import { BadRequestException } from '@nestjs/common';
import { FarmMedicineService } from './farm-medicine.service';

describe('FarmMedicineService', () => {
  function buildService(query: jest.Mock) {
    const manager = { query };
    const ds = {
      transaction: jest.fn(async (cb: (manager: { query: jest.Mock }) => Promise<void>) => cb(manager)),
    };
    const scopeHelper = {
      assertWritableWarehouse: jest.fn(),
    };

    return {
      svc: new FarmMedicineService(ds as any, scopeHelper as any),
      ds,
      scopeHelper,
    };
  }

  it('upserts medicine stock before writing inbound ledger', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ batch_no: 'MED-STOCK-MED-001' }])
      .mockResolvedValueOnce([]);
    const { svc, scopeHelper } = buildService(query);

    await svc.inbound('2026-07-07', [{ medication_code: 'MED-001', qty: 12 }], 'admin');

    expect(scopeHelper.assertWritableWarehouse).toHaveBeenCalledWith('MEDICINE', '药品库存');
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('INSERT INTO inv_batches');
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT (batch_no) DO UPDATE');
    expect(query.mock.calls[0][1]).toEqual(['MED-STOCK-MED-001', 'MED-001', 12, 'MEDICINE']);
    expect(query.mock.calls[1][0]).toContain('MED_INBOUND');
    expect(query.mock.calls[1][1]).toEqual(['MED-STOCK-MED-001', 12, '2026-07-07', 'MEDICINE', 'admin', '采购入库']);
  });

  it('rejects inbound for inactive or missing medicine before ledger write', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const { svc } = buildService(query);

    await expect(svc.inbound('2026-07-07', [{ medication_code: 'MISSING', qty: 1 }], 'admin'))
      .rejects.toThrow(BadRequestException);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('WHERE EXISTS');
  });

  it('requires existing medicine stock before outbound ledger write', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const { svc } = buildService(query);

    await expect(svc.outbound('2026-07-07', [{ medication_code: 'MED-001', qty: 2 }], 'admin'))
      .rejects.toThrow(BadRequestException);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('RETURNING batch_no');
  });

  it('deducts medicine stock before writing outbound ledger', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ batch_no: 'MED-STOCK-MED-001' }])
      .mockResolvedValueOnce([]);
    const { svc } = buildService(query);

    await svc.outbound('2026-07-07', [{ medication_code: 'MED-001', qty: 2, house_code: 'A001' }], 'admin');

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('UPDATE inv_batches');
    expect(query.mock.calls[0][1]).toEqual([2, 'MED-STOCK-MED-001']);
    expect(query.mock.calls[1][0]).toContain('MED_OUTBOUND');
    expect(query.mock.calls[1][1]).toEqual(['MED-STOCK-MED-001', -2, '2026-07-07', 'MEDICINE', 'A001', 'admin', '用药出库']);
  });
});
