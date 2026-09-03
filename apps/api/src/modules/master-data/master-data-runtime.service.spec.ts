import { MasterDataRuntimeService } from './master-data-runtime.service';

describe('MasterDataRuntimeService company display projection', () => {
  const query = jest.fn();
  const service = new MasterDataRuntimeService(
    { query } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { get: jest.fn().mockReturnValue(undefined) } as any,
    {} as any,
  );

  beforeEach(() => query.mockReset());

  it.each(['project', 'customer', 'warehouse', 'store', 'driver', 'vehicle', 'cash-account', 'bank-account'])(
    'keeps list row cardinality and adds canonical company fields for %s',
    async (type) => {
      query.mockResolvedValue([{ company_code: 'COMP-LA', company_display_name: 'Golden Phoenix Laos', company_display_name_zh: '金凤凰老挝' }]);
      const rows = await service.list(type);
      const sql = query.mock.calls[0][0] as string;
      expect(sql).toContain('LEFT JOIN sys_organizations company_org');
      expect(sql).toContain("company_org.org_type = 'COMPANY'");
      expect(sql).toContain('COALESCE(company_org.company_code, company_org.org_code)');
      expect(sql).toContain('company_org.org_name AS company_display_name');
      expect(rows).toHaveLength(1);
      expect(rows[0].company_code).toBe('COMP-LA');
    },
  );

  it('does not invent a company projection for suppliers', async () => {
    query.mockResolvedValue([]);
    await service.list('supplier');
    expect(query.mock.calls[0][0]).not.toContain('company_org');
  });

  it('uses driver_code as the detail key and preserves the display projection', async () => {
    query.mockResolvedValue([{ driver_code: 'DRV-001', driver_name: 'Somchai', company_code: 'COMP-LA' }]);
    const row = await service.get('driver', 'DRV-001');
    expect(query.mock.calls[0][0]).toContain('WHERE base.driver_code = $1');
    expect(query.mock.calls[0][1]).toEqual(['DRV-001']);
    expect(row.driver_code).toBe('DRV-001');
  });
});
