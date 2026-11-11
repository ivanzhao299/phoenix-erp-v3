import { WmsService } from './wms.service';
import { QuantitySnapshot } from '../product-master/services/quantity-contract';

const SKU = 'SKU-VARIANT-ORIGIN-A';
const snapshot: QuantitySnapshot = {
  version: 1, basis: 'BASE', productCode: 'EGG', gradeCode: 'A', specCode: 'TRAY30',
  skuCode: SKU, baseUnit: '枚', tradeUnit: '枚', factor: 1, baseQty: 2,
};
const user = { username: 'keeper', roles: ['ROLE_ADMIN'] };
const outboundBody = {
  outbound_no: 'OUT-1', type: 'SALE', warehouse_code: 'WH-A', item: SKU, sku_code: SKU,
  item_type: 'SKU', qty: 2, destination_type: 'CUSTOMER', destination_customer_code: 'CUSTOMER-1',
};
const transferBody = { transfer_no: 'TR-1', from_warehouse: 'WH-A', to_warehouse: 'WH-B', items: [{ batch_no: 'B-1', qty: 2 }] };

type Options = {
  company?: string | null; batchCompany?: string; scopeA?: boolean; scopeB?: boolean;
  saleA?: boolean; saleB?: boolean; gradeSaleable?: boolean; outboundType?: 'SALE' | 'SCRAP';
  companyActive?: boolean; variant?: boolean; skuActive?: boolean; organizationRequired?: boolean;
  done?: boolean; orderStatus?: string; transferStatus?: string; quantity?: boolean; batchSelector?: boolean;
  warehouseScope?: string[]; snapshotWarehouse?: string; rejectUpsert?: boolean;
  origin?: { variety_code: string | null; source_profile_code: string | null; source_profile_snapshot: Record<string, any> | null };
  projectBatchSelect?: boolean; stringSourceSnapshot?: boolean; productOnly?: boolean;
};

