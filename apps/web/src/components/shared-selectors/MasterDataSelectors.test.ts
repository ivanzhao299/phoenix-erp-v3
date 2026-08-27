/** @vitest-environment jsdom */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));

vi.mock('@/lib/api-client', () => ({ default: requestMock }));
vi.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

import { LocationSelector, StoreMembershipSelector, ZoneSelector } from './MasterDataSelectors';

// React 19 uses this flag to suppress false-positive act environment warnings.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

describe('WMS status-vocabulary selectors', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    requestMock.mockReset();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it.each([
    ['location', LocationSelector, 'location_code', 'location_name'],
    ['zone', ZoneSelector, 'zone_code', 'zone_name'],
  ] as const)('loads ACTIVE and NORMAL %s rows without a single-status URL and excludes DELETED', async (
    _kind, Selector, codeKey, nameKey,
  ) => {
    requestMock.mockResolvedValue({ data: { items: [
      { [codeKey]: 'A', [nameKey]: 'Active', warehouse_code: 'WH-1', status: 'ACTIVE' },
      { [codeKey]: 'N', [nameKey]: 'Normal', warehouse_code: 'WH-1', status: 'NORMAL' },
      { [codeKey]: 'D', [nameKey]: 'Deleted', warehouse_code: 'WH-1', status: 'DELETED' },
    ] } });

    await act(async () => root.render(createElement(Selector, {
      value: '', onChange: () => undefined, warehouseCode: 'WH-1',
    })));
    await flush();

    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock.mock.calls[0][0]).not.toMatch(/[?&]status=/);
    const values = [...host.querySelectorAll('option')].map(option => option.value);
    expect(values).toEqual(['', 'A', 'N']);
  });

  it('reloads locations after a warehouse switch and ignores the stale response', async () => {
    let resolveOld!: (value: unknown) => void;
    const oldRequest = new Promise(resolve => { resolveOld = resolve; });
    requestMock
      .mockReturnValueOnce(oldRequest)
      .mockResolvedValueOnce({ data: { items: [
        { location_code: 'NEW', location_name: 'New', warehouse_code: 'WH-2', status: 'NORMAL' },
      ] } });

    await act(async () => root.render(createElement(LocationSelector, {
      value: '', onChange: () => undefined, warehouseCode: 'WH-1',
    })));
    await act(async () => root.render(createElement(LocationSelector, {
      value: '', onChange: () => undefined, warehouseCode: 'WH-2',
    })));
    await flush();
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect([...host.querySelectorAll('option')].map(option => option.value)).toEqual(['', 'NEW']);

    resolveOld({ data: { items: [
      { location_code: 'OLD', location_name: 'Old', warehouse_code: 'WH-1', status: 'NORMAL' },
    ] } });
    await flush();
    expect([...host.querySelectorAll('option')].map(option => option.value)).toEqual(['', 'NEW']);
  });

  it('deduplicates an amei-style dual-role store context defensively', async () => {
    requestMock.mockResolvedValue({ data: [
      { storeCode: 'STORE-HS-001', storeName: '会晒直营店', companyCode: 'COMP-LAO-XINGCHI', role: 'CASHIER', roles: ['CASHIER'], hasSalesWarehouse: true },
      { storeCode: 'STORE-HS-001', storeName: '会晒直营店', companyCode: 'COMP-LAO-XINGCHI', role: 'STORE_MANAGER', roles: ['STORE_MANAGER'], hasSalesWarehouse: true },
    ] });

    await act(async () => root.render(createElement(StoreMembershipSelector, {
      value: '', onChange: () => undefined,
    })));
    await flush();

    expect([...host.querySelectorAll('option')].map(option => option.value))
      .toEqual(['', 'STORE-HS-001']);
    expect(host.textContent?.match(/会晒直营店/g)).toHaveLength(1);
  });
});
