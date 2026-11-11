import { EntityManager } from 'typeorm';
import { CodeGeneratorService } from '../../master-data/code-generator.service';
import { MasterDataAuditService } from '../../master-data/master-data-audit.service';
import { MasterDataRuntimeService } from '../../master-data/master-data-runtime.service';
import { ProductMasterService } from './product-master.service';
import { SkuWriter } from './sku-writer';
import { ProductPolicy } from './product-policy';
import { ChanjetErpMasterBusinessReviewService } from '../../chanjet/chanjet-erp-master-business-review.service';

const input = { product_code: 'EGG', grade_code: 'G1', spec_code: 'STD' };
function fixture() {
  let skus: Record<string, any>[] = [];
  let products: Record<string, any>[] = [{ product_code: 'EGG', product_name_zh: '鸡蛋', variety_code: null, status: 'ACTIVE' }];
  const varieties = [{ variety_code: 'EGG_RED', status: 'ACTIVE', effective_date: null as string | null, expire_date: null as string | null }];
  let audits: any[][] = [];
  let sequence = 0;
  const refs = { mst_products: 'ACTIVE', product_grades: 'ACTIVE', packaging_specs: 'ACTIVE' };
  const options = { failAudit: false, conflict: false, failReference: false, referenced: false };
  const query = jest.fn(async (sql: string, args: any[] = []): Promise<any> => {
    if (sql.includes('pg_advisory_xact_lock') || sql.startsWith('SET LOCAL') || sql.startsWith('LOCK TABLE')) return [];
    if (sql.includes('information_schema.columns')) return ['sal_order_items', 'sal_price_items', 'inv_batches', 'inv_ledger'].map(table_name => ({ table_name, column_name: 'sku_code', data_type: 'character varying' }));
    if (sql.startsWith('SELECT 1 FROM "')) return options.referenced ? [{ one: 1 }] : [];
    if (sql.startsWith('SELECT * FROM product_skus')) return skus.filter(row => row.sku_code === args[0]).map(row => ({ ...row }));
    if (sql.includes('FROM md_product_varieties')) return varieties.filter(row => row.variety_code === args[0] && row.status === 'ACTIVE'
      && (!row.effective_date || row.effective_date <= new Date().toISOString().slice(0, 10))
      && (!row.expire_date || row.expire_date >= new Date().toISOString().slice(0, 10)));
    if (sql.includes('FOR SHARE')) {
      const table = Object.keys(refs).find(name => sql.includes(`FROM ${name} `))! as keyof typeof refs;
      if (options.failReference) throw new Error('reference query unavailable');
      if (table === 'mst_products') return products.filter(row => row.product_code === args[0]).map(row => ({ ...row, status: refs[table] }));
      return refs[table] ? [{ status: refs[table] }] : [];
    }
    if (sql.startsWith('SELECT sku_code FROM product_skus WHERE product_code')) return skus.filter(row => row.product_code === args[0] && row.grade_code === args[1] && row.spec_code === args[2] && row.sku_code !== args[3]);
    if (sql.startsWith('SELECT sku_code FROM product_skus WHERE barcode')) return skus.filter(row => row.barcode === args[0] && row.sku_code !== args[1]);
    if (sql.includes('UPDATE mst_code_seq')) return [[{ current_no: ++sequence, pad_len: 5 }], 1];
    if (sql.startsWith('INSERT INTO product_skus')) {
      if (options.conflict) throw Object.assign(new Error('unique'), { code: '23505' });
      const fields = sql.match(/product_skus \((.*?)\)/)![1].split(',');
      const row = Object.fromEntries(fields.map((field, i) => [field, args[i]]));
      skus.push(row);
      return [[row], 1]; // actual TypeORM mutation result shape
    }
    if (sql.startsWith('UPDATE product_skus')) {
      const row = skus.find(sku => sku.sku_code === args[args.length - 1])!;
      sql.match(/SET (.*?),updated_at/)![1].split(',').forEach((set, i) => { row[set.split('=')[0]] = args[i]; });
      return [[{ ...row }], 1];
    }
    if (sql.startsWith('INSERT INTO mst_products')) {
      const row = { product_code: args[0], product_name: args[1], product_name_zh: args[1], product_name_lo: args[2], unit_zh: '枚', variety_code: null, status: 'ACTIVE' };
      products.push(row);
      return [[row], 1];
    }
    if (sql.includes('INSERT INTO mst_audit_trail')) {
      if (options.failAudit) throw new Error('audit unavailable');
      audits.push(args);
      return [];
    }
    throw new Error(`Unhandled fixture query: ${sql}`);
  });
  const manager = { query } as unknown as EntityManager;
  const ds = { query, manager, transaction: jest.fn(async (run: (m: EntityManager) => Promise<any>) => {
    const snapshot = structuredClone({ skus, products, audits, sequence });
    try { return await run(manager); } catch (error) {
      ({ skus, products, audits, sequence } = snapshot);
      throw error;
    }
  }) };
  const audit = new MasterDataAuditService(ds as any);
  const codes = new CodeGeneratorService(ds as any);
  const runtime = new MasterDataRuntimeService(ds as any, codes, audit, {} as any, {} as any, {} as any, {} as any);
  const legacy = new ProductMasterService(ds as any, runtime);
  const writer = new SkuWriter(ds as any, codes, audit);
  return { ds, manager, query, options, refs, varieties, runtime, legacy, writer, skus: () => skus, products: () => products, audits: () => audits };
}

