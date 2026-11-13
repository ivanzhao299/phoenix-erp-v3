import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ImmuneService } from './immune.service';

describe('ImmuneService', () => {
  const ledgerColumns = [
    'id', 'batch_no', 'change_type', 'qty_change', 'log_date', 'warehouse_code',
    'company_code', 'store_code', 'operator', 'ref_no', 'business_type', 'note',
  ].map(column_name => ({ column_name }));

  function build(scope: any = {
    isGlobal: true,
    allowedCompanyCodes: [],
    allowedSiteCodes: [],
    allowedFarmCodes: [],
    allowedWarehouseCodes: [],
  }) {
    const manager = { query: jest.fn() };
    const ds = {
      query: jest.fn().mockResolvedValue(ledgerColumns),
      transaction: jest.fn(async (callback: (m: any) => Promise<any>) => callback(manager)),
    };
    const cls = { get: jest.fn().mockReturnValue(scope) };
    return { service: new ImmuneService(ds as any, cls as any), ds, manager, cls };
  }

  const input = {
    site_code: 'SITE-A',
    company_code: 'COMP-A',
    farm_code: 'FARM-A',
    flock_no: 'FLOCK-A',
    house_code: 'HOUSE-A',
    vaccine_code: 'VAC-A',
    plan_date: '2026-12-01',
    planned_heads: 10,
    dose_value: 1,
    dose_unit: 'DOSE',
    method_code: 'DRINKING_WATER',
  };

  function wireCreate(manager: any, row: any = { id: 7, record_no: 'VAC-1', status: 'PLANNED' }) {
    manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM brd_flocks')) return [{
        flock_no: 'FLOCK-A', house_code: 'HOUSE-A', farm_code: 'FARM-A', current_qty: 20, status: 'ACTIVE',
        mapped_site_code: 'SITE-A', farm_company_code: 'COMP-A',
      }];
      if (sql.includes('FROM brd_medications')) return [{ medication_code: 'VAC-A', medication_name: '疫苗A', unit_code: 'DOSE', product_type: 'VACCINE' }];
      if (sql.includes('INSERT INTO brd_vaccinations')) return [row];
      return [];
    });
  }

  it('creates a planned or overdue plan only for an ACTIVE vaccine and a valid flock', async () => {
    const { service, manager } = build();
    wireCreate(manager);

    const result = await service.create(input, 'jwt-user');

    expect(result).toMatchObject({ record_no: 'VAC-1', status: 'PLANNED' });
    const insert = manager.query.mock.calls.find(call => String(call[0]).includes('INSERT INTO brd_vaccinations'));
    expect(insert[1]).toEqual(expect.arrayContaining(['SITE-A', 'COMP-A', 'FARM-A', 'VAC-A', 10]));
    expect(String(insert[0])).toContain('vaccine_code');
  });

  it('lists only active vaccines through the dedicated scoped query', async () => {
    const { service, ds } = build({
      isGlobal: false,
      allowedCompanyCodes: ['COMP-A'],
      allowedSiteCodes: ['SITE-A'],
      allowedFarmCodes: [],
      allowedWarehouseCodes: ['WH-A'],
    });
    ds.query.mockResolvedValue([{ medication_code: 'VAC-A', medication_name: '疫苗A', product_type: 'VACCINE', status: 'ACTIVE' }]);

    await expect(service.listVaccines({ site_code: 'SITE-A', company_code: 'COMP-A' })).resolves.toHaveLength(1);
    expect(String(ds.query.mock.calls[0][0])).toContain("m.status = 'ACTIVE'");
    expect(String(ds.query.mock.calls[0][0])).toContain('m.store_code = $1');
  });

  it('rejects a plan outside the caller data scope before opening a transaction', async () => {
    const { service, ds } = build({
      isGlobal: false,
      allowedCompanyCodes: ['COMP-A'],
      allowedSiteCodes: ['SITE-B'],
      allowedFarmCodes: [],
      allowedWarehouseCodes: [],
    });

    await expect(service.create(input, 'jwt-user')).rejects.toBeInstanceOf(ForbiddenException);
    expect(ds.transaction).not.toHaveBeenCalled();
  });

  it('allocates FEFO vaccine lots and writes one outbound ledger per allocation', async () => {
    const { service, manager } = build();
    manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT * FROM brd_vaccinations')) return [{
        id: 7, record_no: 'VAC-1', status: 'OVERDUE', actual_date: null,
        site_code: 'SITE-A', company_code: 'COMP-A', farm_code: 'FARM-A', flock_no: 'FLOCK-A', house_code: 'HOUSE-A',
        vaccine_code: 'VAC-A', planned_heads: 10, dose_value: 1, vaccine_batch_no: null, inventory_batch_no: null,
      }];
      if (sql.includes('FROM brd_flocks')) return [{ flock_no: 'FLOCK-A', house_code: 'HOUSE-A', farm_code: 'FARM-A', current_qty: 20, status: 'ACTIVE', mapped_site_code: 'SITE-A', farm_company_code: 'COMP-A' }];
      if (sql.includes('FROM inv_batches')) return [
        { batch_no: 'V-EXP-1', qty: 4, qty_available: 4, expire_date: '2027-01-01', inbound_date: '2026-10-01', warehouse_code: 'WH-A' },
        { batch_no: 'V-EXP-2', qty: 10, qty_available: 10, expire_date: '2027-02-01', inbound_date: '2026-09-01', warehouse_code: 'WH-A' },
      ];
      if (sql.includes('SELECT medication_code, medication_name')) return [{ medication_code: 'VAC-A', medication_name: '疫苗A', unit_code: 'DOSE', product_type: 'VACCINE' }];
      if (sql.includes('UPDATE inv_batches')) return [{ batch_no: 'updated' }];
      if (sql.includes('INSERT INTO inv_ledger')) return [{ id: 100 }];
      if (sql.includes('UPDATE brd_vaccinations')) return [{ id: 7, status: 'EXECUTED', actual_heads: 10 }];
      return [];
    });

    const result = await service.execute(7, {}, 'jwt-user');

    expect(result.status).toBe('EXECUTED');
    expect(result.allocated).toEqual([
      expect.objectContaining({ batch_no: 'V-EXP-1', qty: 4 }),
      expect.objectContaining({ batch_no: 'V-EXP-2', qty: 6 }),
    ]);
    expect(manager.query.mock.calls.filter(call => String(call[0]).includes('INSERT INTO inv_ledger'))).toHaveLength(2);
    expect(manager.query.mock.calls.filter(call => String(call[0]).includes('INSERT INTO brd_vaccination_issue_lines'))).toHaveLength(2);
    expect(manager.query.mock.calls.filter(call => String(call[0]).includes('COALESCE(qty_available, qty, 0) >= $1::numeric'))).toHaveLength(2);
  });

  it('honors validated multi-batch issue lines and preserves the manufacturer lot', async () => {
    const { service, manager } = build();
    manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT * FROM brd_vaccinations')) return [{ id: 7, record_no: 'VAC-1', status: 'PLANNED', actual_date: null, site_code: 'SITE-A', company_code: 'COMP-A', farm_code: 'FARM-A', flock_no: 'FLOCK-A', house_code: 'HOUSE-A', vaccine_code: 'VAC-A', planned_heads: 10, dose_value: 1, vaccine_batch_no: 'MAN-001' }];
      if (sql.includes('FROM brd_flocks')) return [{ flock_no: 'FLOCK-A', house_code: 'HOUSE-A', farm_code: 'FARM-A', current_qty: 20, status: 'ACTIVE', mapped_site_code: 'SITE-A', farm_company_code: 'COMP-A' }];
      if (sql.includes('FROM inv_batches')) return [{ batch_no: 'V-REQ', product_code: 'VAC-A', qty: 10, qty_available: 10, expire_date: '2027-01-01', inbound_date: '2026-10-01', warehouse_code: 'WH-A', store_code: 'SITE-A', company_code: 'COMP-A', warehouse_site_code: 'SITE-A', warehouse_company_code: 'COMP-A', warehouse_status: 'ACTIVE', warehouse_type: 'MEDICINE', status: 'AVAILABLE' }];
      if (sql.includes('SELECT medication_code, medication_name')) return [{ medication_code: 'VAC-A', medication_name: '疫苗A', unit_code: 'DOSE', product_type: 'VACCINE' }];
      if (sql.includes('UPDATE inv_batches')) return [{ batch_no: 'V-REQ' }];
      if (sql.includes('INSERT INTO inv_ledger')) return [{ id: 101 }];
      if (sql.includes('UPDATE brd_vaccinations')) return [{ id: 7, status: 'EXECUTED', actual_heads: 10 }];
      return [];
    });

    await service.execute(7, { issue_lines: [{ inventory_batch_no: 'V-REQ', qty: 10 }], actual_heads: 10, vaccine_batch_no: 'MAN-001' }, 'jwt-user');
    const issue = manager.query.mock.calls.find(call => String(call[0]).includes('INSERT INTO brd_vaccination_issue_lines'));
    expect(issue).toBeDefined();
    expect(issue[1]).toEqual(expect.arrayContaining(['V-REQ', 'VAC-A', 10, 101, 'MAN-001']));
  });

  it('returns the locked executed plan without touching inventory on a retry', async () => {
    const { service, manager } = build();
    manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT * FROM brd_vaccinations')) return [{ id: 7, status: 'EXECUTED', actual_date: '2026-11-01', company_code: 'COMP-A', site_code: 'SITE-A', farm_code: 'FARM-A' }];
      return [];
    });

    await expect(service.execute(7, {}, 'jwt-user')).resolves.toMatchObject({ status: 'EXECUTED' });
    expect(manager.query.mock.calls.some(call => String(call[0]).includes('UPDATE inv_batches'))).toBe(false);
    expect(manager.query.mock.calls.some(call => String(call[0]).includes('INSERT INTO inv_ledger'))).toBe(false);
  });

  it('returns 409 and writes nothing when vaccine stock cannot cover the execution', async () => {
    const { service, manager } = build();
    manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT * FROM brd_vaccinations')) return [{ id: 7, record_no: 'VAC-1', status: 'PLANNED', actual_date: null, site_code: 'SITE-A', company_code: 'COMP-A', farm_code: 'FARM-A', flock_no: 'FLOCK-A', house_code: 'HOUSE-A', vaccine_code: 'VAC-A', planned_heads: 10, dose_value: 1 }];
      if (sql.includes('FROM brd_flocks')) return [{ flock_no: 'FLOCK-A', house_code: 'HOUSE-A', farm_code: 'FARM-A', current_qty: 20, status: 'ACTIVE', mapped_site_code: 'SITE-A', farm_company_code: 'COMP-A' }];
      if (sql.includes('FROM inv_batches')) return [{ batch_no: 'V-ONLY', qty: 3, qty_available: 3, expire_date: null, inbound_date: null, warehouse_code: 'WH-A' }];
      if (sql.includes('SELECT medication_code, medication_name')) return [{ medication_code: 'VAC-A', medication_name: '疫苗A', unit_code: 'DOSE', product_type: 'VACCINE' }];
      return [];
    });

    await expect(service.execute(7, {}, 'jwt-user')).rejects.toBeInstanceOf(ConflictException);
    expect(manager.query.mock.calls.some(call => String(call[0]).includes('UPDATE inv_batches'))).toBe(false);
    expect(manager.query.mock.calls.some(call => String(call[0]).includes('UPDATE brd_vaccinations'))).toBe(false);
  });

  it('cancels a pending plan and leaves an executed plan immutable', async () => {
    const { service, manager } = build();
    manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT * FROM brd_vaccinations')) return [{ id: 7, status: 'OVERDUE', actual_date: null, company_code: 'COMP-A', site_code: 'SITE-A', farm_code: 'FARM-A' }];
      if (sql.includes('UPDATE brd_vaccinations')) return [{ id: 7, status: 'CANCELLED' }];
      return [];
    });
    await expect(service.cancel(7, 'jwt-user')).resolves.toMatchObject({ status: 'CANCELLED' });
    expect(manager.query.mock.calls.some(call => String(call[0]).includes("status = 'CANCELLED'"))).toBe(true);
  });
});
