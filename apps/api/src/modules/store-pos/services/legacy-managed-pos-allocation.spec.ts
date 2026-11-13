import { StorePosService } from './store-pos.service';
import { QuantitySnapshot } from '../../product-master/services/quantity-contract';

type PosStock = {
  batch_no: string; sku_code: string | null; product_code: string; quality_grade: string; grade_code_std: string;
  company_code: string; warehouse_code: string; qty: number; qty_available: number; status: string;
  expire_date: string | null; created_at: string; legacy_source: string | null; unit: string; material_code: null; base_quantity_version: number;
};
const stock = (batch_no: string, sku_code: string | null, patch: Partial<PosStock> = {}): PosStock => ({
  batch_no, sku_code, product_code: 'PRD-EGG-X', quality_grade: 'G', grade_code_std: 'G', company_code: 'C', warehouse_code: 'W',
  qty: 10, qty_available: 10, status: 'AVAILABLE', expire_date: '2099-01-01', created_at: batch_no, legacy_source: null,
  unit: '枚', material_code: null, base_quantity_version: 1, ...patch,
});
const snapshot: QuantitySnapshot = { version: 1, basis: 'BASE', skuCode: 'OLD', productCode: 'PRD-EGG-X', gradeCode: 'G', specCode: 'S', baseUnit: '枚', tradeUnit: '枚', factor: 1, baseQty: 5 };

/** Stateful SQL double executes selection, guarded deduction, allocation, ledger and transaction rollback. */
class PosSqlFixture {
  batches: PosStock[] = [];
  allocations: unknown[][] = [];
  ledger: unknown[][] = [];
  selected: string[][] = [];
  rollbacks = 0;
  writes = 0;
  failLedgerAt = 0;
  failSkuRead: Error | undefined;
  readonly saleGrades = new Map([
    ['G', true], ['DIRTY', false], ['CRACKED', false], ['BROKEN', false], ['DAMAGED', false],
  ]);
  readonly skus = new Map([
    ['OLD', { sku_code: 'OLD', product_code: 'PRD-EGG-X', grade_code: 'G', spec_code: 'S', status: 'ACTIVE', variety_code: null, org_context_required: false }],
    ['STD0', { sku_code: 'STD0', product_code: 'PRD-EGG-X', grade_code: 'G', spec_code: 'S', status: 'ACTIVE', variety_code: null, org_context_required: true }],
    ['VAR', { sku_code: 'VAR', product_code: 'PRD-EGG-X', grade_code: 'G', spec_code: 'S', status: 'ACTIVE', variety_code: 'V', org_context_required: false }],
  ]);
  readonly service = Object.create(StorePosService.prototype) as any;
  readonly manager = { query: jest.fn((sql: string, args: unknown[] = []) => this.execute(sql, args)) };

  constructor() {
    this.service.cls = { get: () => ({ username: 'fixture' }) };
    this.service.ds = { query: () => { throw new Error('POS escaped transaction manager'); } };
  }