const entries = ['runtime', 'legacy', 'quick'] as const;
function create(f: ReturnType<typeof fixture>, entry: typeof entries[number], dto: Record<string, any>) {
  return entry === 'legacy' ? f.legacy.createSku(dto as any, 'tester') : entry === 'quick' ? f.runtime.createQuick('sku', dto, 'tester') : f.runtime.create('sku', dto, 'tester');
}
function update(f: ReturnType<typeof fixture>, entry: 'runtime' | 'legacy', dto: Record<string, any>) {
  return entry === 'legacy' ? f.legacy.updateSku('SKU-00001', dto, 'tester') : f.runtime.update('sku', 'SKU-00001', dto, 'tester');
}

describe.each(entries)('%s shared SKU create behavior', entry => {
  it('generates identity and names and commits audit in the same transaction', async () => {
    const f = fixture();
    await create(f, entry, { ...input, barcode: '0123456789', effective_date: '2026-11-10', expire_date: '2026-11-10' });
    expect(f.skus()).toEqual([expect.objectContaining({ ...input, sku_code: 'SKU-00001', product_name: '鸡蛋', sku_name: '鸡蛋 (G1 / STD)', status: 'ACTIVE' })]);
    expect(f.audits()).toEqual([expect.arrayContaining(['SKU', 'SKU-00001', 'CREATE', 'tester'])]);
    expect(f.ds.transaction).toHaveBeenCalledTimes(1);
  });
  it.each([
    { product_code: '' }, { grade_code: null }, { spec_code: undefined }, { product_code: ' EGG' },
    { barcode: 'a'.repeat(65) }, { barcode: 'abc 123' }, { barcode: 123 },
    { effective_date: '2026-02-30' }, { effective_date: 'invalid' },
    { effective_date: '2026-11-11', expire_date: '2026-11-10' },
    { sku_code: 'MANUAL' }, { sku_code: '' }, { sku_code: null },
    { status: 'DRAFT' }, { status: null }, { sku_name: '' }, { sku_name: '   ' }, { sku_name: null }, { product_name: 'wrong-parent-name' },
  ])('rejects invalid payload %o before any master/audit write', async changes => {
    const f = fixture();
    await expect(create(f, entry, { ...input, ...changes })).rejects.toMatchObject({ status: 400 });
    expect(f.skus()).toEqual([]);
    expect(f.audits()).toEqual([]);
  });
  it.each(['mst_products', 'product_grades', 'packaging_specs'] as const)('rejects missing or inactive %s', async table => {
    for (const status of ['', 'FROZEN', 'ARCHIVED']) {
      const f = fixture();
      f.refs[table] = status;
      await expect(create(f, entry, input)).rejects.toMatchObject({ status: 400 });
      expect(f.skus()).toEqual([]);
    }
  });
  it('rejects duplicates including archived combinations and claimed barcodes', async () => {
    const f = fixture();
    await create(f, entry, { ...input, barcode: 'B1' });
    f.skus()[0].status = 'ARCHIVED';
    await expect(create(f, entry, input)).rejects.toMatchObject({ status: 409 });
    await expect(create(f, entry, { ...input, spec_code: 'OTHER', barcode: 'B1' })).rejects.toMatchObject({ status: 409 });
    expect(f.skus()).toHaveLength(1);
    expect(f.audits()).toHaveLength(1);
  });
  it('accepts the current management form payload and derives only omitted names', async () => {
    const f = fixture();
    await create(f, entry, { ...input, sku_name: '鸡蛋零售', product_name: '', barcode: '', effective_date: '', expire_date: '', remark: '' });
    expect(f.skus()[0]).toMatchObject({ sku_name: '鸡蛋零售', product_name: '鸡蛋', barcode: null });
  });
  it('does not turn reference failure or audit failure into success', async () => {
    const f = fixture();
    f.options.failReference = true;
    await expect(create(f, entry, input)).rejects.toThrow('reference query unavailable');
    f.options.failReference = false;
    f.options.failAudit = true;
    await expect(create(f, entry, input)).rejects.toThrow('audit unavailable');
    expect(f.skus()).toEqual([]);
    expect(f.audits()).toEqual([]);
  });
  it('translates database unique races to conflicts', async () => {
    const f = fixture();
    f.options.conflict = true;
    await expect(create(f, entry, input)).rejects.toMatchObject({ status: 409 });
  });
});