/** Strict SQL doubles run the real SkuPolicy, not a requireUsable spy/stub. */
function fixture(options: Options = {}) {
  const company = options.company === undefined ? 'COMP-A' : options.company;
  const batch = {
    batch_no: 'B-1', product_code: 'EGG', sku_code: SKU, material_code: null,
    item_type: 'SKU', material_type: 'FINISHED_PRODUCT', unit: '枚', grade_code_std: 'A', spec_code: 'TRAY30',
    legacy_source: null, base_quantity_version: 1, qty: 10, qty_available: 10, status: 'AVAILABLE',
    warehouse_code: 'WH-A', company_code: options.batchCompany ?? company, store_code: 'ALL',
    variety_code: options.variant === false ? null : 'EGG_PINK', source_profile_code: null, source_profile_snapshot: null,
    ...options.origin,
  };
  const order = {
    ...outboundBody, id: 1, status: options.done ? 'DONE' : 'PENDING', company_code: company,
    type: options.outboundType ?? 'SALE',
    ...(options.outboundType === 'SCRAP' ? { destination_type: 'OTHER', destination_code: 'DISPOSAL' } : {}),
    batch_no: options.batchSelector === false ? null : 'B-1', store_code: 'ALL',
    quantity_snapshot: options.quantity ? snapshot : null,
  };
  const calls: Array<[string, any[]]> = [];
  const committed: Array<[string, any[]]> = [];
  let pending: Array<[string, any[]]> = [];
  const manager = { query: jest.fn(async (sql: string, args: any[] = []): Promise<any[]> => {
    calls.push([sql, args]);
    if (/^\s*(INSERT|UPDATE|WITH changed)/.test(sql)) pending.push([sql, args]);
    if (sql.includes('FROM product_skus WHERE sku_code=$1 FOR SHARE')) return [{
      sku_code: SKU, sku_name: 'Variant origin remains A', variety_code: options.variant === false ? null : 'EGG_PINK', org_context_required: options.organizationRequired ?? false,
      product_code: 'EGG', grade_code: 'A', spec_code: 'TRAY30', status: options.skuActive === false ? 'INACTIVE' : 'ACTIVE',
      today: '2026-11-11', effective_date: null, expire_date: null,
    }];
    if (sql.includes('FROM md_product_varieties')) return [{ variety_code: 'EGG_PINK', status: 'ACTIVE', effective_date: null, expire_date: null, today: '2026-11-11' }];
    if (sql.includes('FROM sys_organizations')) return options.companyActive === false ? [] : [{ org_code: args[0] }];
    if (sql.includes('FROM md_sku_org_scope')) {
      const enabled = args[1] === 'COMP-A' ? options.scopeA !== false : args[1] === 'COMP-B' && options.scopeB !== false;
      return enabled ? [{ scope_type: 'COMPANY', scope_code: args[1], status: 'ACTIVE', stock_enabled: true,
        sale_enabled: args[1] === 'COMP-A' ? options.saleA !== false : options.saleB !== false, today: '2026-11-11', effective_date: null, expire_date: null }] : [];
    }
    if (/SELECT \* FROM (mst_products|product_grades|packaging_specs)/.test(sql)) return [{ status: 'ACTIVE', is_saleable: options.gradeSaleable !== false, is_storable: true, base_unit: '枚', product_mode: options.variant === false ? 'STANDARD' : 'VARIANT', variety_code: options.variant === false ? null : 'EGG_PINK' }];
    if (sql.includes('SELECT product_mode,variety_code FROM mst_products')) return [{ product_mode: 'VARIANT', variety_code: 'EGG_PINK' }];
    if (sql.includes('FROM product_skus s JOIN')) return [{ product_code: 'EGG', grade_code: 'A', spec_code: 'TRAY30', unit: '枚', base_unit: '枚', display_unit: '托', qty_per_unit: 30 }];
    if (sql.startsWith('SELECT company_code FROM wms_warehouses')) return [{ company_code: args[0] === 'WH-A' ? company : 'COMP-B' }];
    if (sql.includes('FROM wms_warehouses w')) return [{ company_code: 'COMP-B', store_code: 'STORE-B', store_status: 'ACTIVE' }];
    if (sql.includes('SELECT type, domain FROM wms_warehouses')) return [{ type: 'PURCHASE_RECV', domain: 'OPERATIONAL' }];
    if (sql.includes('SELECT pg_advisory_xact_lock')) return [];
    if (sql.includes("SELECT 'MATERIAL' AS item_type") || sql.includes("SELECT 'SKU' AS item_type")) return [{ item_type: options.productOnly ? 'PRODUCT' : 'SKU' }];
    if (sql.includes('SELECT warehouse_code, operator, store_code, status, type, date FROM wms_inbound')) return [{
      warehouse_code: 'WH-A', store_code: 'ALL', type: 'PURCHASE', status: options.done ? 'COMPLETED' : 'PENDING', date: '2026-11-11',
    }];
    if (sql.includes('FROM wms_inbound_items')) return [];
    if (sql.includes('SELECT task_no,status FROM wms_inbound')) return [];
    if (sql.includes('SELECT outbound_no,status FROM wms_outbound')) return [];
    if (sql.includes('FROM wms_outbound_items')) return [{ id: 2, product_code: SKU, batch_no: 'B-1', qty: 2, quantity_snapshot: options.quantity ? snapshot : null }];
    if (sql.includes('FROM wms_outbound')) return [{ ...order }];
    if (sql.includes('FROM ord_orders')) return [{ order_no: 'SO-1', status: options.orderStatus ?? (options.done ? 'SHIPPED' : 'ALLOCATED'), store_code: 'ALL' }];
    if (sql.includes('FROM wms_transfer_items')) {
      const source = { ...batch, warehouse_code: options.snapshotWarehouse ?? 'WH-A' };
      return [{ id: 3, source_batch_no: 'B-1', expected_qty: 2, source_snapshot: options.stringSourceSnapshot ? JSON.stringify(source) : source }];
    }
    if (sql.includes('FROM wms_transfer WHERE')) return [{ transfer_no: 'TR-1', from_warehouse: 'WH-A', to_warehouse: 'WH-B', status: options.transferStatus ?? 'PENDING' }];
    if (/SELECT \* FROM inv_batches WHERE batch_no\s*=\s*\$1/.test(sql) && args[0] !== 'B-1') return [];
    if (sql.includes('FROM inv_batches')) {
      if (options.projectBatchSelect) {
        const projection = sql.match(/^\s*SELECT\s+([\s\S]*?)\s+FROM inv_batches/)!;
        if (projection[1].trim() !== '*') return [Object.fromEntries(projection[1].split(',').map(name => name.trim()).map(name => [name, (batch as any)[name]]))];
      }
      return [{ ...batch }];
    }
    if (sql.includes('SELECT batch_no FROM changed')) return [{ batch_no: 'B-1' }];
    if (sql.includes('INSERT INTO inv_batches') && sql.includes('ON CONFLICT')) return options.rejectUpsert ? [] : [{ batch_no: args[0] }];
    if (sql.includes('INSERT INTO wms_outbound') && sql.includes('RETURNING')) return [{ ...order }];
    if (/^\s*(INSERT|UPDATE)/.test(sql)) return [];
    throw new Error(`Unmodeled SQL: ${sql}`);
  }) };
  const em = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('SELECT domain FROM wms_warehouses')) return [{ domain: 'OPERATIONAL' }];
      if (sql.includes('SELECT 1 FROM sal_customers')) return [{ ok: 1 }];
      if (sql.includes('FROM inv_batches b')) return [{ ...batch }];
      throw new Error(`Unmodeled external SQL: ${sql}`);
    }),
    transaction: jest.fn(async (fn: any) => {
      pending = [];
      try { const result = await fn(manager); committed.push(...pending); return result; }
      finally { pending = []; }
    }),
  };
  const cls = { get: jest.fn(() => ({ isGlobal: !options.warehouseScope, allowedWarehouseCodes: options.warehouseScope ?? [], allowedCompanyCodes: ['COMP-A', 'COMP-B'] })) };
  return { service: new WmsService(em as any, cls as any), manager, calls, committed, batch, em };
}

