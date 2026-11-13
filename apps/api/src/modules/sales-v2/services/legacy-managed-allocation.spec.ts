import { EggInventoryService } from './egg-inventory.service';
import { QuantitySnapshot } from '../../product-master/services/quantity-contract';

type Stock = {
  batch_no: string; sku_code: string | null; product_code: string;
  company_code: string; warehouse_code: string; qty: number; qty_available: number;
  status: string; expire_date: string | null; created_at: string; legacy_source: string | null;
  quality_grade: string; grade_code_std: string; unit: string; material_code: null; base_quantity_version: number;
};
type Allocation = {
  id: string; sales_order_item_id: string; batch_no: string;
  reserved_qty: number; outbound_qty: number; released_qty: number;
};
const stock = (batch_no: string, sku_code: string | null, patch: Partial<Stock> = {}): Stock => ({
  batch_no, sku_code, product_code: 'PRD-EGG-X', company_code: 'C', warehouse_code: 'W',
  qty: 10, qty_available: 10, status: 'AVAILABLE', expire_date: '2099-01-01', created_at: batch_no,
  legacy_source: null, quality_grade: 'G', grade_code_std: 'G', unit: '枚', material_code: null, base_quantity_version: 1,
  ...patch,
});

/** Stateful SQL double: executes emitted WHERE predicates, guarded mutations and rollback.
 * No SkuPolicy/service mock: missing mappings, managed identities and saved pools use real policy code.
 */
class AllocationSqlFixture {
  batches: Stock[] = [];
  allocations: Allocation[] = [];
  items: any[] = [];
  ledger: unknown[][] = [];
  actions: unknown[][] = [];
  selected: string[][] = [];
  writes = 0;
  rollbacks = 0;
  failLedgerAt = 0;
  failSkuRead: Error | undefined;
  reclassifyAfterSelection: string | undefined;
  readonly saleGrades = new Map([
    ['G', true], ['DIRTY', false], ['CRACKED', false], ['BROKEN', false], ['DAMAGED', false],
  ]);
  readonly skus = new Map([
    ['OLD', { sku_code: 'OLD', product_code: 'PRD-EGG-X', grade_code: 'G', spec_code: 'S', status: 'ACTIVE', variety_code: null, org_context_required: false }],
    ['STD0', { sku_code: 'STD0', product_code: 'PRD-EGG-X', grade_code: 'G', spec_code: 'S', status: 'ACTIVE', variety_code: null, org_context_required: true }],
    ['VAR', { sku_code: 'VAR', product_code: 'PRD-EGG-X', grade_code: 'G', spec_code: 'S', status: 'ACTIVE', variety_code: 'V', org_context_required: false }],
  ]);
  readonly manager = { query: jest.fn((sql: string, args: unknown[] = []) => this.execute(sql, args)) };
  readonly ds = {
    query: jest.fn(() => { throw new Error('allocation escaped the transaction manager'); }),
    transaction: async <T>(run: (manager: any) => Promise<T>): Promise<T> => {
      const before = JSON.parse(JSON.stringify({ batches: this.batches, allocations: this.allocations, items: this.items, ledger: this.ledger, actions: this.actions }));
      try { return await run(this.manager); }
      catch (error) {
        Object.assign(this, before);
        this.rollbacks++;
        throw error;
      }
    },
  };
  readonly service = new EggInventoryService(this.ds as never, { get: jest.fn() } as never);