describe.each(['runtime', 'legacy'] as const)('%s shared SKU update behavior', entry => {
  it('keeps the existing code, permits description edits with inactive parents and audits', async () => {
    const f = fixture();
    await create(f, 'runtime', input);
    f.refs.mst_products = 'FROZEN';
    f.refs.product_grades = '';
    await update(f, entry, { sku_code: 'SKU-00001', product_code: 'EGG', sku_name: '销售名称', remark: '历史补注', status: 'ACTIVE' });
    expect(f.skus()[0]).toMatchObject({ sku_code: 'SKU-00001', sku_name: '销售名称', remark: '历史补注' });
    expect(f.audits()[1][2]).toBe('UPDATE');
  });
  it('requires ACTIVE references when changing identity and retains phase1 protection', async () => {
    const f = fixture();
    await create(f, 'runtime', input);
    f.refs.packaging_specs = 'FROZEN';
    await expect(update(f, entry, { spec_code: 'NEW' })).rejects.toMatchObject({ status: 400 });
    f.refs.packaging_specs = 'ACTIVE';
    f.options.referenced = true;
    await expect(update(f, entry, { spec_code: 'NEW' })).rejects.toMatchObject({ status: 409 });
    f.options.referenced = false;
    await update(f, entry, { spec_code: 'NEW' });
    expect(f.skus()[0]).toMatchObject({ sku_code: 'SKU-00001', spec_code: 'NEW', sku_name: '鸡蛋 (G1 / NEW)' });
  });
  it.each([{ sku_code: 'OTHER' }, { status: 'FROZEN' }, { status: null }, { grade_code: '' }, { product_name: 'wrong' }, { effective_date: '2026-13-01' }])('rejects incompatible edit %o', async dto => {
    const f = fixture();
    await create(f, 'runtime', input);
    await expect(update(f, entry, dto)).rejects.toMatchObject({ status: 400 });
    expect(f.audits()).toHaveLength(1);
    expect(f.skus()[0]).toMatchObject({ sku_code: 'SKU-00001', status: 'ACTIVE' });
  });
  it('compares database Date values by day and avoids spurious date writes', async () => {
    const f = fixture();
    await create(f, 'runtime', input);
    f.skus()[0].effective_date = new Date('2026-11-10T00:00:00.000Z');
    f.skus()[0].expire_date = new Date('2027-01-01T00:00:00.000Z');
    await update(f, entry, { effective_date: '2026-11-10', expire_date: '2027-01-01' });
    expect(f.audits()).toHaveLength(1);
    await update(f, entry, { remark: '历史描述' });
    const sql = f.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE product_skus'))![0];
    expect(sql).not.toContain('effective_date=');
    expect(sql).not.toContain('expire_date=');
  });
  it('rejects an edit claiming another SKU barcode or combination', async () => {
    const f = fixture();
    await create(f, 'runtime', input);
    await f.writer.create({ ...input, spec_code: 'OTHER', barcode: 'TAKEN' });
    await expect(update(f, entry, { barcode: 'TAKEN' })).rejects.toMatchObject({ status: 409 });
    await expect(update(f, entry, { spec_code: 'OTHER' })).rejects.toMatchObject({ status: 409 });
    expect(f.skus()[0].spec_code).toBe('STD');
  });
  it('rolls back edits when audit fails', async () => {
    const f = fixture();
    await create(f, 'runtime', input);
    f.options.failAudit = true;
    await expect(update(f, entry, { remark: 'new' })).rejects.toThrow('audit unavailable');
    expect(f.skus()[0].remark).toBeUndefined();
  });
});

