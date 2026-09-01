/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({ permissions: ['MENU_SALES2_ORDER:V', 'MENU_STORE_POS:V'] as string[] }));

vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (_key: string, fallback: string) => fallback }) }));
vi.mock('@/hooks/usePermission', () => ({
  usePermission: (menu: string) => {
    const has = (letter: string) => state.permissions.includes('*') || state.permissions.includes(`${menu}:${letter}`);
    return { canView: has('V'), canCreate: has('C'), canApprove: has('A'), canEdit: has('E') };
  },
}));
vi.mock('next/link', () => ({ default: (props: any) => React.createElement('a', props, props.children) }));
vi.mock('@/components/PageHeader', () => ({ default: ({ title }: any) => React.createElement('h1', null, title) }));
vi.mock('@/components/design-system', () => ({
  LoadingSkeleton: () => React.createElement('div', null, '加载中'),
  EmptyState: ({ title }: any) => React.createElement('div', null, title),
}));
vi.mock('@/components/design-system/dialogs/ModalV2', () => ({ ModalV2: ({ open, children }: any) => open ? React.createElement('div', null, children) : null }));
vi.mock('@/components/shared-selectors/DictSelect', () => ({ DictSelect: () => null }));
vi.mock('@/components/shared-selectors/MasterDataSelectors', () => ({
  CompanySelector: () => null, CustomerSelector: () => null, ChannelSelector: () => null, SkuSelector: () => null,
}));

import SalesV2OrdersPage from '@/app/(admin)/sales2/orders/page';

const activityRow = (sourceType: 'ORDER' | 'POS', documentNo: string) => ({
  sourceType, sourceId: `${sourceType}-1`, documentNo, companyCode: 'C1',
  storeCode: sourceType === 'POS' ? 'S1' : null, customerCode: 'CU1', customerName: '测试客户',
  status: sourceType === 'POS' ? 'COMPLETED' : 'DRAFT', displayCategory: 'TEST', amount: 100,
  currency: 'CNY', businessDate: '2026-09-01', occurredAt: '2026-09-01T01:00:00Z',
  detailHref: sourceType === 'POS' ? '/store-pos?saleId=1&storeCode=S1' : '/sales2/orders?orderId=ORDER-1',
});

const jsonResponse = (body: unknown, status = 200) => Promise.resolve({
  ok: status >= 200 && status < 300, status,
  json: async () => body,
} as Response);

let container: HTMLDivElement;
let root: Root;

async function renderPage() {
  await act(async () => {
    root = createRoot(container);
    root.render(React.createElement(SalesV2OrdersPage));
  });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

beforeEach(() => {
  state.permissions = ['MENU_SALES2_ORDER:V', 'MENU_STORE_POS:V'];
  container = document.createElement('div');
  document.body.appendChild(container);
  sessionStorage.setItem('phoenix_token', 'test-token');
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('sales activity orders page', () => {
  it('renders ORDER and POS tabs and reloads ORDER from a valid facade envelope', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v2/sales/activity')) return jsonResponse({
        data: [activityRow('ORDER', 'SO-REAL-001'), activityRow('POS', 'POS-REAL-001')],
        availableSources: ['ORDER', 'POS'], page: 1, limit: 20, hasMore: false,
      });
      return jsonResponse({ data: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    await renderPage();

    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    expect(tabs.map(tab => tab.textContent)).toEqual(expect.arrayContaining(['客户订单', 'POS 成交']));
    expect(container.textContent).toContain('SO-REAL-001');
    await act(async () => { (tabs.find(tab => tab.textContent === '客户订单') as HTMLButtonElement).click(); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/v2/sales/activity?') && String(url).includes('source=ORDER'))).toBe(true);
  });

  it.each([
    [['ORDER'], true, false],
    [['POS'], false, true],
    [[], false, false],
  ] as const)('honours server availableSources=%j', async (availableSources, orderVisible, posVisible) => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => String(input).includes('/activity')
      ? jsonResponse({ data: [], availableSources, page: 1, limit: 20, hasMore: false })
      : jsonResponse({ data: [] })));
    await renderPage();
    const labels = Array.from(container.querySelectorAll('[role="tab"]')).map(tab => tab.textContent);
    expect(labels.includes('客户订单')).toBe(orderVisible);
    expect(labels.includes('POS 成交')).toBe(posVisible);
  });

  it.each([
    ['403', () => jsonResponse({ message: 'Forbidden' }, 403)],
    ['500', () => jsonResponse({ message: 'Server error' }, 500)],
    ['network reject', () => Promise.reject(new Error('network down'))],
    ['malformed 200', () => jsonResponse({ data: [], availableSources: 'ORDER', hasMore: false })],
  ])('degrades ORDER users without showing a fake empty state on %s', async (_label, facadeReply) => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v2/sales/activity')) return facadeReply();
      if (url.includes('/api/v2/sales/orders?')) return jsonResponse({ data: [{
        id: 'OLD-1', order_no: 'SO-FALLBACK-001', customer_code: 'CU1', customer_name: '旧接口客户',
        company_code: 'C1', channel_code: null, status: 'DRAFT', total_amount: 88, currency_code: 'CNY',
        below_floor_price: false, over_credit: false, credit_warning: false, need_price_approval: false,
        need_credit_approval: false, credit_snapshot: null, ar_invoice_id: null, created_at: '2026-09-01T00:00:00Z',
      }] });
      return jsonResponse({ data: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    await renderPage();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('联合列表不可用，当前展示客户订单');
    expect(container.textContent).toContain('SO-FALLBACK-001');
    expect(container.textContent).not.toContain('暂无销售数据');
  });

  it.each([
    ['403', () => jsonResponse({ message: 'Forbidden' }, 403)],
    ['500', () => jsonResponse({ message: 'Server error' }, 500)],
    ['network reject', () => Promise.reject(new Error('network down'))],
    ['malformed 200', () => jsonResponse({ data: [] })],
  ])('never calls the legacy ORDER API for POS-only users on %s', async (_label, facadeReply) => {
    state.permissions = ['MENU_STORE_POS:V'];
    const fetchMock = vi.fn((input: RequestInfo | URL) => String(input).includes('/activity') ? facadeReply() : jsonResponse({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await renderPage();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).not.toContain('暂无销售数据');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/v2/sales/orders?'))).toBe(false);
  });
});
