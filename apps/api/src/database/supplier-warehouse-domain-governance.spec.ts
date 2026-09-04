import { GovernSupplierWarehouseTypeDomains1788501600000 } from './migrations/1788501600000-GovernSupplierWarehouseTypeDomains';

describe('supplier/warehouse domain governance migration', () => {
  it('seeds the five multilingual dictionaries and introduces only NOT VALID checks', async () => {
    const sql: string[] = [];
    const runner = { query: jest.fn(async (text: string) => { sql.push(text); }) } as any;
    await new GovernSupplierWarehouseTypeDomains1788501600000().up(runner);
    const all = sql.join('\n');
    for (const type of ['SUPPLIER_SUPPLY_CATEGORY','SUPPLIER_SOURCING_TYPE','WMS_WAREHOUSE_USAGE_TYPE','WMS_WAREHOUSE_FACILITY_CLASS','WMS_WAREHOUSE_CAPABILITY']) {
      expect(all).toContain(type);
    }
    expect(all).toContain("'UNSPECIFIED','待补录','ລໍຖ້າຕື່ມຂໍ້ມູນ','Pending completion'");
    expect(all).toContain("'STORE','门店仓','ສາງຮ້ານ','Store'");
    expect(all).toContain("'COLD_CHAIN','冷链','ຕ່ອງໂສ້ຄວາມເຢັນ','Cold chain'");
    expect((all.match(/NOT VALID/g) ?? [])).toHaveLength(5);
    expect(all).not.toContain('VALIDATE CONSTRAINT');
  });

  it('has a real symmetric down path', async () => {
    const sql: string[] = [];
    const runner = { query: jest.fn(async (text: string) => { sql.push(text); }) } as any;
    await new GovernSupplierWarehouseTypeDomains1788501600000().down(runner);
    const all = sql.join('\n');
    expect(all).toContain('DROP COLUMN IF EXISTS supply_category');
    expect(all).toContain('DROP COLUMN IF EXISTS facility_class');
    expect(all).toContain("UPDATE sys_dict SET status='ARCHIVED'");
  });
});
