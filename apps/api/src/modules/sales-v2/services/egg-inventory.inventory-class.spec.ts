import { EggInventoryService } from './egg-inventory.service';

function makeService(query: jest.Mock) {
  return new EggInventoryService({
    query,
    transaction: async (run: (manager: any) => unknown) => run({ query }),
  } as never, { get: jest.fn() } as never);
}

describe('EggInventoryService inventory-class sales boundaries', () => {
  it('allows both STANDARD and DEFECT_SALE only for farm sales queries', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = makeService(query);
    await service.getAvailableBatches({
      productCode: 'EGG',
      companyCode: 'COMP-FARM',
      warehouseCode: 'WH-FARM',
      salesContext: 'FARM_SALES',
    });
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("b.inventory_class IN ('STANDARD','DEFECT_SALE')");
    expect(sql).toContain("sales_wh.type = 'EGG_FARM'");
    expect(query.mock.calls[0][1]).toContain('WH-FARM');
  });

  it('keeps Store/POS queries restricted to STANDARD inventory', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = makeService(query);
    await service.getAvailableBatches({
      productCode: 'EGG',
      companyCode: 'COMP-STORE',
      warehouseCode: 'WH-STORE',
      salesContext: 'STORE_POS',
    });
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("b.inventory_class = 'STANDARD'");
    expect(sql).not.toContain("b.inventory_class IN ('STANDARD','DEFECT_SALE')");
  });
});
