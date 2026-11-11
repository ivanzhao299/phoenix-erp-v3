/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const state = vi.hoisted(() => ({ permissions: ['MENU_SALES2_ORDER:V', 'MENU_SALES2_ORDER:C'] as string[] }));
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ lang: 'zh', t: (_k: string, fallback: string) => fallback }) }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: (menu: string) => ({ canView: state.permissions.includes(`${menu}:V`), canCreate: state.permissions.includes(`${menu}:C`), canApprove: false, canEdit: true }) }));
vi.mock('@/hooks/useMasterNames', () => ({ useMasterNames: () => [] }));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children?: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock('@/components/PageHeader', () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/components/design-system', () => ({ LoadingSkeleton: () => <div>loading</div>, EmptyState: ({ title }: { title: string }) => <div>{title}</div> }));
vi.mock('@/components/design-system/dialogs/ConfirmDialogV2', () => ({ ConfirmDialogV2: () => null }));
vi.mock('@/components/design-system/dialogs/ModalV2', () => ({ ModalV2: ({ open, children, footer }: { open?: boolean; children?: React.ReactNode; footer?: React.ReactNode }) => open ? <div role="dialog">{children}{footer}</div> : null }));
vi.mock('@/components/shared-selectors/QuantityBasisInput', () => ({ QuantityBasisInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => <select aria-label="quantity basis" value={value} onChange={e => onChange(e.target.value)}><option value="PACKAGE">PACKAGE</option><option value="BASE">BASE</option></select>, quantityText: () => '', }));
vi.mock('@/components/shared-selectors/DictSelect', () => ({ DictSelect: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => <select aria-label="currency" value={value} onChange={e => onChange(e.target.value)}><option value="">Choose currency</option><option value="CNY">CNY</option></select> }));
vi.mock('@/components/shared-selectors/MasterDataSelectors', () => ({
  CompanySelector: ({ value, onChange }: any) => <select aria-label="company" value={value} onChange={e => onChange(e.target.value)}><option value="">Choose company</option><option value="COMP-A">COMP-A</option><option value="COMP-B">COMP-B</option></select>,
  WarehouseSelector: ({ value, onChange }: any) => <select aria-label="warehouse" value={value} onChange={e => onChange(e.target.value)}><option value="">Choose warehouse</option><option value="WH-A">WH-A</option></select>,
  CustomerSelector: ({ value, onChange }: any) => <select aria-label="customer" value={value} onChange={e => onChange(e.target.value)}><option value="">Customer</option><option value="CU-A">CU-A</option></select>,
  ChannelSelector: ({ value, onChange }: any) => <select aria-label="channel" value={value} onChange={e => onChange(e.target.value)}><option value="">Channel</option><option value="CH-A">CH-A</option></select>,
  SkuSelector: ({ value, onChange, onPick }: any) => <select aria-label="sku" value={value} onChange={e => { const code = e.target.value; onChange(code); onPick({ raw: code === 'SKU-MANAGED' ? { sku_code: code, product_code: 'P-M', grade_code: 'G-M', qty_per_unit: 10, base_unit: 'EA', display_unit: 'BOX', readonly_flag: true } : { sku_code: code, product_code: 'P-L', grade_code: 'G-L', qty_per_unit: 1, base_unit: 'EA', display_unit: 'EA' } }); }}><option value="">Choose SKU</option><option value="SKU-MANAGED">Managed SKU</option><option value="SKU-LEGACY">Legacy SKU</option></select>,
}));
vi.mock('@/components/ui/admin-ui.module.css', () => ({ default: new Proxy({}, { get: (_t, p) => String(p) }) }));
vi.mock('@/styles/uix-utils.module.css', () => ({ default: new Proxy({}, { get: (_t, p) => String(p) }) }));
vi.mock('@/app/(admin)/sales2/orders/orders.module.css', () => ({ default: new Proxy({}, { get: (_t, p) => String(p) }) }));

import SalesV2OrdersPage from '@/app/(admin)/sales2/orders/page';

const response = (body: unknown, status = 200) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let quoteResolvers: Array<(v: unknown) => void>;

async function renderPage() {
  await act(async () => { root = createRoot(container); root.render(<SalesV2OrdersPage />); });
  await act(async () => { await Promise.resolve(); });
}
function select(label: string, value: string) {
  const el = container.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
function input(label: string, value: string) {
  const el = container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return el;
}
function createButton() { return Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('创建草稿')) as HTMLButtonElement; }

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); sessionStorage.setItem('phoenix_token', 'test'); quoteResolvers = [];
  fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/v2/sales/activity')) return response({ data: [], availableSources: ['ORDER'], page: 1, limit: 20, hasMore: false });
    if (url.includes('/api/v2/sales/customers')) return response({ data: [] });
    if (url.includes('/api/product-master/skus')) return response({ data: [] });
    if (url.includes('/pricing/resolve-price')) return new Promise(resolve => quoteResolvers.push(() => resolve(response({ data: { unitPrice: 42, floorPrice: 20, priceBookId: 'PB', currencyCode: 'CNY', publishVersion: 1, priceItemId: 'PI' } }))));
    if (url.includes('/api/v2/sales/orders') && init?.method === 'POST') return response({ data: { id: 'new' } });
    return response({ data: [] });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(async () => { await act(async () => root?.unmount()); container.remove(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('real SalesV2OrdersPage commercial flows', () => {
  it('sends currency and exact managed quote, and blocks create after failed managed quote', async () => {
    await renderPage();
    await act(async () => { (Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('新建订单')) as HTMLButtonElement).click(); });
    await act(async () => { select('company', 'COMP-A'); select('currency', 'CNY'); select('warehouse', 'WH-A'); select('sku', 'SKU-MANAGED'); input('数量', '2').dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => { input('数量', '2').dispatchEvent(new Event('blur', { bubbles: true })); });
    await act(async () => { quoteResolvers.shift()?.({}); });
    await act(async () => { createButton().click(); });
    expect(fetchMock.mock.calls.some(([u, i]) => String(u).includes('/api/v2/sales/orders') && i?.method === 'POST')).toBe(false);
    expect(container.textContent).toContain('新 SKU 必须先取得有效已发布报价');
  });

  it('arbitrates stale company quote and clears real warehouse/SKU/manual state', async () => {
    await renderPage();
    await act(async () => { (Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('新建订单')) as HTMLButtonElement).click(); });
    await act(async () => { select('company', 'COMP-A'); select('currency', 'CNY'); select('warehouse', 'WH-A'); select('sku', 'SKU-MANAGED'); input('数量', '2').dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => { input('数量', '2').dispatchEvent(new Event('blur', { bubbles: true })); });
    await act(async () => { select('company', 'COMP-B'); });
    expect((container.querySelector('select[aria-label="warehouse"]') as HTMLSelectElement).value).toBe('');
    expect((container.querySelector('select[aria-label="sku"]') as HTMLSelectElement).value).toBe('');
    expect((container.querySelector('input[aria-label="实际单价"]') as HTMLInputElement).value).toBe('');
    await act(async () => { quoteResolvers.splice(0).forEach(resolve => resolve({})); });
    expect(container.textContent).not.toContain('参考价: 42');
  });

  it('keeps same-company legacy manual fallback and submits it', async () => {
    await renderPage();
    await act(async () => { (Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('新建订单')) as HTMLButtonElement).click(); });
    await act(async () => { select('company', 'COMP-A'); select('currency', 'CNY'); select('warehouse', 'WH-A'); select('sku', 'SKU-LEGACY'); input('数量', '1').dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => { const price = input('实际单价', '9'); price.dispatchEvent(new Event('change', { bubbles: true })); input('数量', '1').dispatchEvent(new Event('blur', { bubbles: true })); await Promise.resolve(); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); createButton().click(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect((container.querySelector('input[aria-label="实际单价"]') as HTMLInputElement).value).toBe('9');
    expect(fetchMock.mock.calls.some(([u, i]) => String(u).includes('/pricing/resolve-price') && i?.method === 'POST')).toBe(true);
  });
});
