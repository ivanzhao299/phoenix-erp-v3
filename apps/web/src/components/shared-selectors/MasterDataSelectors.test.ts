/** @vitest-environment jsdom */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { requestMock, language } = vi.hoisted(() => ({ requestMock: vi.fn(), language: { current: 'zh' } }));

vi.mock('@/lib/api-client', () => ({ default: requestMock }));
vi.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (_key: string, fallback: string) => fallback, lang: language.current }),
}));

import { CompanySelector, CustomerSelector, LocationSelector, StoreMembershipSelector, WarehouseSelector, ZoneSelector } from './MasterDataSelectors';
import { invalidateCache } from '@/lib/request-cache';

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
    invalidateCache();
    language.current = 'zh';
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
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

  it('renders warehouse names for the active locale and falls back safely', async () => {
    requestMock.mockResolvedValue({ data: [{
      warehouseCode: 'WH-1', warehouseName: 'Legacy', warehouseNameZh: '中文仓',
      warehouseNameEn: 'English warehouse', warehouseNameLo: '',
    }] });
    language.current = 'en';
    await act(async () => root.render(createElement(WarehouseSelector, { value: '', onChange: () => undefined })));
    await flush();
    expect(host.textContent).toContain('English warehouse（WH-1）');

    language.current = 'lo';
    await act(async () => root.render(createElement(WarehouseSelector, { value: '', onChange: () => undefined })));
    await flush();
    expect(host.textContent).toContain('中文仓（WH-1）');
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

  it('explains an empty membership context instead of leaving a blank selector', async () => {
    requestMock.mockResolvedValue({ data: [] });

    await act(async () => root.render(createElement(StoreMembershipSelector, {
      value: '', onChange: () => undefined,
    })));
    await flush();

    expect(host.textContent).toContain('当前账号无门店授权，请使用店长/收银账号或联系管理员配置 membership');
  });

  it('distinguishes a context service failure from missing membership', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    requestMock.mockRejectedValue(new Error('network down'));

    await act(async () => root.render(createElement(StoreMembershipSelector, {
      value: '', onChange: () => undefined,
    })));
    await flush();

    expect(host.textContent).toContain('门店授权服务加载失败，请刷新重试');
    expect(host.textContent).not.toContain('当前账号无门店授权');
    expect(consoleError).toHaveBeenCalledWith('[ScopedSelect] option loading failed', 'network down');
  });

  it.each([
    [CompanySelector, '当前账号无可用公司，请联系管理员检查数据范围'],
    [CustomerSelector, '当前账号无可用客户，请联系管理员检查数据范围'],
  ] as const)('explains an empty scoped lookup', async (Selector, expected) => {
    requestMock.mockResolvedValue({ data: [] });
    await act(async () => root.render(createElement(Selector, { value: '', onChange: () => undefined })));
    await flush();
    expect(host.textContent).toContain(expected);
  });

  it('shows company name with code while keeping the code as the selected value', async () => {
    requestMock.mockResolvedValue({ data: [{ companyCode: 'COMP-LA', orgName: 'Golden Phoenix Laos', orgNameCn: '金凤凰老挝' }] });
    await act(async () => root.render(createElement(CompanySelector, { value: '', onChange: () => undefined })));
    await flush();
    expect(host.textContent).toContain('金凤凰老挝（COMP-LA）');
  });

  it.each([
    [CompanySelector, '公司数据加载失败，请重试'],
    [CustomerSelector, '客户数据加载失败，请重试'],
  ] as const)('distinguishes a scoped lookup failure from empty data', async (Selector, expected) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    requestMock.mockRejectedValue(new Error('request failed'));
    await act(async () => root.render(createElement(Selector, { value: '', onChange: () => undefined })));
    await flush();
    expect(host.textContent).toContain(expected);
    expect(host.textContent).not.toContain('当前账号无可用');
    expect(consoleError).toHaveBeenCalledWith('[ScopedSelect] option loading failed', 'request failed');
  });

  it('labels a membership whose store warehouse has no WarehouseScope intersection', async () => {
    requestMock.mockResolvedValue({ data: [{
      storeCode: 'STORE-HS-001', storeName: '会晒直营店', companyCode: 'COMP-LAO-XINGCHI',
      role: 'STORE_MANAGER', roles: ['STORE_MANAGER'], hasSalesWarehouse: true,
      hasWarehouseScopeIntersection: false,
    }] });

    await act(async () => root.render(createElement(StoreMembershipSelector, {
      value: '', onChange: () => undefined,
    })));
    await flush();

    expect(host.textContent).toContain('无门店仓权限交集，请联系管理员配置 WarehouseScope');
  });
});