type Fixture = ReturnType<typeof fixture>;
const operations: Array<[string, (f: Fixture) => Promise<any>, Options?]> = [
  ['batch inbound create', f => f.service.createBatchInbound({ documents: [{ task_no: 'IN-1', type: 'PURCHASE', warehouse_code: 'WH-A', items: [{ sku_code: SKU, qty: 2 }] }] }, user)],
  ['inbound explicit SKU confirm', f => f.service.confirmInbound({ task_no: 'IN-1', items: [{ sku_code: SKU, batch_no: 'B-NEW', actual_qty: 2 }] }, user)],
  ['inbound legacy product field confirm', f => f.service.confirmInbound({ task_no: 'IN-1', items: [{ product_code: SKU, batch_no: 'B-NEW', actual_qty: 2 }] }, user)],
  ['purchase receipt inbound', f => f.service.inboundFromReceipt(f.manager as any, { refNo: 'RCV-1', warehouseCode: 'WH-A', items: [{ skuCode: SKU, qty: 2 }] })],
  ['standalone outbound create', f => f.service.createStandaloneOutbound(outboundBody, user)],
  ['standalone outbound edit', f => f.service.updateStandaloneOutbound('OUT-1', { remark: 'edit' }, user)],
  ['batch outbound create', f => f.service.createBatchStandaloneOutbound({ documents: [{ ...outboundBody, items: [{ sku_code: SKU, qty: 2 }] }] }, user)],
  ['batch outbound confirm', f => f.service.confirmBatchStandaloneOutbound({ documents: ['OUT-1'] }, user)],
  ['batch quantity outbound confirm', f => f.service.confirmBatchStandaloneOutbound({ documents: ['OUT-1'] }, user), { quantity: true }],
  ['standalone outbound confirm', f => f.service.confirmStandaloneOutbound('OUT-1', user)],
  ['standalone quantity outbound confirm', f => f.service.confirmStandaloneOutbound('OUT-1', user), { quantity: true }],
  ['outbound item selector confirm', f => f.service.confirmStandaloneOutbound('OUT-1', user), { batchSelector: false }],
  ['sales order batch shipment', f => f.service.advanceOutboundOrder('SO-1', { next_status: 'SHIPPED', items: [{ batch_no: 'B-1', sku_code: SKU, qty: 2 }] }, user)],
  ['sales order SKU selector shipment', f => f.service.advanceOutboundOrder('SO-1', { next_status: 'SHIPPED', items: [{ sku_code: SKU, qty: 2 }] }, user)],
  ['pending transfer create', f => f.service.createTransfer(transferBody, user)],
  ['store replenishment transfer create', f => f.service.createStoreReplenishmentTransfer(transferBody, user, { storeCode: 'STORE-B', warehouseCodes: ['WH-B'] })],
  ['atomic transfer', f => f.service.confirmTransfer(transferBody, user)],
  ['transfer dispatch', f => f.service.dispatchTransfer('TR-1', user)],
  ['transfer receipt', f => f.service.receiveTransfer('TR-1', { receive_all: true }, user), { transferStatus: 'IN_TRANSIT' }],
];

// Keep a third cell even when options are absent (Jest otherwise treats it as done).
const cases = operations.map(([name, run, options]) => [name, run, options ?? {}] as const);

function scopeCalls(f: Fixture) { return f.calls.filter(([sql]) => sql.includes('FROM md_sku_org_scope')); }
function inventoryWrites(f: Fixture) { return f.committed.filter(([sql]) => /(?:INSERT INTO inv_|UPDATE inv_batches)/.test(sql)); }

// Decode actual INSERT column -> VALUES placeholder -> bound argument, not substring presence.
function insertedBatch([sql, args]: [string, any[]]): Record<string, any> {
  const insert = sql.match(/INSERT INTO inv_batches\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\)/)!;
  expect(insert).not.toBeNull();
  const columns = insert[1].split(',').map(value => value.trim());
  const values = insert[2].split(',').map(value => value.trim());
  expect(values).toHaveLength(columns.length);
  const placeholders = values.map(value => value.match(/^\$(\d+)/)).filter(Boolean);
  expect(Math.max(...placeholders.map(match => Number(match![1])))).toBe(args.length);
  return Object.fromEntries(columns.map((column, index) => {
    const value = values[index];
    const placeholder = value.match(/^\$(\d+)/);
    let bound = placeholder ? args[Number(placeholder[1]) - 1] : value === 'NULL' ? null : value;
    if (value.endsWith('::jsonb') && bound != null) bound = JSON.parse(bound);
    return [column, bound];
  }));
}
function batchRows(f: Fixture) { return f.calls.filter(([sql]) => sql.includes('INSERT INTO inv_batches')).map(insertedBatch); }

const pinkOrigin = {
  variety_code: 'EGG_PINK', source_profile_code: 'SRC-ORIGINAL-PINK',
  source_profile_snapshot: {
    version: 1, companyCode: 'COMP-A', varietyCode: 'EGG_PINK', profileCode: 'SRC-ORIGINAL-PINK',
    houses: [
      { houseCode: 'HOUSE-01', farmCode: 'FARM-ORIGIN', siteCode: 'SITE-01', flockNo: 'FLOCK-OLD-01', breedCode: 'BREED-PINK', share: 0.4 },
      { houseCode: 'HOUSE-02', farmCode: 'FARM-ORIGIN', siteCode: 'SITE-02', flockNo: 'FLOCK-OLD-02', breedCode: 'BREED-PINK', share: 0.6 },
    ],
    sourceDate: '2026-10-09', audit: { approvedBy: 'origin-user', attachments: ['a', 'b'], note: null },
  },
};
const legacyOrigin = { variety_code: null, source_profile_code: null, source_profile_snapshot: null };