  private async execute(sql: string, args: unknown[]): Promise<any[]> {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.includes('pg_advisory_xact_lock')) return [];
    if (/^SELECT .* FROM product_skus WHERE sku_code=\$1 FOR SHARE$/.test(s)) {
      if (this.failSkuRead) throw this.failSkuRead;
      const sku = this.skus.get(String(args[0]));
      return sku ? [{ ...sku, today: '2026-11-11', effective_date: null, expire_date: null }] : [];
    }
    if (/^SELECT \* FROM (mst_products|product_grades|packaging_specs) /.test(s)) {
      return [{ status: 'ACTIVE', variety_code: null, is_saleable: true, is_storable: true, base_unit: '枚' }];
    }
    if (s.startsWith('SELECT * FROM inv_batches WHERE ')) {
      if (!s.endsWith('FOR UPDATE')) throw new Error('candidate rows must be locked');
      let rows = this.batches.filter(b => b.status === 'AVAILABLE' && b.qty_available > 0
        && (!b.expire_date || b.expire_date >= '2026-11-11') && b.legacy_source == null);
      rows = rows.filter(b => this.saleGrades.get(b.quality_grade || b.grade_code_std) !== false);
      const grade = s.match(/COALESCE\(quality_grade, grade_code_std\)\s*=\s*\$(\d+)/);
      if (grade) rows = rows.filter(b => (b.quality_grade || b.grade_code_std) === args[Number(grade[1]) - 1]);
      for (const column of ['company_code', 'product_code', 'sku_code', 'quality_grade', 'warehouse_code', 'grade_code_std', 'unit'] as const) {
        const match = s.match(new RegExp(`(?:WHERE |AND )${column}\\s*=\\s*\\$(\\d+)`));
        if (match) rows = rows.filter(b => b[column] === args[Number(match[1]) - 1]);
      }
      if (s.includes('warehouse_code=ANY($5::varchar[])')) rows = rows.filter(b => (args[4] as string[]).includes(b.warehouse_code));
      if (s.includes('base_quantity_version=1')) rows = rows.filter(b => b.base_quantity_version === 1 && b.material_code == null);
      // Interpret the correlated legacy selection predicate, rather than asserting SQL substrings.
      if (s.includes('legacy_sku.variety_code IS NULL') && s.includes('legacy_sku.org_context_required=false')) {
        rows = rows.filter(b => b.sku_code == null || (this.skus.has(b.sku_code)
          && this.skus.get(b.sku_code)!.variety_code == null && this.skus.get(b.sku_code)!.org_context_required === false));
      }
      rows.sort((a, b) => (a.expire_date ?? '9999').localeCompare(b.expire_date ?? '9999') || a.created_at.localeCompare(b.created_at));
      this.selected.push(rows.map(b => b.batch_no));
      if (this.reclassifyAfterSelection) this.skus.get(this.reclassifyAfterSelection)!.org_context_required = true;
      return rows.map(b => ({ ...b }));
    }
    if (s === 'SELECT * FROM sal_order_items WHERE sales_order_id = $1') return this.items.map(i => ({ ...i }));
    if (s.includes('FROM sal_order_item_batch_allocations a')) {
      const forItem = s.includes('WHERE a.sales_order_item_id=$1');
      return this.allocations.filter(a => forItem ? a.sales_order_item_id === args[0]
        : this.items.some(i => i.id === a.sales_order_item_id && i.sales_order_id === args[0]))
        .flatMap(a => {
          const b = this.batches.find(row => row.batch_no === a.batch_no);
          const item = this.items.find(i => i.id === a.sales_order_item_id);
          return b ? [{ ...b, ...a, sale_sku_code: item?.sku_code, quantity_snapshot: item?.quantity_snapshot }] : [];
        });
    }
    if (s.startsWith('WITH changed AS ( UPDATE inv_batches')) {
      const [qty, batchNo, company, warehouse] = args as [number, string, string, string];
      const b = this.batches.find(row => row.batch_no === batchNo && row.company_code === company && row.warehouse_code === warehouse
        && row.status === 'AVAILABLE' && (!row.expire_date || row.expire_date >= '2026-11-11')
        && (!s.includes('legacy_source IS NULL') || row.legacy_source == null));
      if (!b) return [];
      if (s.includes('SET qty_available = qty_available - $1')) {
        if (b.qty_available < qty) return [];
        b.qty_available -= qty;
      } else if (s.includes('SET qty = qty - $1')) {
        if (b.qty < qty) return [];
        b.qty -= qty;
      } else throw new Error(`unsupported inventory update: ${s}`);
      this.writes++;
      return [{ batch_no: batchNo }];
    }
    if (s.startsWith('INSERT INTO inv_ledger')) {
      if (this.failLedgerAt && this.ledger.length + 1 === this.failLedgerAt) throw new Error('injected ledger failure');
      this.ledger.push(args);
      return [{ id: String(this.ledger.length) }];
    }
    if (s.startsWith('INSERT INTO sal_order_item_batch_allocations')) {
      this.allocations.push({ id: String(this.allocations.length + 1), sales_order_item_id: String(args[0]), batch_no: String(args[1]), reserved_qty: Number(args[2]), outbound_qty: 0, released_qty: 0 });
      return [];
    }
    if (s.startsWith('UPDATE sal_order_items SET allocated_batch_no=')) {
      Object.assign(this.items.find(i => i.id === args[2]), { allocated_batch_no: args[0], allocated_qty: args[1] });
      return [];
    }
    if (s.startsWith('INSERT INTO sal_order_item_batch_allocation_actions')) { this.actions.push(args); return []; }
    if (s.startsWith('WITH changed AS ( UPDATE sal_order_item_batch_allocations')) {
      const a = this.allocations.find(row => row.id === args[1]);
      if (!a || a.outbound_qty + a.released_qty + Number(args[0]) > a.reserved_qty) return [];
      a.outbound_qty += Number(args[0]);
      return [{ id: a.id }];
    }
    throw new Error(`Unhandled fixture SQL: ${s}`);
  }

  allocate(patch: Record<string, unknown> = {}) {
    return this.service.allocateByFIFO({ productCode: 'PRD-EGG-X', companyCode: 'C', qty: 5, refNo: 'SO', note: 'fixture', fulfillmentWarehouseCode: 'W', ...patch });
  }
  savedAllocation(sku: string | null) {
    this.batches = [stock('SAVED', sku, { qty_available: 5 })];
    this.items = [{ id: 'I', sales_order_id: 'O', product_code: 'PRD-EGG-X', sku_code: null, qty: 5 }];
    this.allocations = [{ id: 'A', sales_order_item_id: 'I', batch_no: 'SAVED', reserved_qty: 5, outbound_qty: 0, released_qty: 0 }];
  }
}