describe('SKU lifecycle and internal reviewed import', () => {
  it('locks lifecycle transitions, validates activation and refuses referenced archive', async () => {
    const f = fixture();
    await f.writer.create(input);
    await expect(f.runtime.transition('sku', 'SKU-00001', 'freeze', 'tester')).resolves.toEqual({ status: 'FROZEN' });
    f.refs.mst_products = 'FROZEN';
    await expect(f.runtime.transition('sku', 'SKU-00001', 'restore')).rejects.toMatchObject({ status: 400 });
    f.refs.mst_products = 'ACTIVE';
    await f.runtime.transition('sku', 'SKU-00001', 'restore');
    f.options.referenced = true;
    await expect(f.runtime.transition('sku', 'SKU-00001', 'archive')).rejects.toMatchObject({ status: 409 });
    expect(f.skus()[0].status).toBe('ACTIVE');
    await expect(f.runtime.transition('sku', 'SKU-00001', 'reject')).rejects.toMatchObject({ status: 400 });
  });
  it('retains approved code/name, checks identity on retry, and audits only creation', async () => {
    const f = fixture();
    const call = () => f.ds.transaction(manager => SkuWriter.createApproved(manager, input, 'CJ-EGG-ABC', '来源商品名', 'reviewer'));
    await expect(call()).resolves.toBe(true);
    await expect(call()).resolves.toBe(false);
    expect(f.skus()[0]).toMatchObject({ sku_code: 'CJ-EGG-ABC', sku_name: '来源商品名', product_name: '鸡蛋' });
    expect(f.audits()).toHaveLength(1);
    f.skus()[0].grade_code = 'WRONG';
    await expect(call()).rejects.toMatchObject({ status: 409 });
  });
  it('routes actual Chanjet review creation through shared validation in its caller transaction', async () => {
    const f = fixture();
    const review = new ChanjetErpMasterBusinessReviewService(f.ds as any);
    const candidate = { targetTable: 'product_skus', bookId: 'BOOK', chanjetCode: '1', createPayload: { skuCode: 'CJ-EGG-1', skuName: '来源名', productCode: 'EGG', gradeCode: 'G1', specCode: 'STD' } };
    f.refs.product_grades = '';
    await expect(f.ds.transaction(manager => (review as any).createMaster(manager, candidate, 'reviewer'))).rejects.toMatchObject({ status: 400 });
    expect(f.skus()).toEqual([]);
    f.refs.product_grades = 'ACTIVE';
    await expect(f.ds.transaction(manager => (review as any).createMaster(manager, candidate, 'reviewer'))).resolves.toBe(true);
    expect(f.audits()[0][6]).toContain('已审核好业财候选');
  });
  it('rolls back reviewed creation if its audit cannot be written', async () => {
    const f = fixture();
    f.options.failAudit = true;
    await expect(f.ds.transaction(manager => SkuWriter.createApproved(manager, input, 'CJ-EGG-ABC', '来源名', 'reviewer'))).rejects.toThrow('audit unavailable');
    expect(f.skus()).toEqual([]);
  });
});