  private async execute(sql: string, args: unknown[]): Promise<any[]> {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.includes('pg_advisory_xact_lock')) return [];
    if (/^SELECT .* FROM product_skus WHERE sku_code=\$1 FOR SHARE$/.test(s)) {
      if (this.failSkuRead) throw this.failSkuRead;
      const sku = this.skus.get(String(args[0]));
      return sku ? [{ ...sku, today: '2026-11-11', effective_date: null, expire_date: null }] : [];
    }
    if (/^SELECT \* FROM (mst_products|product_grades|packaging_specs) /.test(s)) {
      const grade = String(args[0] ?? '');
      const saleable = !s.includes('product_grades') || this.saleGrades.get(grade) !== false;
      return [{ status: 'ACTIVE', variety_code: null, is_saleable: saleable, sale_enabled: saleable, is_storable: true, stock_managed: true, base_unit: '枚' }];
    }
    if (s.startsWith('SELECT ') && s.includes(' FROM inv_batches WHERE ')) {
      if (!s.endsWith('FOR UPDATE')) throw new Error('FIFO candidates must be locked');
      let rows = this.batches.filter(b => b.status === 'AVAILABLE' && b.qty_available > 0
        && (!b.expire_date || b.expire_date >= '2026-11-11') && b.legacy_source == null);
      rows = rows.filter(b => this.saleGrades.get(b.quality_grade || b.grade_code_std) !== false);
      const grade = s.match(/COALESCE\(quality_grade, grade_code_std\)\s*=\s*\$(\d+)/);
      if (grade) rows = rows.filter(b => (b.quality_grade || b.grade_code_std) === args[Number(grade[1]) - 1]);
      for (const column of ['company_code', 'product_code', 'sku_code', 'quality_grade', 'grade_code_std', 'unit'] as const) {
        const match = s.match(new RegExp(`(?:WHERE |AND )${column}\\s*=\\s*\\$(\\d+)`));
        if (match) rows = rows.filter(b => b[column] === args[Number(match[1]) - 1]);
      }
      const wh = s.match(/warehouse_code\s*=\s*ANY\(\$(\d+)::varchar\[\]\)/);
      if (wh) rows = rows.filter(b => (args[Number(wh[1]) - 1] as string[]).includes(b.warehouse_code));
      if (s.includes('base_quantity_version=1')) rows = rows.filter(b => b.base_quantity_version === 1 && b.material_code == null);
      rows.sort((a, b) => (a.expire_date ?? '9999').localeCompare(b.expire_date ?? '9999') || a.created_at.localeCompare(b.created_at));
      this.selected.push(rows.map(b => b.batch_no));
      return rows.map(b => ({ ...b }));
    }
    if (s.startsWith('WITH changed AS ( UPDATE inv_batches')) {
      const [qty, batchNo, warehouse, company] = args as [number, string, string, string];
      const b = this.batches.find(row => row.batch_no === batchNo && row.warehouse_code === warehouse && row.company_code === company
        && row.qty >= qty && row.qty_available >= qty && row.status === 'AVAILABLE' && row.legacy_source == null
        && (!row.expire_date || row.expire_date >= '2026-11-11'));
      if (!b) return [];
      b.qty -= qty;
      b.qty_available -= qty;
      this.writes++;
      return [{ batch_no: b.batch_no }];
    }
    if (s.startsWith('INSERT INTO store_sale_allocations')) { this.allocations.push(args); return []; }
    if (s.startsWith('INSERT INTO inv_ledger')) {
      if (this.failLedgerAt && this.ledger.length + 1 === this.failLedgerAt) throw new Error('injected POS ledger failure');
      this.ledger.push(args);
      return [];
    }
    throw new Error(`Unhandled fixture SQL: ${s}`);
  }

  async settle(items: any[] = [{ id: 1, product_code: 'PRD-EGG-X', qty: 5 }]) {
    const before = JSON.parse(JSON.stringify({ batches: this.batches, allocations: this.allocations, ledger: this.ledger }));
    try {
      return await this.service.fifoDeductItems({ id: 1, sale_no: 'POS', store_code: 'STORE', company_code: 'C', warehouseCodes: ['W'], items }, this.manager);
    } catch (error) {
      Object.assign(this, before);
      this.rollbacks++;
      throw error;
    }
  }
}

