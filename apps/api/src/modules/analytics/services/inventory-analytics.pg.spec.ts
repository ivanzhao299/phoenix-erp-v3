import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { InventoryAnalyticsService } from './inventory-analytics.service';

const url = process.env.PACKAGING_P4_BI_URL;
const fixture = url ? describe : describe.skip;

fixture('inventory analytics — isolated PostgreSQL 18 scope and turnover', () => {
  jest.setTimeout(30000);
  let db: DataSource;
  let service: InventoryAnalyticsService;
  let companyCode: string;
  let warehouseCode: string;
  let productCode: string;
  let skuCode: string;
  const prefix = `ANALYTICS-P4-${process.pid}-`;
  const scope = () => ({
    isGlobal: false,
    scopeLevel: 'COMPANY' as const,
    allowedCompanyCodes: [companyCode],
    allowedProjectCodes: [],
    allowedWarehouseCodes: [warehouseCode],
    allowedFarmCodes: [],
    allowedSiteCodes: [],
    userId: 'analytics-p4-fixture',
  });

  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== '127.0.0.1' || parsed.port !== '55432' || parsed.pathname !== '/packaging_p4_bi') {
      throw new Error('Owned loopback packaging_p4_bi database required');
    }
    db = await new DataSource({ type: 'postgres', url, entities: [], synchronize: false, migrationsRun: false,
      installExtensions: false, extra: { max: 1 } }).initialize();
    const [{ server_version: version }] = await db.query('SHOW server_version');
    if (!version.startsWith('18.')) throw new Error('PostgreSQL 18 required');

    const [sample] = await db.query(`WITH sample_sku AS (
        SELECT product_code,sku_code FROM product_skus WHERE status='ACTIVE'
          AND product_code IS NOT NULL AND sku_code IS NOT NULL ORDER BY sku_code LIMIT 1
      )
      SELECT w.company_code,w.warehouse_code,s.product_code,s.sku_code
      FROM wms_warehouses w CROSS JOIN sample_sku s
      WHERE w.status='ACTIVE' AND w.company_code NOT IN ('','ALL')
        AND official_inventory_allows($1,w.company_code,w.warehouse_code,s.product_code,s.sku_code,NULL)
      ORDER BY w.company_code,w.warehouse_code,s.sku_code LIMIT 1`, [`${prefix}PROBE`]);
    if (!sample) throw new Error('No active warehouse and SKU pair is eligible for official inventory analytics');
    companyCode = sample.company_code;
    warehouseCode = sample.warehouse_code;
    productCode = sample.product_code;
    skuCode = sample.sku_code;

    await db.query(`CREATE TEMP TABLE inv_batches (
      batch_no text PRIMARY KEY, company_code text NOT NULL, warehouse_code text NOT NULL,
      product_code text NOT NULL, sku_code text NOT NULL, material_code text,
      unit text, status text, qty numeric NOT NULL, qty_available numeric NOT NULL,
      unit_cost numeric, source_type text, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TEMP TABLE inv_ledger (
      id bigint PRIMARY KEY, batch_no text NOT NULL, company_code text NOT NULL, warehouse_code text NOT NULL,
      change_type text NOT NULL, qty_change numeric NOT NULL, ref_no text, created_at timestamptz NOT NULL DEFAULT now()
    );`);
    service = new InventoryAnalyticsService(db.manager);
  });

  beforeEach(async () => {
    await db.query('TRUNCATE inv_ledger, inv_batches');
  });

  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  async function addBatch(options: { suffix: string; unit?: string; status?: string; qty: number; available: number }) {
    const batchNo = `${prefix}${options.suffix}`;
    await db.query(`INSERT INTO inv_batches(batch_no,company_code,warehouse_code,product_code,sku_code,unit,status,qty,qty_available,unit_cost)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,0)`, [batchNo, companyCode, warehouseCode, productCode, skuCode,
      options.unit ?? '枚', options.status ?? 'AVAILABLE', options.qty, options.available]);
    return batchNo;
  }

  async function addLedger(batchNo: string, id: number, changeType: string, qty: number, company = companyCode, warehouse = warehouseCode) {
    await db.query(`INSERT INTO inv_ledger(id,batch_no,company_code,warehouse_code,change_type,qty_change,ref_no)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [id, batchNo, company, warehouse, changeType, qty, `${prefix}REF-${id}`]);
  }

  it('computes 30/60 for actual sales and the per-unit warehouse, while rejecting mismatched ledger ownership', async () => {
    const batch = await addBatch({ suffix: 'EGG', qty: 60, available: 60 });
    await addLedger(batch, 1, 'FIFO_OUT', -30);
    await addLedger(batch, 2, 'TRANSFER_OUT', -5);
    await addLedger(batch, 3, 'SALE_RETURN', 2);
    await addLedger(batch, 4, 'RESERVED', -30);
    await addLedger(batch, 5, 'RELEASED', 4);
    await addLedger(batch, 6, 'OUTBOUND', -7);
    await addLedger(batch, 7, 'FIFO_OUT', -100, 'OTHER-COMPANY', 'OTHER-WAREHOUSE');
    await addLedger(batch, 8, 'FIFO_OUT', -200, companyCode, 'OTHER-WAREHOUSE');

    const result = await service.compute({ companyCode, warehouseCode, unit: '枚', productCode, skuCode }, scope());
    expect(result.status).toBe('AVAILABLE');
    expect(result.salesOutToAvailableStatus).toBe('AVAILABLE');
    expect(result.salesOutToAvailable30Day).toBe(0.5);
    expect(result.salesOutToAvailableByUnit).toEqual([{ unit: '枚', sold30Day: 30, available: 60, rate: 0.5 }]);
    expect(result.otherMovementsByUnit).toEqual([{ unit: '枚', transferOut: 5, saleReturn: 2, otherOut: 7, reserved: 30, released: 4 }]);
    await expect(service.compute({ companyCode: 'OTHER-COMPANY' }, scope())).rejects.toThrow();
    await expect(service.compute({ warehouseCode: 'OTHER-WAREHOUSE' }, scope())).rejects.toThrow();
  });

  it('returns unit rows for mixed measures, marks sold-out products not applicable, and excludes quarantine from available stock', async () => {
    const eggs = await addBatch({ suffix: 'EGG-MIX', qty: 60, available: 60 });
    const kilograms = await addBatch({ suffix: 'KG-MIX', unit: 'kg', qty: 10, available: 10 });
    const quarantine = await addBatch({ suffix: 'QUARANTINE', unit: '盒', status: 'QUARANTINE', qty: 8, available: 0 });
    const soldOut = await addBatch({ suffix: 'SOLD-OUT', unit: '盘', qty: 0, available: 0 });
    await addLedger(eggs, 11, 'FIFO_OUT', -30);
    await addLedger(soldOut, 12, 'SALE_OUTBOUND', -4);

    const mixed = await service.compute({ companyCode, warehouseCode, productCode }, scope());
    expect(mixed.salesOutToAvailableStatus).toBe('MIXED_UNITS');
    expect(mixed.salesOutToAvailable30Day).toBeNull();
    expect(mixed.salesOutToAvailableByUnit).toEqual(expect.arrayContaining([
      { unit: '枚', sold30Day: 30, available: 60, rate: 0.5 },
      { unit: 'kg', sold30Day: 0, available: 10, rate: 0 },
    ]));
    expect(mixed.byStatus?.QUARANTINE?.count).toBe(1);
    expect(mixed.salesOutToAvailableByUnit?.some(row => row.unit === '盒')).toBe(false);

    const soldOutResult = await service.compute({ companyCode, warehouseCode, productCode, skuCode, unit: '盘' }, scope());
    expect(soldOutResult.salesOutToAvailableStatus).toBe('NO_STOCK');
    expect(soldOutResult.salesOutToAvailable30Day).toBeNull();
    expect(soldOutResult.salesOutToAvailableByUnit).toEqual([{ unit: '盘', sold30Day: 4, available: 0, rate: null }]);
  });
});