describe('parent-derived SKU variety classification', () => {
  function red(f: ReturnType<typeof fixture>) {
    f.products().push({ product_code: 'PRD-EGG-RED', product_name_zh: '红壳鸡蛋', variety_code: 'EGG_RED', status: 'ACTIVE' });
    return { ...input, product_code: 'PRD-EGG-RED' };
  }

  it.each(entries)('%s persists explicit STANDARD NULL and VAR parent classification', async entry => {
    const f = fixture();
    await create(f, entry, { ...input, variety_code: '' });
    await create(f, entry, { ...red(f), variety_code: 'EGG_RED' });
    expect(f.skus().map(row => row.variety_code)).toEqual([null, 'EGG_RED']);
    expect(f.skus().map(row => row.org_context_required)).toEqual([true, true]);
    const productLocks = f.query.mock.calls.filter(([sql]) => sql.includes('FROM mst_products'));
    expect(productLocks.every(([sql]) => sql.endsWith('FOR SHARE'))).toBe(true);
    const [sql, args] = f.query.mock.calls.find(([sql]) => sql.includes('FROM md_product_varieties'))!;
    expect(sql).toContain("status='ACTIVE'");
    expect(sql).toContain('effective_date<=CURRENT_DATE');
    expect(sql).toContain('expire_date>=CURRENT_DATE');
    expect(sql).toContain('FOR SHARE');
    expect(args).toEqual(['EGG_RED']);
  });

  it.each([null, '', 'EGG_PINK', 1, ' EGG_RED'])('rejects spoofed VAR payload %p before writes', async variety_code => {
    const f = fixture();
    await expect(f.writer.create({ ...red(f), variety_code })).rejects.toMatchObject({ status: 400 });
    expect(f.skus()).toEqual([]);
    expect(f.audits()).toEqual([]);
  });

  it('accepts same-value VAR legacy edit payload without touching referenced classification', async () => {
    const f = fixture();
    await f.writer.create(red(f));
    f.options.referenced = true;
    f.refs.mst_products = 'FROZEN';
    f.query.mockClear();
    await f.writer.update('SKU-00001', { variety_code: 'EGG_RED', remark: 'same-value legacy payload' });
    expect(f.skus()[0]).toMatchObject({ variety_code: 'EGG_RED', remark: 'same-value legacy payload' });
    const [sql] = f.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE product_skus'))!;
    expect(sql).not.toContain('variety_code=');
    await expect(f.writer.update('SKU-00001', { variety_code: null })).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a client classification on a STANDARD parent', async () => {
    const f = fixture();
    await expect(f.writer.create({ ...input, variety_code: 'EGG_RED' })).rejects.toMatchObject({ status: 400 });
    expect(f.skus()).toEqual([]);
  });

  it.each(['FROZEN', 'missing', 'future', 'expired'])('rejects %s parent variety lifecycle', async condition => {
    const f = fixture();
    if (condition === 'missing') f.varieties.splice(0);
    else if (condition === 'future') f.varieties[0].effective_date = '9999-01-01';
    else if (condition === 'expired') f.varieties[0].expire_date = '2000-01-01';
    else f.varieties[0].status = condition;
    await expect(f.writer.create(red(f))).rejects.toMatchObject({ status: 400 });
    expect(f.skus()).toEqual([]);
  });

  it('fails closed when parent variety column is missing rather than treating undefined as NULL', async () => {
    const f = fixture();
    delete f.products()[0].variety_code;
    await expect(f.writer.create(input)).rejects.toThrow('元数据');
    expect(f.skus()).toEqual([]);
    expect(f.audits()).toEqual([]);
  });

  it('persists changed parent variety only after the unchanged reference guard permits identity mutation', async () => {
    const f = fixture();
    const changed = red(f);
    await f.writer.create(input);
    f.options.referenced = true;
    f.query.mockClear();
    await expect(f.writer.update('SKU-00001', changed)).rejects.toMatchObject({ status: 409 });
    expect(f.query).toHaveBeenCalledWith('SELECT * FROM product_skus WHERE sku_code=$1 FOR UPDATE NOWAIT', ['SKU-00001']);
    expect(f.query).toHaveBeenCalledWith('SELECT * FROM mst_products WHERE product_code=$1 FOR SHARE', ['PRD-EGG-RED']);
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('SELECT 1 FROM "'))).toBe(true);
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE product_skus'))).toBe(false);
    expect(f.skus()[0]).toMatchObject({ product_code: 'EGG', variety_code: null });
    expect(f.audits()).toHaveLength(1);
    f.options.referenced = false;
    await f.writer.update('SKU-00001', changed);
    expect(f.skus()[0]).toMatchObject({ product_code: 'PRD-EGG-RED', variety_code: 'EGG_RED' });
    await f.writer.update('SKU-00001', input);
    expect(f.skus()[0]).toMatchObject({ product_code: 'EGG', variety_code: null });
  });

  it('preserves referenced historical classification on description-only edits with frozen changed parent', async () => {
    const f = fixture();
    await f.writer.create(input);
    f.products()[0].variety_code = 'EGG_RED';
    f.refs.mst_products = 'FROZEN';
    f.options.referenced = true;
    f.query.mockClear();
    await f.writer.update('SKU-00001', { remark: '历史保留', variety_code: null });
    expect(f.skus()[0]).toMatchObject({ variety_code: null, remark: '历史保留' });
    expect(f.query.mock.calls.some(([sql]) => sql.includes('FROM mst_products'))).toBe(false);
    const [sql] = f.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE product_skus'))!;
    expect(sql).not.toContain('variety_code=');
    await expect(f.writer.update('SKU-00001', { variety_code: 'EGG_RED' })).rejects.toMatchObject({ status: 400 });
    expect(f.skus()[0].variety_code).toBeNull();
  });

  it.each([null, 'EGG_PINK', undefined])('rejects activation of mismatched existing variety %p without repair', async variety => {
    const f = fixture();
    await f.writer.create(red(f));
    await f.writer.transition('SKU-00001', 'freeze');
    f.skus()[0].variety_code = variety;
    await expect(f.writer.transition('SKU-00001', 'restore')).rejects.toMatchObject({ status: 400 });
    expect(f.skus()[0]).toMatchObject({ status: 'FROZEN', variety_code: variety });
    expect(f.audits()).toHaveLength(2);
  });

  it.each([false, null, 'true'])('rejects spoofed new organization restriction %p', async org_context_required => {
    const f = fixture();
    await expect(f.writer.create({ ...input, org_context_required })).rejects.toMatchObject({ status: 400 });
    expect(f.skus()).toEqual([]);
  });

  it('preserves legacy organization flag on descriptions/activation but requires it for changed product', async () => {
    const f = fixture();
    await f.writer.create(input);
    f.skus()[0].org_context_required = false; // persisted pre-cutover legacy row
    f.options.referenced = true;
    f.query.mockClear();
    await f.writer.update('SKU-00001', { remark: 'legacy', org_context_required: false });
    const [descriptionSql] = f.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE product_skus'))!;
    expect(descriptionSql).not.toContain('org_context_required=');
    await expect(f.writer.update('SKU-00001', { org_context_required: true })).rejects.toMatchObject({ status: 400 });
    await f.writer.transition('SKU-00001', 'freeze');
    await f.writer.transition('SKU-00001', 'restore');
    expect(f.skus()[0].org_context_required).toBe(false);
    const changed = red(f);
    await expect(f.writer.update('SKU-00001', changed)).rejects.toMatchObject({ status: 409 });
    expect(f.skus()[0].org_context_required).toBe(false);
    f.options.referenced = false;
    await expect(f.writer.update('SKU-00001', { ...changed, org_context_required: false })).rejects.toMatchObject({ status: 400 });
    await f.writer.update('SKU-00001', { ...changed, org_context_required: true });
    expect(f.skus()[0]).toMatchObject({ product_code: 'PRD-EGG-RED', variety_code: 'EGG_RED', org_context_required: true });
    await expect(f.writer.update('SKU-00001', { org_context_required: false })).rejects.toMatchObject({ status: 400 });
  });

  it('sets the internal organization restriction on approved creation and preserves legacy retries', async () => {
    const f = fixture();
    const call = (dto: Record<string, unknown> = input) => f.ds.transaction(manager => SkuWriter.createApproved(manager, dto, 'CJ-STD', '来源名', 'reviewer'));
    await expect(call()).resolves.toBe(true);
    expect(f.skus()[0].org_context_required).toBe(true);
    await expect(call({ ...input, org_context_required: false })).rejects.toMatchObject({ status: 400 });
    f.skus()[0].org_context_required = false;
    await expect(call({ ...input, org_context_required: false })).resolves.toBe(false);
    expect(f.skus()[0].org_context_required).toBe(false);
    expect(f.audits()).toHaveLength(1);
  });

  it('does not reclassify historical NULL on a grade/spec identity edit', async () => {
    const f = fixture();
    await f.writer.create(input);
    f.products()[0].variety_code = 'EGG_RED';
    await expect(f.writer.update('SKU-00001', { grade_code: 'G2' })).rejects.toMatchObject({ status: 400 });
    expect(f.skus()[0]).toMatchObject({ grade_code: 'G1', variety_code: null });
  });

  it('validates derived variety on approved-import retries without silently repairing old NULL', async () => {
    const f = fixture();
    const dto = red(f);
    const call = (payload: Record<string, unknown> = dto) => f.ds.transaction(manager => SkuWriter.createApproved(manager, payload, 'CJ-RED', '红壳来源', 'reviewer'));
    await expect(call()).resolves.toBe(true);
    await expect(call()).resolves.toBe(false);
    await expect(call({ ...dto, variety_code: 'EGG_PINK' })).rejects.toMatchObject({ status: 400 });
    f.skus()[0].variety_code = null;
    await expect(call()).rejects.toMatchObject({ status: 400 });
    expect(f.skus()[0].variety_code).toBeNull();
    expect(f.audits()).toHaveLength(1);
  });
});