describe('legacy POS managed-stock gate (behavioral SQL fixture)', () => {
  it.each(['EGG', 'PRD-EGG-X'])('does not consume managed or unknown SKU stock through product %s', async productCode => {
    const f = new PosSqlFixture();
    f.batches = [stock('01-VAR', 'VAR', { product_code: productCode }), stock('02-STD0', 'STD0', { product_code: productCode }),
      stock('03-MASKED', 'MASKED', { product_code: productCode }), stock('04-OLD', 'OLD', { product_code: productCode, qty_available: 3 }),
      stock('05-NONE', null, { product_code: productCode, qty_available: 3 })];
    const result = await f.settle([{ id: 1, product_code: productCode, qty: 5 }]);
    expect(result.map((a: any) => [a.batchNo, a.qty])).toEqual([['04-OLD', 3], ['05-NONE', 2]]);
    expect(f.batches.map(b => b.qty_available)).toEqual([10, 10, 10, 0, 1]);
    expect(f.batches.map(b => b.qty)).toEqual([10, 10, 10, 7, 8]);
    expect(f.allocations.map(a => a[2])).toEqual(['04-OLD', '05-NONE']);
    expect(f.ledger.map(a => a[0])).toEqual(['04-OLD', '05-NONE']);
  });

  it.each(['VAR', 'STD0'])('rejects explicit managed SKU %s despite the sale company field', async skuCode => {
    const f = new PosSqlFixture();
    f.batches = [stock('NEW', skuCode), stock('OLD', 'OLD')];
    await expect(f.settle([{ id: 1, product_code: 'PRD-EGG-X', sku_code: skuCode, qty: 5 }])).rejects.toThrow('公司上下文');
    expect(f.selected).toEqual([]);
    expect(f.writes).toBe(0);
  });

  it.each(['MASKED', '', ' OLD '])('does not fall back from explicit invalid SKU %p', async skuCode => {
    const f = new PosSqlFixture();
    f.batches = [stock('OLD', 'OLD'), stock('NONE', null)];
    await expect(f.settle([{ id: 1, product_code: 'PRD-EGG-X', sku_code: skuCode, qty: 5 }])).rejects.toThrow();
    expect(f.selected).toEqual([]);
    expect(f.writes).toBe(0);
  });

  it('still permits explicit ordinary SKU stock', async () => {
    const f = new PosSqlFixture();
    f.batches = [stock('01-NONE', null), stock('02-OLD', 'OLD')];
    const result = await f.settle([{ id: 1, product_code: 'PRD-EGG-X', sku_code: 'OLD', qty: 5 }]);
    expect(result.map((a: any) => a.batchNo)).toEqual(['02-OLD']);
    expect(f.selected).toEqual([['02-OLD']]);
  });

  it.each(['DIRTY', 'CRACKED', 'BROKEN', 'DAMAGED'])('never allocates defect grade %s through the legacy product fallback', async grade => {
    const f = new PosSqlFixture();
    f.batches = [stock(`DEFECT-${grade}`, null, { quality_grade: grade, grade_code_std: grade, qty_available: 5 })];
    await expect(f.settle([{ id: 1, product_code: 'PRD-EGG-X', grade_code: grade, qty: 1 }])).rejects.toThrow('缺 1');
    expect(f.writes).toBe(0);
    expect(f.allocations).toEqual([]);
    expect(f.ledger).toEqual([]);
  });

  it('uses grade_code_std when quality_grade is missing in the legacy fallback', async () => {
    const f = new PosSqlFixture();
    f.batches = [stock('STD-FALLBACK', null, { quality_grade: null as any, grade_code_std: 'G', qty_available: 2 })];
    const result = await f.settle([{ id: 1, product_code: 'PRD-EGG-X', grade_code: 'G', qty: 1 }]);
    expect(result.map((a: any) => a.batchNo)).toEqual(['STD-FALLBACK']);
  });

  it('filters physical managed identities from a saved shared quantity pool', async () => {
    const f = new PosSqlFixture();
    f.batches = [stock('01-VAR', 'VAR'), stock('02-STD0', 'STD0'), stock('03-MASKED', 'MASKED'), stock('04-OLD', 'OLD', { qty_available: 3 }), stock('05-NONE', null)];
    const result = await f.settle([{ id: 1, product_code: 'PRD-EGG-X', sku_code: 'OLD', qty: 5, quantity_snapshot: snapshot }]);
    expect(result.map((a: any) => [a.batchNo, a.qty])).toEqual([['04-OLD', 3], ['05-NONE', 2]]);
    expect(f.batches.slice(0, 3).every(b => b.qty === 10 && b.qty_available === 10)).toBe(true);
  });

  it.each(['VAR', 'STD0'])('does not hide selected managed SKU %s in a snapshot without item SKU', async skuCode => {
    const f = new PosSqlFixture();
    f.batches = [stock('OLD', 'OLD')];
    await expect(f.settle([{ id: 1, product_code: 'PRD-EGG-X', qty: 5, quantity_snapshot: { ...snapshot, skuCode } }])).rejects.toThrow('公司上下文');
    expect(f.writes).toBe(0);
  });

  it.each([false, true])('does not partially deduct short unmanaged stock (shared pool=%p)', async shared => {
    const f = new PosSqlFixture();
    f.batches = [stock('01-VAR', 'VAR'), stock('02-STD0', 'STD0'), stock('03-MASKED', 'MASKED'), stock('04-OLD', 'OLD', { qty_available: 2 })];
    await expect(f.settle([{ id: 1, product_code: 'PRD-EGG-X', qty: 5, ...(shared ? { quantity_snapshot: snapshot } : {}) }])).rejects.toThrow('缺 3');
    expect(f.writes).toBe(0);
    expect(f.allocations).toEqual([]);
    expect(f.ledger).toEqual([]);
  });

  it('retains company/warehouse/expiry/status/source/grade restrictions and FIFO ordering', async () => {
    const f = new PosSqlFixture();
    f.batches = [stock('BAD-COMPANY', null, { company_code: 'OTHER' }), stock('BAD-WH', null, { warehouse_code: 'OTHER' }),
      stock('EXPIRED', null, { expire_date: '2020-01-01' }), stock('FROZEN', null, { status: 'FROZEN' }),
      stock('LEGACY-SOURCE', null, { legacy_source: 'OLD' }), stock('BAD-GRADE', null, { quality_grade: 'OTHER' }),
      stock('LATER', 'OLD', { expire_date: null }), stock('FIRST', null, { expire_date: '2090-01-01', qty_available: 3 })];
    const result = await f.settle([{ id: 1, product_code: 'PRD-EGG-X', grade_code: 'G', qty: 5 }]);
    expect(result.map((a: any) => [a.batchNo, a.qty])).toEqual([['FIRST', 3], ['LATER', 2]]);
    expect(f.selected).toEqual([['FIRST', 'LATER']]);
  });

  it('propagates SKU SQL/permission errors rather than treating them as legacy eligibility', async () => {
    const f = new PosSqlFixture();
    f.batches = [stock('OLD', 'OLD'), stock('NONE', null)];
    f.failSkuRead = new Error('permission denied for table product_skus');
    await expect(f.settle()).rejects.toBe(f.failSkuRead);
    expect(f.writes).toBe(0);
    expect(f.allocations).toEqual([]);
  });

  it('rolls back deductions, allocations and prior ledger entries after a later ledger failure', async () => {
    const f = new PosSqlFixture();
    f.batches = [stock('01', 'OLD', { qty_available: 3 }), stock('02', null, { qty_available: 3 })];
    f.failLedgerAt = 2;
    await expect(f.settle()).rejects.toThrow('injected POS ledger failure');
    expect(f.writes).toBe(2);
    expect(f.batches.map(b => [b.qty, b.qty_available])).toEqual([[10, 3], [10, 3]]);
    expect(f.allocations).toEqual([]);
    expect(f.ledger).toEqual([]);
    expect(f.rollbacks).toBe(1);
  });

  it('rolls back an earlier item if a later item has insufficient ordinary stock', async () => {
    const f = new PosSqlFixture();
    f.batches = [stock('OLD', 'OLD', { qty_available: 5 })];
    await expect(f.settle([{ id: 1, product_code: 'PRD-EGG-X', qty: 3 }, { id: 2, product_code: 'PRD-EGG-X', qty: 3 }])).rejects.toThrow('缺 1');
    expect(f.writes).toBe(1);
    expect(f.batches[0].qty_available).toBe(5);
    expect(f.batches[0].qty).toBe(10);
    expect(f.allocations).toEqual([]);
    expect(f.ledger).toEqual([]);
  });
});