const snapshot: QuantitySnapshot = { version: 1, basis: 'BASE', skuCode: 'OLD', productCode: 'PRD-EGG-X', gradeCode: 'G', specCode: 'S', baseUnit: '枚', tradeUnit: '枚', factor: 1, baseQty: 5 };

describe('legacy sales managed-stock allocation gate (behavioral SQL fixture)', () => {
  it.each(['EGG', 'PRD-EGG-X'])('allocates only old ordinary SKU and SKU-less stock for product %s', async productCode => {
    const f = new AllocationSqlFixture();
    f.batches = [stock('01-VAR', 'VAR', { product_code: productCode }), stock('02-STD0', 'STD0', { product_code: productCode }),
      stock('03-UNKNOWN', 'MASKED', { product_code: productCode }), stock('04-OLD', 'OLD', { product_code: productCode, qty_available: 3 }),
      stock('05-NO-SKU', null, { product_code: productCode, qty_available: 3 })];
    const result = await f.allocate({ productCode });
    expect(result.map(a => [a.batchNo, a.allocatedQty])).toEqual([['04-OLD', 3], ['05-NO-SKU', 2]]);
    expect(f.selected).toEqual([['04-OLD', '05-NO-SKU']]);
    expect(f.batches.map(b => b.qty_available)).toEqual([10, 10, 10, 0, 1]);
    expect(f.ledger.map(row => row[0])).toEqual(['04-OLD', '05-NO-SKU']);
    expect(f.ds.query).not.toHaveBeenCalled();
  });

  it.each(['VAR', 'STD0'])('rejects explicit managed SKU %s without adapting company context', async skuCode => {
    const f = new AllocationSqlFixture();
    f.batches = [stock('NEW', skuCode), stock('OLD', 'OLD')];
    await expect(f.allocate({ skuCode })).rejects.toThrow('公司上下文');
    expect(f.writes).toBe(0);
    expect(f.ledger).toEqual([]);
    expect(f.selected).toEqual([]);
    expect(f.rollbacks).toBe(1);
  });

  it('still permits an explicit ordinary legacy SKU', async () => {
    const f = new AllocationSqlFixture();
    f.batches = [stock('OLD', 'OLD'), stock('NONE', null)];
    await expect(f.allocate({ skuCode: 'OLD' })).resolves.toMatchObject([{ batchNo: 'OLD', allocatedQty: 5 }]);
    expect(f.selected).toEqual([['OLD']]);
  });

  it.each(['MASKED', '', ' OLD ', null])('does not fall back from explicit invalid or masked SKU %p', async skuCode => {
    const f = new AllocationSqlFixture();
    f.batches = [stock('OLD', 'OLD'), stock('NONE', null)];
    await expect(f.allocate({ skuCode })).rejects.toThrow();
    expect(f.selected).toEqual([]);
    expect(f.writes).toBe(0);
  });

  it('does not reserve a partial quantity when unmanaged stock is insufficient', async () => {
    const f = new AllocationSqlFixture();
    f.batches = [stock('NEW', 'STD0'), stock('VAR', 'VAR'), stock('MASKED', 'MASKED'), stock('OLD', 'OLD', { qty_available: 2 })];
    await expect(f.allocate()).rejects.toThrow('需求量=5 该公司可分配量=2');
    expect(f.writes).toBe(0);
    expect(f.ledger).toEqual([]);
    expect(f.batches.map(b => b.qty_available)).toEqual([10, 10, 10, 2]);
    expect(f.rollbacks).toBe(1);
  });

  it('preserves company, warehouse, expiry, status, legacy source, grade and FIFO restrictions', async () => {
    const f = new AllocationSqlFixture();
    f.batches = [stock('WRONG-COMPANY', null, { company_code: 'OTHER' }), stock('WRONG-WH', null, { warehouse_code: 'OTHER' }),
      stock('EXPIRED', null, { expire_date: '2020-01-01' }), stock('FROZEN', null, { status: 'FROZEN' }),
      stock('LEGACY-SOURCE', null, { legacy_source: 'OLD' }), stock('WRONG-GRADE', null, { quality_grade: 'OTHER' }),
      stock('LATER', 'OLD', { expire_date: null }), stock('FIRST', null, { expire_date: '2090-01-01', qty_available: 3 })];
    expect((await f.allocate({ gradeCode: 'G' })).map(a => [a.batchNo, a.allocatedQty])).toEqual([['FIRST', 3], ['LATER', 2]]);
    expect(f.selected).toEqual([['FIRST', 'LATER']]);
  });

  it.each(['DIRTY', 'CRACKED', 'BROKEN', 'DAMAGED'])('rejects defect grade %s from sales reservation', async grade => {
    const f = new AllocationSqlFixture();
    f.batches = [stock(`DEFECT-${grade}`, null, { quality_grade: grade, grade_code_std: grade, qty_available: 5 })];
    await expect(f.allocate({ gradeCode: grade, qty: 1 })).rejects.toThrow('需求量=1 该公司可分配量=0');
    expect(f.writes).toBe(0);
    expect(f.ledger).toEqual([]);
  });

  it('falls back to grade_code_std when quality_grade is null', async () => {
    const f = new AllocationSqlFixture();
    f.batches = [stock('STD-FALLBACK', null, { quality_grade: null as any, grade_code_std: 'G', qty_available: 2 })];
    await expect(f.allocate({ gradeCode: 'G', qty: 1 })).resolves.toHaveLength(1);
  });

  it('filters managed and unknown physical SKUs from the shared quantity pool too', async () => {
    const f = new AllocationSqlFixture();
    f.batches = [stock('VAR', 'VAR'), stock('STD0', 'STD0'), stock('UNKNOWN', 'MASKED'), stock('OLD', 'OLD', { qty_available: 3 }), stock('NONE', null)];
    const result = await f.allocate({ skuCode: 'OLD', quantitySnapshot: snapshot });
    expect(result.map(a => [a.batchNo, a.allocatedQty])).toEqual([['NONE', 5]]);
    expect(f.batches.filter(b => ['VAR', 'STD0', 'UNKNOWN'].includes(b.batch_no)).map(b => b.qty_available)).toEqual([10, 10, 10]);
    const skuReads = f.manager.query.mock.calls.filter(([sql]) => sql.includes('FROM product_skus'));
    expect(skuReads.every(([sql]) => sql.includes('FOR SHARE'))).toBe(true);
    expect(f.ds.query).not.toHaveBeenCalled();
  });

  it.each(['VAR', 'STD0'])('cannot hide managed selected SKU %s inside a quantity snapshot', async skuCode => {
    const f = new AllocationSqlFixture();
    f.batches = [stock('OLD', 'OLD')];
    await expect(f.allocate({ quantitySnapshot: { ...snapshot, skuCode } })).rejects.toThrow('公司上下文');
    expect(f.writes).toBe(0);
  });

  it('rechecks the SKU under a manager lock after the SQL candidate selection', async () => {
    const f = new AllocationSqlFixture();
    f.batches = [stock('OLD', 'OLD')];
    f.reclassifyAfterSelection = 'OLD';
    await expect(f.allocate()).rejects.toThrow('需求量=5 该公司可分配量=0');
    expect(f.selected).toEqual([['OLD']]); // Initially eligible SQL result; no stale eligibility may be consumed.
    expect(f.writes).toBe(0);
    expect(f.ledger).toEqual([]);
  });

  it('propagates SKU SQL/permission errors without reserving or treating failed reads as legacy', async () => {
    const f = new AllocationSqlFixture();
    f.batches = [stock('OLD', 'OLD'), stock('NONE', null)];
    f.failSkuRead = new Error('permission denied for table product_skus');
    await expect(f.allocate()).rejects.toBe(f.failSkuRead);
    expect(f.writes).toBe(0);
    expect(f.ledger).toEqual([]);
  });

  it('rolls back batch and ledger writes if a later ledger insert fails', async () => {
    const f = new AllocationSqlFixture();
    f.batches = [stock('01', 'OLD', { qty_available: 3 }), stock('02', null, { qty_available: 3 })];
    f.failLedgerAt = 2;
    await expect(f.allocate()).rejects.toThrow('injected ledger failure');
    expect(f.writes).toBe(2); // The failure really occurred after mutations, not at selection.
    expect(f.batches.map(b => b.qty_available)).toEqual([3, 3]);
    expect(f.ledger).toEqual([]);
    expect(f.rollbacks).toBe(1);
  });

  it.each(['VAR', 'STD0', 'MASKED'])('rejects manually selected %s stock during existing reservation and outbound', async skuCode => {
    const f = new AllocationSqlFixture();
    f.savedAllocation(skuCode);
    await expect(f.service.reserveInventory('O', 'SO', 'C')).rejects.toThrow('旧销售预留禁止');
    await expect(f.service.confirmOutbound('O', 'SO', 'C', 'D', 'D1', 5)).rejects.toThrow('旧销售出库禁止');
    expect(f.writes).toBe(0);
    expect(f.batches[0].qty).toBe(10);
    expect(f.ledger).toEqual([]);
    expect(f.actions).toEqual([]);
  });

  it.each(['OLD', null])('retains existing reservation/outbound for ordinary stock %p', async skuCode => {
    const f = new AllocationSqlFixture();
    f.savedAllocation(skuCode);
    await expect(f.service.reserveInventory('O', 'SO', 'C')).resolves.toBe(false);
    await expect(f.service.confirmOutbound('O', 'SO', 'C', 'D', 'D1', 5)).resolves.toBe(5);
    expect(f.batches[0].qty).toBe(5);
    expect(f.allocations[0].outbound_qty).toBe(5);
  });

  it.each(['VAR', 'STD0', 'MASKED'])('does not trust saved explicit SKU %s even when its selected batch is ordinary', async skuCode => {
    const f = new AllocationSqlFixture();
    f.savedAllocation('OLD');
    f.items[0].sku_code = skuCode;
    await expect(f.service.reserveInventory('O', 'SO', 'C')).rejects.toThrow();
    await expect(f.service.confirmOutbound('O', 'SO', 'C', 'D', 'D1', 5)).rejects.toThrow('旧销售出库禁止');
    expect(f.writes).toBe(0);
    expect(f.ledger).toEqual([]);
  });

  it('rejects a short shared pool without touching managed, unknown or partial ordinary stock', async () => {
    const f = new AllocationSqlFixture();
    f.batches = [stock('VAR', 'VAR'), stock('STD0', 'STD0'), stock('UNKNOWN', 'MASKED'), stock('OLD', 'OLD', { qty_available: 2 })];
    await expect(f.allocate({ skuCode: 'OLD', quantitySnapshot: snapshot })).rejects.toThrow('需求量=5 该公司可分配量=2');
    expect(f.writes).toBe(0);
    expect(f.ledger).toEqual([]);
  });

  it('does not persist order reservations when a later order item is short', async () => {
    const f = new AllocationSqlFixture();
    f.batches = [stock('OLD', 'OLD', { qty_available: 5 })];
    f.items = [{ id: 'I1', sales_order_id: 'O', product_code: 'PRD-EGG-X', qty: 3 },
      { id: 'I2', sales_order_id: 'O', product_code: 'PRD-EGG-X', qty: 3 }];
    await expect(f.service.reserveInventory('O', 'SO', 'C')).rejects.toThrow('库存不足');
    expect(f.writes).toBe(1);
    expect(f.batches[0].qty_available).toBe(5);
    expect(f.allocations).toEqual([]);
    expect(f.ledger).toEqual([]);
    expect(f.items.every(i => i.allocated_batch_no === undefined)).toBe(true);
  });
});