describe('fixed raw-egg product policy', () => {
  it('creates only the fixed identity with audit and is idempotent without overwriting it', async () => {
    const f = fixture();
    const call = () => f.ds.transaction(manager => ProductPolicy.ensureRawEggProduct(manager, 'packer'));
    await call();
    await call();
    expect(f.products().filter(row => row.product_code === 'PRD-EGG-RAW')).toHaveLength(1);
    expect(f.audits()).toHaveLength(1);
    f.products().find(row => row.product_code === 'PRD-EGG-RAW')!.status = 'FROZEN';
    f.refs.mst_products = 'FROZEN';
    await expect(call()).rejects.toMatchObject({ status: 409 });
  });
  it('refuses a fixed raw product using an incompatible base unit', async () => {
    const f = fixture();
    await f.ds.transaction(manager => ProductPolicy.ensureRawEggProduct(manager));
    f.products().find(row => row.product_code === 'PRD-EGG-RAW')!.unit_zh = '箱';
    await expect(f.ds.transaction(manager => ProductPolicy.ensureRawEggProduct(manager))).rejects.toThrow('基础单位必须为枚');
  });
  it('makes bootstrap product and its audit atomic with its caller', async () => {
    const f = fixture();
    f.options.failAudit = true;
    await expect(f.ds.transaction(manager => ProductPolicy.ensureRawEggProduct(manager))).rejects.toThrow('audit unavailable');
    expect(f.products().map(row => row.product_code)).toEqual(['EGG']);
  });
});
