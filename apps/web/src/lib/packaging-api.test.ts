import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertWarehouseHandoverCommitted, packagingApi } from './packaging-api';
afterEach(() => vi.unstubAllGlobals());

describe('packaging readiness provenance requests', () => {
  it('sends the exact shift and grading source codes, never an unscoped global lookup', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ code: 200, data: [] }) });
    vi.stubGlobal('fetch', fetch);
    await packagingApi.getReadyCombinations(56, ['GR-A', 'GR-B']);
    const url = new URL(String(fetch.mock.calls[0][0]), 'http://local.test');
    expect(url.pathname).toBe('/api/packaging/terminal/packing/ready-combinations');
    expect(url.searchParams.get('shiftId')).toBe('56');
    expect(url.searchParams.get('gradingCodes')).toBe('GR-A,GR-B');
  });
  it('requires source selection and a safe shift before issuing a request', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect(() => packagingApi.getReadyCombinations(56, [])).toThrow('来源批次接收与分级');
    expect(() => packagingApi.getReadyCombinations('NaN', ['GR-A'])).toThrow('安全正整数');
    expect(fetch).not.toHaveBeenCalled();
  });
});

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
