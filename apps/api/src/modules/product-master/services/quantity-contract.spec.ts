import { baseQuantity, positiveQuantity, savedQuantity, resolveQuantity, lockQuantityPools, assertBatchPool } from './quantity-contract';

const master = { product_code: 'P', grade_code: 'G', spec_code: 'TRAY', unit: '个', unit_zh: '枚', base_unit: '枚', display_unit: '托', qty_per_unit: 30 };
const db = () => ({ query: jest.fn().mockResolvedValue([master]) });
describe('Forward quantity contract', () => {
  it('converts 1 tray / box using server master and ignores arbitrary client multipliers', async () => {
    expect(await resolveQuantity(db(), { qty: 1, skuCode: 'T', quantityBasis: 'PACKAGE', factor: 900 } as never)).toMatchObject({ factor: 30, baseQty: 30, tradeUnit: '托' });
    const box = { query: jest.fn().mockResolvedValue([{ ...master, qty_per_unit: 360, display_unit: '箱' }]) };
    expect(await resolveQuantity(box, { qty: 1, skuCode: 'B', quantityBasis: 'PACKAGE' })).toMatchObject({ factor: 360, baseQty: 360 });
  });
  it('keeps omitted basis and null snapshots as historical base semantics', async () => {
    const q = db();
    expect(await resolveQuantity(q, { qty: 1, skuCode: 'T' })).toBeNull();
    expect(q.query).not.toHaveBeenCalled();
    expect(savedQuantity({ qty: '1', quantity_snapshot: null })).toBe(1);
  });
  it('snapshots survive a mutable master conversion change', async () => {
    const snapshot = await resolveQuantity(db(), { qty: 1, skuCode: 'T', quantityBasis: 'PACKAGE' });
    expect(savedQuantity({ qty: 1, quantity_snapshot: snapshot })).toBe(30);
  });
  it.each([NaN, Infinity, 0, -1, true, [], {}, null, ''])('rejects invalid quantities %p', n => {
    expect(() => positiveQuantity(n)).toThrow();
  });
  it('rejects fractional eggs and precision the persistent transaction/allocation cannot represent', async () => {
    expect(() => baseQuantity(0.01, 30, '枚')).toThrow();
    expect(() => baseQuantity(1.001, 1, 'kg')).toThrow();
    await expect(resolveQuantity(db(), { qty: 1 / 30, skuCode: 'T', quantityBasis: 'PACKAGE' })).rejects.toThrow('交易数量最多两位');
    expect(baseQuantity(0.1, 30, '枚')).toBe(3);
    expect(baseQuantity(1.25, 1, 'kg')).toBe(1.25);
  });
  it.each([false, 0, '', [], {}, { version: 1, basis: 'BASE', factor: 30 }])('rejects malformed non-null snapshots %p', s => {
    expect(() => savedQuantity({ qty: 1, quantity_snapshot: s as never })).toThrow();
  });
  it('rejects unit mismatch and invalid server conversion', async () => {
    await expect(resolveQuantity({ query: jest.fn().mockResolvedValue([{ ...master, base_unit: 'kg' }]) }, { qty: 1, skuCode: 'T', quantityBasis: 'PACKAGE' })).rejects.toThrow();
    await expect(resolveQuantity({ query: jest.fn().mockResolvedValue([{ ...master, qty_per_unit: NaN }]) }, { qty: 1, skuCode: 'T', quantityBasis: 'PACKAGE' })).rejects.toThrow();
    await expect(resolveQuantity({ query: jest.fn().mockRejectedValue(new Error('lookup failed')) }, { qty: 1, skuCode: 'T', quantityBasis: 'PACKAGE' })).rejects.toThrow('lookup failed');
  });
  it('takes identical single warehouse locks for intersecting warehouse sets, in stable order', async () => {
    const snapshot = await resolveQuantity(db(), { qty: 1, skuCode: 'T', quantityBasis: 'PACKAGE' });
    const a = { query: jest.fn().mockResolvedValue([]) }; const b = { query: jest.fn().mockResolvedValue([]) };
    await lockQuantityPools(a, [{ company: 'C', warehouses: ['B', 'A'], snapshot }]);
    await lockQuantityPools(b, [{ company: 'C', warehouses: ['C', 'B'], snapshot }]);
    expect(a.query.mock.calls[1][1]).toEqual(b.query.mock.calls[0][1]);
    await expect(lockQuantityPools(a, [{ company: 'C', warehouses: [], snapshot }])).rejects.toThrow();
  });
  it('does not promote unknown old batches or mix materials / grades / units', async () => {
    const snapshot = (await resolveQuantity(db(), { qty: 1, skuCode: 'T', quantityBasis: 'PACKAGE' }))!;
    const batch = { product_code: 'P', grade_code_std: 'G', unit: '枚', base_quantity_version: 1 };
    expect(() => assertBatchPool(batch, snapshot)).not.toThrow();
    for (const change of [{ base_quantity_version: null }, { grade_code_std: 'H' }, { unit: 'kg' }, { material_code: 'M' }, { legacy_source: 'OLD' }]) expect(() => assertBatchPool({ ...batch, ...change }, snapshot)).toThrow();
  });
});