describe('WMS authoritative company context (real SkuPolicy)', () => {
  it.each(cases)('%s passes locked warehouse company to every fresh variant check', async (_name, run, options) => {
    const f = fixture(options);
    await run(f);
    expect(scopeCalls(f).length).toBeGreaterThan(0);
    for (const [sql, args] of scopeCalls(f)) {
      expect(sql).toContain("scope_type = 'COMPANY'");
      expect(sql).toContain('FOR SHARE');
      expect(args[0]).toBe(SKU);
      expect(['COMP-A', 'COMP-B']).toContain(args[1]);
    }
    expect(f.calls).toContainEqual(['SELECT company_code FROM wms_warehouses WHERE warehouse_code=$1 FOR SHARE', ['WH-A']]);
    const firstScope = f.calls.findIndex(([sql]) => sql.includes('FROM md_sku_org_scope'));
    const warehouseLock = f.calls.findIndex(([sql]) => sql.includes('SELECT company_code FROM wms_warehouses'));
    expect(warehouseLock).toBeLessThan(firstScope);
  });

  it.each(cases)('%s rejects a variant with no source COMPANY scope without committing stock', async (_name, run, options) => {
    const f = fixture({ ...options, scopeA: false });
    await expect(run(f)).rejects.toThrow('不适用于公司 COMP-A');
    expect(inventoryWrites(f)).toEqual([]);
  });

  it.each(cases)('%s also provides authoritative company for managed STANDARD SKUs', async (_name, run, options) => {
    const f = fixture({ ...options, variant: false, organizationRequired: true });
    await run(f);
    expect(scopeCalls(f).length).toBeGreaterThan(0);
    const denied = fixture({ ...options, variant: false, organizationRequired: true, scopeA: false });
    await expect(run(denied)).rejects.toThrow('不适用于公司 COMP-A');
    expect(inventoryWrites(denied)).toEqual([]);
  });

  it.each(cases.filter(([name]) => /transfer/.test(name)))('%s checks BOTH companies without replacing origin SKU', async (_name, run, options) => {
    const f = fixture(options);
    await run(f);
    expect(scopeCalls(f).map(([, args]) => args)).toEqual(expect.arrayContaining([[SKU, 'COMP-A'], [SKU, 'COMP-B']]));
    const denied = fixture({ ...options, scopeB: false });
    await expect(run(denied)).rejects.toThrow('不适用于公司 COMP-B');
    expect(inventoryWrites(denied)).toEqual([]);
  });

  it.each([undefined, 'ALL', 'COMP-B'])('rejects spoofed request company %s rather than deriving SKU scope from it', async company_code => {
    const f = fixture({ scopeA: false });
    await expect(f.service.createStandaloneOutbound({ ...outboundBody, company_code }, user)).rejects.toThrow();
    expect(inventoryWrites(f)).toEqual([]);
    expect(scopeCalls(f).some(([, args]) => args[1] === 'COMP-B')).toBe(false);
  });

  it.each([null, 'ALL'])('does not invent company ownership when warehouse has %s', async company => {
    const f = fixture({ company });
    await expect(f.service.createStandaloneOutbound(outboundBody, user)).rejects.toThrow('缺少有效公司归属');
    expect(scopeCalls(f)).toEqual([]);
  });

  it('rejects inactive authoritative company and sale-disabled stock even with ACTIVE SKU parents', async () => {
    const inactive = fixture({ companyActive: false });
    await expect(inactive.service.confirmStandaloneOutbound('OUT-1', user)).rejects.toThrow('不存在或已停用');
    expect(inventoryWrites(inactive)).toEqual([]);
    const stockOnly = fixture({ saleA: false });
    await expect(stockOnly.service.confirmStandaloneOutbound('OUT-1', user)).rejects.toThrow('不适用于公司 COMP-A');
    expect(inventoryWrites(stockOnly)).toEqual([]);
  });

  it.each(cases.filter(([name]) => /confirm|shipment|transfer/.test(name) && !name.startsWith('inbound')))('%s rejects batch/warehouse company mismatch', async (_name, run, options) => {
    const f = fixture({ ...options, batchCompany: 'COMP-FOREIGN' });
    await expect(run(f)).rejects.toThrow('批次公司与仓库归属不一致');
    expect(inventoryWrites(f)).toEqual([]);
  });

  it('rejects existing inbound/receipt batch company mismatches before an upsert', async () => {
    const inbound = fixture({ batchCompany: 'COMP-FOREIGN' });
    await expect(inbound.service.confirmInbound({ task_no: 'IN-1', items: [{ sku_code: SKU, batch_no: 'B-1', actual_qty: 2 }] }, user)).rejects.toThrow('公司归属');
    expect(inventoryWrites(inbound)).toEqual([]);
    const receipt = fixture({ batchCompany: 'COMP-FOREIGN' });
    await expect(receipt.service.inboundFromReceipt(receipt.manager as any, { refNo: 'RCV-1', warehouseCode: 'WH-A', items: [{ skuCode: SKU, batchNo: 'B-1', qty: 2 }] })).rejects.toThrow('批次公司与仓库归属不一致');
    expect(receipt.calls.some(([sql]) => sql.includes('INSERT INTO inv_batches'))).toBe(false);
  });

  it.each(['normal', 'broken', 'receipt'])('a raced foreign %s batch upsert fails closed before ledger insertion', async kind => {
    const f = fixture({ rejectUpsert: true });
    const run = kind === 'receipt'
      ? f.service.inboundFromReceipt(f.manager as any, { refNo: 'RCV-1', warehouseCode: 'WH-A', items: [{ skuCode: SKU, batchNo: 'B-NEW', qty: 2 }] })
      : f.service.confirmInbound({ task_no: 'IN-1', items: [{ sku_code: SKU, batch_no: 'B-NEW', actual_qty: kind === 'normal' ? 2 : 0, broken_qty: kind === 'broken' ? 2 : 0 }] }, user);
    await expect(run).rejects.toThrow('禁止跨公司累加');
    const upsert = f.calls.find(([sql]) => sql.includes('INSERT INTO inv_batches'))!;
    expect(upsert[0]).toContain('inv_batches.company_code = EXCLUDED.company_code');
    expect(upsert[0]).toContain('inv_batches.warehouse_code IS NOT DISTINCT FROM EXCLUDED.warehouse_code');
    expect(upsert[0]).toContain('inv_batches.sku_code IS NOT DISTINCT FROM EXCLUDED.sku_code');
    expect(upsert[0]).toContain('RETURNING batch_no');
    expect(f.calls.some(([sql]) => sql.includes('INSERT INTO inv_ledger'))).toBe(false);
  });

  it('persists authoritative companies and unchanged SKU on both sides of a cross-company transfer', async () => {
    const f = fixture();
    await f.service.confirmTransfer({ ...transferBody, company_code: 'COMP-FORGED' }, user);
    const target = f.calls.find(([sql]) => sql.includes('INSERT INTO inv_batches'))!;
    expect(target[1][2]).toBe(SKU);
    expect(target[1][8]).toBe('WH-B');
    expect(target[1][12]).toBe('COMP-B');
    const ledgers = f.calls.filter(([sql]) => sql.includes('INSERT INTO inv_ledger'));
    expect(ledgers).toHaveLength(2);
    expect(ledgers[0][1][12]).toBe('COMP-A');
    expect(ledgers[1][1][12]).toBe('COMP-B');
    expect(ledgers.every(([, args]) => args[7] === SKU)).toBe(true);
  });

  it('persists warehouse ownership rather than a request default in new outbound documents', async () => {
    const f = fixture();
    await f.service.createStandaloneOutbound(outboundBody, user);
    const header = f.calls.find(([sql]) => sql.includes('INSERT INTO wms_outbound'))!;
    expect(header[1][30]).toBe('COMP-A');
    const wrong = fixture();
    await expect(wrong.service.updateStandaloneOutbound('OUT-1', { company_code: 'COMP-B' }, user)).rejects.toThrow('公司与仓库归属不一致');
    expect(wrong.committed).toEqual([]);
  });

  it('rejects unsupported custody instead of confusing batch owner with transaction company', async () => {
    const f = fixture({ batchCompany: 'COMP-ORIGIN' });
    await expect(f.service.confirmTransfer(transferBody, user)).rejects.toThrow('不支持受托代管库存');
    expect(inventoryWrites(f)).toEqual([]);
  });

  it('does not trust receive body to override the persisted source snapshot warehouse', async () => {
    const f = fixture({ transferStatus: 'IN_TRANSIT', snapshotWarehouse: 'WH-FORGED' });
    await expect(f.service.receiveTransfer('TR-1', { receive_all: true, company_code: 'COMP-A' }, user)).rejects.toThrow('源快照与源仓库不一致');
    expect(inventoryWrites(f)).toEqual([]);
  });

  it('retains legacy NULL-variety resolver without mandatory company context', async () => {
    const f = fixture({ variant: false });
    await expect((f.service as any).resolveInventoryItem(f.manager, SKU, 'SKU')).resolves.toMatchObject({ skuCode: SKU });
    expect(scopeCalls(f)).toEqual([]);
    const variant = fixture();
    await expect((variant.service as any).resolveInventoryItem(variant.manager, SKU, 'SKU')).rejects.toThrow('禁止无公司上下文');
  });

  it('completed inbound/outbound and shipment retries do not consult disabled SKU or write another ledger', async () => {
    const f = fixture({ done: true, skuActive: false, companyActive: false });
    await expect(f.service.confirmStandaloneOutbound('OUT-1', user)).resolves.toMatchObject({ idempotent: true });
    await expect(f.service.confirmBatchStandaloneOutbound({ documents: ['OUT-1'] }, user)).resolves.toMatchObject({ code: 200 });
    await expect(f.service.confirmInbound({ task_no: 'IN-1', items: [{ sku_code: SKU, actual_qty: 2 }] }, user)).resolves.toMatchObject({ idempotent: true });
    await expect(f.service.advanceOutboundOrder('SO-1', { next_status: 'SHIPPED', items: [{ sku_code: SKU, qty: 2 }] }, user)).resolves.toMatchObject({ idempotent: true });
    expect(f.calls.filter(([sql]) => sql.includes('FROM product_skus'))).toEqual([]);
    expect(inventoryWrites(f)).toEqual([]);
  });

  it.each(['received', 'DELIVERED', 'COMPLETED', 'CANCELLED'])('does not reship historical %s orders or reset them to allocate for another shipment', async orderStatus => {
    const f = fixture({ orderStatus, skuActive: false });
    for (const next_status of ['SHIPPED', 'ALLOCATED']) {
      await expect(f.service.advanceOutboundOrder('SO-1', { next_status, items: [{ sku_code: SKU, qty: 2 }] }, user)).rejects.toThrow('不得重复出库');
    }
    expect(f.calls.some(([sql]) => sql.includes('FROM product_skus'))).toBe(false);
    expect(f.committed).toEqual([]);
  });

  it('historical inventory reads remain independent of fresh SKU availability', async () => {
    const f = fixture({ skuActive: false, scopeA: false });
    await expect(f.service.getInventoryBatches()).resolves.toMatchObject({ code: 200 });
    expect(f.calls).toEqual([]);
    expect(f.em.query.mock.calls.some(([sql]) => /md_sku_org_scope|product_skus WHERE/.test(sql))).toBe(false);
  });

  it.each([
    ['VARIANT', pinkOrigin, true], ['legacy NULL', legacyOrigin, false],
  ] as const)('%s instantaneous transfer copies all origin fields while only stock owner changes', async (_label, origin, variant) => {
    const before = JSON.parse(JSON.stringify(origin));
    const f = fixture({ origin, variant, projectBatchSelect: true });
    await f.service.confirmTransfer({ ...transferBody, variety_code: 'EGG_RED', source_profile_code: 'FORGED' }, user);
    expect(batchRows(f)).toHaveLength(1);
    expect(batchRows(f)[0]).toMatchObject({ ...origin, sku_code: SKU, company_code: 'COMP-B', warehouse_code: 'WH-B', qty: 2, qty_available: 2 });
    const sourceRecord = f.calls.find(([sql]) => sql.includes('INSERT INTO wms_transfer_items'))!;
    expect(JSON.parse(sourceRecord[1][4])).toMatchObject({ ...origin, company_code: 'COMP-A', warehouse_code: 'WH-A' });
    expect(origin).toEqual(before);
    expect(f.calls.some(([sql]) => /FROM (md_egg_source_profiles|md_egg_source_profile_houses)/.test(sql))).toBe(false);
  });

  it.each([
    ['VARIANT', pinkOrigin, true], ['legacy NULL', legacyOrigin, false],
  ] as const)('%s dispatch source snapshot retains projected origin fields for later receipt', async (_label, origin, variant) => {
    const f = fixture({ origin, variant, projectBatchSelect: true });
    await f.service.dispatchTransfer('TR-1', user);
    const saved = f.calls.find(([sql]) => sql.includes('UPDATE wms_transfer_items SET source_snapshot='))!;
    expect(JSON.parse(saved[1][1])).toMatchObject({ ...origin, sku_code: SKU, company_code: 'COMP-A' });
    expect(batchRows(f)).toEqual([]);
  });

  it.each([
    ['VARIANT object/all', pinkOrigin, true, false, 2],
    ['VARIANT JSON/partial', pinkOrigin, true, true, 1],
    ['legacy NULL/all', legacyOrigin, false, false, 2],
    ['legacy NULL/partial', legacyOrigin, false, true, 1],
  ] as const)('%s receipt copies original provenance, not request or current profile', async (_label, origin, variant, stringSourceSnapshot, received) => {
    const f = fixture({ origin, variant, transferStatus: 'IN_TRANSIT', stringSourceSnapshot });
    await f.service.receiveTransfer('TR-1', {
      items: [{ batch_no: 'B-1', received_qty: received, damaged_qty: 0 }],
      variety_code: 'EGG_RED', source_profile_code: 'CURRENT-OR-FORGED', source_profile_snapshot: { houses: [] },
    }, user);
    expect(batchRows(f)).toHaveLength(1);
    expect(batchRows(f)[0]).toMatchObject({ ...origin, sku_code: SKU, company_code: 'COMP-B', warehouse_code: 'WH-B', qty: received, qty_available: received });
    if (origin.source_profile_snapshot) expect(batchRows(f)[0].source_profile_snapshot.companyCode).toBe('COMP-A');
    expect(f.calls.some(([sql]) => /FROM (md_egg_source_profiles|md_egg_source_profile_houses)/.test(sql))).toBe(false);
  });

  it('receives multiple partial batches with distinct origin JSONs without mixing their houses', async () => {
    const f = fixture({ transferStatus: 'IN_TRANSIT' });
    const blueOrigin = { ...pinkOrigin, source_profile_code: 'SRC-SECOND', source_profile_snapshot: { ...pinkOrigin.source_profile_snapshot, profileCode: 'SRC-SECOND', houses: [{ houseCode: 'HOUSE-OTHER', flockNo: 'FLOCK-OTHER' }] } };
    const realQuery = f.manager.query.getMockImplementation()!;
    f.manager.query.mockImplementation(async (sql, args) => sql.includes('FROM wms_transfer_items')
      ? [
          { id: 3, source_batch_no: 'B-1', expected_qty: 3, source_snapshot: { ...f.batch, ...pinkOrigin } },
          { id: 4, source_batch_no: 'B-2', expected_qty: 4, source_snapshot: JSON.stringify({ ...f.batch, ...blueOrigin, batch_no: 'B-2' }) },
        ] : realQuery(sql, args));
    await expect(f.service.receiveTransfer('TR-1', { items: [{ batch_no: 'B-1', received_qty: 1 }, { batch_no: 'B-2', received_qty: 2 }] }, user)).resolves.toMatchObject({ status: 'RECEIVED', received_qty: 3, difference_qty: 4 });
    const rows = batchRows(f);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ ...pinkOrigin, qty: 1, company_code: 'COMP-B' });
    expect(rows[1]).toMatchObject({ ...blueOrigin, qty: 2, company_code: 'COMP-B' });
  });

  it.each([
    ['normal', true], ['broken', true], ['receipt', true],
    ['normal', false], ['broken', false], ['receipt', false],
  ] as const)('%s first inbound variant=%s stores locked SKU variety but no invented source profile', async (kind, variant) => {
    const f = fixture({ variant });
    if (kind === 'receipt') {
      await f.service.inboundFromReceipt(f.manager as any, { refNo: 'RCV-NEW', warehouseCode: 'WH-A', items: [{ skuCode: SKU, batchNo: 'B-NEW', qty: 2 }] });
    } else {
      await f.service.confirmInbound({ task_no: 'IN-1', items: [{ sku_code: SKU, batch_no: 'B-NEW', actual_qty: kind === 'normal' ? 2 : 0, broken_qty: kind === 'broken' ? 2 : 0, variety_code: 'EGG_RED', source_profile_code: 'FORGED' }] }, user);
    }
    expect(batchRows(f)).toHaveLength(1);
    expect(batchRows(f)[0]).toMatchObject({ sku_code: SKU, variety_code: variant ? 'EGG_PINK' : null, source_profile_code: null, source_profile_snapshot: null, company_code: 'COMP-A', qty: 2 });
    const upsert = f.calls.find(([sql]) => sql.includes('INSERT INTO inv_batches'))!;
    expect(upsert[0]).toContain('inv_batches.variety_code IS NOT DISTINCT FROM EXCLUDED.variety_code');
  });

  it('first MATERIAL inbound persists NULL variety/profile regardless of request metadata', async () => {
    const f = fixture();
    const realQuery = f.manager.query.getMockImplementation()!;
    f.manager.query.mockImplementation(async (sql, args) => sql.includes('FROM mst_materials') && !sql.includes('UNION')
      ? [{ material_code: 'MAT-1', material_name: 'Material', material_type: 'FEED_RAW', unit: 'kg' }] : realQuery(sql, args));
    await f.service.confirmInbound({ task_no: 'IN-1', items: [{ material_code: 'MAT-1', item_type: 'MATERIAL', actual_qty: 2, variety_code: 'EGG_PINK' }] }, user);
    expect(batchRows(f)[0]).toMatchObject({ material_code: 'MAT-1', variety_code: null, source_profile_code: null, source_profile_snapshot: null, qty: 2 });
  });

  it('does not allow a VARIANT product-only inbound to bypass explicit SKU and organization scope', async () => {
    const f = fixture({ productOnly: true, scopeA: false });
    await expect(f.service.confirmInbound({ task_no: 'IN-1', items: [{ product_code: 'EGG', actual_qty: 2 }] }, user)).rejects.toThrow('必须明确 SKU');
    expect(batchRows(f)).toEqual([]);
    expect(f.committed).toEqual([]);
  });

  it.each(['inbound', 'receipt'])('%s refuses same-SKU accumulations with a different batch variety', async kind => {
    const f = fixture({ origin: { ...legacyOrigin, variety_code: 'EGG_RED' } });
    if (kind === 'inbound') await expect(f.service.confirmInbound({ task_no: 'IN-1', items: [{ sku_code: SKU, batch_no: 'B-1', actual_qty: 2 }] }, user)).rejects.toThrow('variety_code');
    else await expect(f.service.inboundFromReceipt(f.manager as any, { refNo: 'RCV-1', warehouseCode: 'WH-A', items: [{ skuCode: SKU, batchNo: 'B-1', qty: 2 }] })).rejects.toThrow('批次身份');
    expect(batchRows(f)).toEqual([]);
  });

  it.each(['inbound', 'receipt'])('%s cannot mix unknown external stock into a batch with an existing farm origin snapshot', async kind => {
    const f = fixture({ origin: pinkOrigin });
    if (kind === 'inbound') await expect(f.service.confirmInbound({ task_no: 'IN-1', items: [{ sku_code: SKU, batch_no: 'B-1', actual_qty: 2 }] }, user)).rejects.toThrow('source_profile_code');
    else await expect(f.service.inboundFromReceipt(f.manager as any, { refNo: 'RCV-1', warehouseCode: 'WH-A', items: [{ skuCode: SKU, batchNo: 'B-1', qty: 2 }] })).rejects.toThrow('批次身份');
    expect(batchRows(f)).toEqual([]);
  });

  it.each(cases.filter(([name]) => /outbound|shipment/.test(name)))('%s SALE requires sale permission, not merely stock permission, for VARIANT and managed STANDARD', async (_name, run, options) => {
    for (const identity of [{ variant: true }, { variant: false, organizationRequired: true }]) {
      const stockOnly = fixture({ ...options, ...identity, saleA: false, saleB: false });
      await expect(run(stockOnly)).rejects.toThrow('不适用于公司 COMP-A');
      expect(stockOnly.committed).toEqual([]);
      expect(stockOnly.calls.some(([sql]) => sql.includes('INSERT INTO inv_ledger'))).toBe(false);
      const saleEnabled = fixture({ ...options, ...identity, saleA: true, saleB: true });
      await expect(run(saleEnabled)).resolves.toBeDefined();
      expect(scopeCalls(saleEnabled).length).toBeGreaterThan(0);
    }
  });

  it.each(cases.filter(([name]) => !/outbound|shipment/.test(name)))('%s remains stock-only even when company/grade cannot sell', async (_name, run, options) => {
    for (const identity of [{ variant: true }, { variant: false, organizationRequired: true }]) {
      const f = fixture({ ...options, ...identity, saleA: false, saleB: false, gradeSaleable: false });
      await expect(run(f)).resolves.toBeDefined();
      expect(scopeCalls(f).length).toBeGreaterThan(0);
    }
  });

  it.each(cases.filter(([name]) => /outbound|shipment/.test(name)))('%s SALE still rejects an unsaleable grade on a legacy no-scope SKU', async (_name, run, options) => {
    const f = fixture({ ...options, variant: false, organizationRequired: false, gradeSaleable: false, scopeA: false });
    await expect(run(f)).rejects.toThrow('等级不可销售');
    expect(scopeCalls(f)).toEqual([]);
    expect(f.committed).toEqual([]);
  });

  it('legacy no-scope SKUs retain their existing sales interface when the grade is saleable', async () => {
    const f = fixture({ variant: false, organizationRequired: false, scopeA: false, saleA: false });
    await expect(f.service.createStandaloneOutbound(outboundBody, user)).resolves.toMatchObject({ code: 200 });
    expect(scopeCalls(f)).toEqual([]);
  });

  it.each([false, true])('direct batch deduction quantitySnapshot=%s enforces SALE scope too', async quantity => {
    for (const identity of [{ variant: true }, { variant: false, organizationRequired: true }]) {
      const denied = fixture({ ...identity, saleA: false, quantity });
      const order = { type: 'SALE', company_code: 'COMP-A', quantity_snapshot: quantity ? snapshot : null };
      await expect((denied.service as any).deductOutboundBatch(denied.manager, denied.batch, 2, 'DIRECT-1', order, user, 'DONE')).rejects.toThrow('不适用于公司 COMP-A');
      expect(denied.calls.some(([sql]) => /UPDATE inv_batches|INSERT INTO inv_ledger/.test(sql))).toBe(false);
      const allowed = fixture({ ...identity, saleA: true, quantity });
      await expect((allowed.service as any).deductOutboundBatch(allowed.manager, allowed.batch, 2, 'DIRECT-1', order, user, 'DONE')).resolves.toBeUndefined();
      expect(allowed.calls.some(([sql]) => sql.includes('INSERT INTO inv_ledger'))).toBe(true);
    }
  });

  it.each([false, true])('non-sales SCRAP creation/edit/confirmation stays stock-only, quantitySnapshot=%s', async quantity => {
    for (const identity of [{ variant: true }, { variant: false, organizationRequired: true }]) {
      const settings = { ...identity, saleA: false, saleB: false, gradeSaleable: false, outboundType: 'SCRAP' as const, quantity };
      const body = { ...outboundBody, type: 'SCRAP', destination_type: 'OTHER', destination_code: 'DISPOSAL' };
      const created = fixture(settings);
      await expect(created.service.createStandaloneOutbound(body, user)).resolves.toMatchObject({ code: 200 });
      const batchCreated = fixture(settings);
      await expect(batchCreated.service.createBatchStandaloneOutbound({ documents: [{ ...body, items: [{ sku_code: SKU, qty: 2 }] }] }, user)).resolves.toMatchObject({ code: 200 });
      const edited = fixture(settings);
      await expect(edited.service.updateStandaloneOutbound('OUT-1', { remark: 'non-sales edit' }, user)).resolves.toMatchObject({ code: 200 });
      const confirmed = fixture(settings);
      await expect(confirmed.service.confirmStandaloneOutbound('OUT-1', user)).resolves.toMatchObject({ code: 200 });
      const batchConfirmed = fixture(settings);
      await expect(batchConfirmed.service.confirmBatchStandaloneOutbound({ documents: ['OUT-1'] }, user)).resolves.toMatchObject({ code: 200 });
    }
  });

  it('retains warehouse scope and outbound menu authorization before variant checks', async () => {
    const denied = fixture({ warehouseScope: ['WH-B'] });
    await expect(denied.service.createStandaloneOutbound(outboundBody, user)).rejects.toThrow('仓库范围不匹配');
    expect(denied.calls).toEqual([]);
    const unprivileged = fixture();
    await expect(unprivileged.service.createStandaloneOutbound(outboundBody, { username: 'viewer', roles: [], permissions: [] })).rejects.toThrow('MENU_WMS_INOUT:C');
    expect(unprivileged.calls).toEqual([]);
  });
});
