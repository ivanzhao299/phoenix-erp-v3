import { quantityTicks } from './stock-quantity';

describe('stock quantity precision', () => {
  it('keeps the three parts of a transfer exact', () => {
    expect(quantityTicks('0.300', '应收') - quantityTicks('0.1', '实收') - quantityTicks('0.2', '破损')).toBe(0);
  });

  it.each([null, '', true, -1, '0.3001', '100000000000'])('rejects invalid quantity %p', value => {
    expect(() => quantityTicks(value, '实盘')).toThrow();
  });
});
