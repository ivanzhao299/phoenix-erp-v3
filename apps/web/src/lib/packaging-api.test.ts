import { describe, expect, it } from 'vitest';
import { assertWarehouseHandoverCommitted } from './packaging-api';

describe('warehouse handover confirmation', () => {
  it('accepts only a confirmed inventory posting', () => {
    expect(assertWarehouseHandoverCommitted({
      code: 'WH-1',
      inventoryOk: true,
    })).toMatchObject({ code: 'WH-1', inventoryOk: true });
  });

  it('fails closed when the handover record exists but inventory posting failed', () => {
    expect(() => assertWarehouseHandoverCommitted({
      code: 'WH-2',
      inventoryOk: false,
      message: '库存生成失败',
    })).toThrow('库存生成失败');
  });
});
