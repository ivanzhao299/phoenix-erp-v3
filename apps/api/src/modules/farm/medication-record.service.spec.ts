import { ConflictException, ForbiddenException } from '@nestjs/common';
import { MedicationRecordService } from './medication-record.service';

describe('MedicationRecordService', () => {
  const ledgerColumns = [
    'id', 'batch_no', 'change_type', 'qty_change', 'log_date', 'warehouse_code',
    'company_code', 'store_code', 'operator', 'ref_no', 'business_type', 'note',
  ].map(column_name => ({ column_name }));

  function build(scope: any = { isGlobal: true, allowedCompanyCodes: [], allowedSiteCodes: [], allowedFarmCodes: [], allowedWarehouseCodes: [] }) {
    const manager = { query: jest.fn() };
    const ds = {
      query: jest.fn().mockResolvedValue(ledgerColumns),
      transaction: jest.fn(async (callback: (m: any) => Promise<any>) => callback(manager)),
    };
    const cls = { get: jest.fn().mockReturnValue(scope) };
    return { service: new MedicationRecordService(ds as any, cls as any), ds, manager, cls };
  }

  const input = {
    site_code: 'SITE-A',
    company_code: 'COMP-A',
    farm_code: 'FARM-A',
    flock_no: 'FLOCK-A',
    house_code: 'HOUSE-A',
    medication_code: 'MED-A',
    start_date: '2026-07-01',
    end_date: '2026-07-02',
    actual_qty: 8,
    qty_unit: 'BOTTLE',
    withdraw_days: 3,
    warehouse_code: 'WH-MED-A',
  };

  it('allocates FEFO lots and writes stock, ledger, record, and issue lines in one transaction', async () => {
    const { service, manager } = build();
    manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT f.flock_no')) return [{ flock_no: 'FLOCK-A', farm_code: 'FARM-A', house_code: 'HOUSE-A', mapped_site_code: 'SITE-A', farm_company_code: 'COMP-A', status: 'ACTIVE' }];
      if (sql.includes('FROM brd_medications')) return [{ medication_code: 'MED-A', medication_name: '药品A', unit_code: 'BOTTLE', default_withdraw_days: 1 }];
      if (sql.includes('SELECT b.batch_no')) return [
        { batch_no: 'B-EXP-1', qty: 5, qty_available: 5, expire_date: '2026-08-01', inbound_date: '2026-06-01' },
        { batch_no: 'B-EXP-2', qty: 5, qty_available: 5, expire_date: '2026-09-01', inbound_date: '2026-05-01' },
      ];
      if (sql.includes('INSERT INTO brd_medication_records')) return [{ id: 10, record_no: 'REC-1', course_no: 'COURSE-1', withdraw_until: '2026-07-05', status: 'USING' }];
      if (sql.includes('UPDATE inv_batches')) return [{ batch_no: 'B-EXP-1' }];
      if (sql.includes('INSERT INTO inv_ledger')) return [{ id: 100 }];
      return [];
    });

    const result = await service.create({ ...input, record_no: 'REC-1', course_no: 'COURSE-1' }, 'jwt-user');

    expect(result.record_no).toBe('REC-1');
    expect(result.allocated).toEqual([{ batch_no: 'B-EXP-1', qty: 5, expire_date: '2026-08-01', inbound_date: '2026-06-01' }, { batch_no: 'B-EXP-2', qty: 3, expire_date: '2026-09-01', inbound_date: '2026-05-01' }]);
    expect(manager.query.mock.calls.map(call => String(call[0]))).toEqual(expect.arrayContaining([
      expect.stringContaining('ORDER BY b.expire_date ASC NULLS LAST'),
      expect.stringContaining("COALESCE(qty_available, qty, 0) >= $1::numeric"),
      expect.stringContaining('INSERT INTO brd_medication_issue_lines'),
    ]));
    const recordParams = manager.query.mock.calls.find(call => String(call[0]).includes('INSERT INTO brd_medication_records'))[1];
    expect(recordParams[19]).toBe('jwt-user');
    expect(recordParams[23]).toBe('jwt-user');
    expect(recordParams[24]).toBe('jwt-user');
  });

  it('returns 409 before any write when FEFO stock cannot cover the request', async () => {
    const { service, manager } = build();
    manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT f.flock_no')) return [{ flock_no: 'FLOCK-A', farm_code: 'FARM-A', house_code: 'HOUSE-A', mapped_site_code: 'SITE-A', farm_company_code: 'COMP-A', status: 'ACTIVE' }];
      if (sql.includes('FROM brd_medications')) return [{ medication_code: 'MED-A', unit_code: 'BOTTLE', default_withdraw_days: 0 }];
      if (sql.includes('SELECT b.batch_no')) return [{ batch_no: 'B-ONLY', qty: 3, qty_available: 3, expire_date: null, inbound_date: null }];
      return [];
    });

    await expect(service.create(input, 'jwt-user')).rejects.toBeInstanceOf(ConflictException);
    expect(manager.query.mock.calls.some(call => String(call[0]).includes('UPDATE inv_batches'))).toBe(false);
    expect(manager.query.mock.calls.some(call => String(call[0]).includes('INSERT INTO brd_medication_records'))).toBe(false);
  });

  it('rejects a lot query outside the caller site scope', async () => {
    const { service, ds } = build({
      isGlobal: false,
      allowedCompanyCodes: ['COMP-A'],
      allowedSiteCodes: ['SITE-B'],
      allowedFarmCodes: [],
      allowedWarehouseCodes: [],
    });

    await expect(service.getLots('MED-A', 'SITE-A', 'COMP-A')).rejects.toBeInstanceOf(ForbiddenException);
    expect(ds.query).not.toHaveBeenCalled();
  });

  it('cancels a record by restoring each issue line and writing reverse ledger entries', async () => {
    const { service, manager } = build();
    manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM brd_medication_records')) return [{ id: 10, record_no: 'REC-1', status: 'USING', company_code: 'COMP-A', site_code: 'SITE-A' }];
      if (sql.includes('FROM brd_medication_issue_lines')) return [{ id: 1, inventory_batch_no: 'B-1', qty: 2 }];
      if (sql.includes('UPDATE inv_batches')) return [{ batch_no: 'B-1' }];
      if (sql.includes('INSERT INTO inv_ledger')) return [{ id: 101 }];
      if (sql.includes('UPDATE brd_medication_records')) return [{ id: 10, record_no: 'REC-1', status: 'CANCELLED' }];
      return [];
    });

    await expect(service.cancel(10, 'jwt-user')).resolves.toMatchObject({ status: 'CANCELLED' });
    const reverseUpdate = manager.query.mock.calls.find(call => String(call[0]).includes('UPDATE inv_batches'));
    expect(reverseUpdate[1]).toEqual([2, 'B-1']);
    const reverseLedger = manager.query.mock.calls.find(call => String(call[0]).includes('INSERT INTO inv_ledger'));
    expect(reverseLedger[1][1]).toBe('MED_INBOUND');
    expect(reverseLedger[1][2]).toBe(2);
  });

  it('returns a distinct expired-batch error before creating a record', async () => {
    const { service, manager } = build();
    manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT f.flock_no')) return [{ flock_no: 'FLOCK-A', farm_code: 'FARM-A', house_code: 'HOUSE-A', mapped_site_code: 'SITE-A', farm_company_code: 'COMP-A', status: 'ACTIVE' }];
      if (sql.includes('FROM brd_medications')) return [{ medication_code: 'MED-A', unit_code: 'BOTTLE', default_withdraw_days: 0 }];
      if (sql.includes('SELECT b.batch_no')) return [{
        batch_no: 'B-OLD', qty: 10, qty_available: 10, status: 'AVAILABLE',
        expire_date: '2026-06-01', store_code: 'SITE-A', company_code: 'COMP-A', warehouse_code: 'WH-A',
      }];
      return [];
    });

    await expect(service.create({ ...input, inventory_batch_no: 'B-OLD', warehouse_code: 'WH-A' }, 'jwt-user'))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'MEDICATION_STOCK_EXPIRED' }) });
    expect(manager.query.mock.calls.some(call => String(call[0]).includes('INSERT INTO brd_medication_records'))).toBe(false);
  });

  it('returns a distinct cross-site error for a batch owned by another site', async () => {
    const { service, manager } = build();
    manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT f.flock_no')) return [{ flock_no: 'FLOCK-A', farm_code: 'FARM-A', house_code: 'HOUSE-A', mapped_site_code: 'SITE-A', farm_company_code: 'COMP-A', status: 'ACTIVE' }];
      if (sql.includes('FROM brd_medications')) return [{ medication_code: 'MED-A', unit_code: 'BOTTLE', default_withdraw_days: 0 }];
      if (sql.includes('SELECT b.batch_no')) return [{
        batch_no: 'B-OTHER', qty: 10, qty_available: 10, status: 'AVAILABLE',
        expire_date: '2026-12-01', store_code: 'SITE-B', company_code: 'COMP-A', warehouse_code: 'WH-A',
      }];
      return [];
    });

    await expect(service.create({ ...input, inventory_batch_no: 'B-OTHER', warehouse_code: 'WH-A' }, 'jwt-user'))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'MEDICATION_STOCK_CROSS_SITE' }) });
  });

  it('propagates a write failure so the datasource transaction rolls back', async () => {
    const { service, manager } = build();
    manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT f.flock_no')) return [{ flock_no: 'FLOCK-A', farm_code: 'FARM-A', house_code: 'HOUSE-A', mapped_site_code: 'SITE-A', farm_company_code: 'COMP-A', status: 'ACTIVE' }];
      if (sql.includes('FROM brd_medications')) return [{ medication_code: 'MED-A', unit_code: 'BOTTLE', default_withdraw_days: 0 }];
      if (sql.includes('SELECT b.batch_no')) return [{ batch_no: 'B-1', qty: 10, qty_available: 10, status: 'AVAILABLE', warehouse_code: 'WH-MED-A' }];
      if (sql.includes('INSERT INTO brd_medication_records')) return [{ id: 10, record_no: 'REC-1', course_no: 'COURSE-1', status: 'USING' }];
      if (sql.includes('UPDATE inv_batches')) return [{ batch_no: 'B-1' }];
      if (sql.includes('INSERT INTO inv_ledger')) return [{ id: 100 }];
      if (sql.includes('INSERT INTO brd_medication_issue_lines')) throw new Error('issue line write failed');
      return [];
    });

    await expect(service.create(input, 'jwt-user')).rejects.toThrow('issue line write failed');
    expect(manager.query.mock.calls.some(call => String(call[0]).includes('INSERT INTO brd_medication_issue_lines'))).toBe(true);
  });
});
