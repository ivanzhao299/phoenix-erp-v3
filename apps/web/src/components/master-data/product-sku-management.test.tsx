/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ request: vi.fn(), push: vi.fn(), replace: vi.fn(), permissions: [] as string[], search: '' }));
vi.mock('@/lib/api-client', () => ({ default: state.request }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: state.push, replace: state.replace }), useSearchParams: () => new URLSearchParams(state.search) }));
vi.mock('@/contexts/LanguageContext', () => {
  const t = (_: string, fallback?: string) => fallback ?? _;
  const translateLiteral = (value: string) => value;
  return { useLanguage: () => ({ t, translateLiteral, lang: 'zh' }) };
});
vi.mock('@/contexts/AuthContext', async importOriginal => ({
  ...await importOriginal<typeof import('@/contexts/AuthContext')>(),
  useAuth: () => ({ user: { permissions: state.permissions, roles: [] } }),
}));
import { ProductSkuAssociation } from './ProductSkuAssociation';
import { MasterDataDetailDrawer } from './MasterDataDetailDrawer';
import { productConfig } from './detail-configs';
import { SkuManagementPage } from './SkuManagementPage';
import { SkuCreatePage } from './SkuCreatePage';
import ProductRuntimePage from '@/app/(admin)/master-data/products/page';
import SkuRuntimePage from '@/app/(admin)/master-data/product-skus/page';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const parent = { product_code: 'P1', product_name: '旧基础名', product_name_zh: '权威鲜蛋', status: 'ACTIVE' };
const lookupParent = { ...parent, product_name: parent.product_name_zh };
const rows = Array.from({ length: 27 }, (_, i) => ({ sku_code: `SKU-${i}`, sku_name: `销售规格${i}`, product_code: 'P1', grade_code: 'G1', spec_code: 'S1', status: i === 0 ? 'FROZEN' : i === 1 ? 'ARCHIVED' : 'ACTIVE' }));
function api(path: string) {
  if (path.startsWith('/master-data/runtime/sku/management')) {
    const qs = new URLSearchParams(path.split('?')[1]);
    const page = Number(qs.get('page') ?? 1), pageSize = Number(qs.get('pageSize') ?? 20);
    const filtered = qs.get('status') ? rows.filter(row => row.status === qs.get('status')) : rows;
    return Promise.resolve({ items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, relatedTotal: 27, statusCounts: { ACTIVE: 25, FROZEN: 1, ARCHIVED: 1 }, page, pageSize });
  }
  if (path === '/master-data/runtime/product') return Promise.resolve([parent]);
  if (path.startsWith('/master-data/runtime/product/')) return Promise.resolve(parent);
  if (path.startsWith('/master-data/runtime/sku/')) return Promise.resolve(rows[0]);
  if (path === '/lookup/products') return Promise.resolve({ data: [lookupParent, { ...lookupParent, product_code: 'P2' }] });
  if (path === '/lookup/product-grades') return Promise.resolve({ data: [{ grade_code: 'G1', grade_name: '一级', status: 'ACTIVE' }] });
  if (path === '/lookup/packaging-specs') return Promise.resolve({ data: [{ spec_code: 'S1', spec_name: '托', status: 'ACTIVE' }] });
  if (path.startsWith('/master-data/references/')) return Promise.resolve({ totalReferences: 0, references: [], canArchive: true });
  if (path.startsWith('/master-data/audit/')) return Promise.resolve({ items: [] });
  return Promise.resolve([]);
}

describe('product → SKU management rendered behavior', () => {
  let root: Root, host: HTMLDivElement;
  beforeEach(() => {
    state.permissions = ['MENU_MD_SKU:V,C,E', 'MENU_MD_PRODUCT:V']; state.request.mockReset(); state.request.mockImplementation(api);
    state.push.mockReset(); state.replace.mockReset(); state.search = '';
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    window.history.replaceState(null, '', '/master-data/product-skus');
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
  async function render(node: React.ReactNode) { await act(async () => root.render(node)); }
  async function click(text: string) {
    const el = Array.from(document.querySelectorAll('button')).find(el => el.textContent?.includes(text));
    if (!el) throw new Error(`Missing button ${text}`);
    await act(async () => el.click());
  }
  async function select(el: HTMLSelectElement, value: string) {
    await act(async () => { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); });
  }
  function field(label: string) {
    const el = Array.from(host.querySelectorAll('label')).find(el => el.textContent?.startsWith(label));
    if (!el) throw new Error(`Missing label ${label}`);
    return el.parentElement!.querySelector('input,select') as HTMLInputElement | HTMLSelectElement;
  }
  function calls() { return state.request.mock.calls.map(([path]) => String(path)); }
  it('product list links directly to filtered SKU management and opens the associated detail', async () => {
    await render(<ProductRuntimePage />);
    expect(host.querySelector('a[href="/master-data/product-skus?product_code=P1"]')).not.toBeNull();
    await click('P1'); expect(host.textContent).toContain('全部状态共 27');
  });
  it('route query changes refresh the product list and clearing returns to global management', async () => {
    state.search = 'product_code=P1&sku_code=SKU-0'; await render(<SkuRuntimePage />);
    expect(calls()).toContain('/master-data/runtime/sku/SKU-0');
    state.search = 'product_code=P2'; await render(<SkuRuntimePage />);
    expect(calls()).toContain('/master-data/runtime/sku/management?product_code=P2&page=1');
    state.search = ''; await render(<SkuRuntimePage />);
    expect(calls()).toContain('/master-data/runtime/sku/management?page=1');
  });
  it('ignores a slow previous product list when the product filter changes', async () => {
    let finish: (value: unknown) => void = () => undefined;
    state.request.mockImplementation((path: string) => path.includes('/sku/management?product_code=P1')
      ? new Promise(resolve => { finish = resolve; }) : api(path));
    await render(<SkuManagementPage productCode="P1" />);
    await render(<SkuManagementPage productCode="P2" />);
    await act(async () => finish({ items: [{ sku_code: 'WRONG-OLD-PRODUCT' }], total: 1, relatedTotal: 1, statusCounts: {}, page: 1, pageSize: 20 }));
    expect(host.textContent).not.toContain('WRONG-OLD-PRODUCT'); expect(host.textContent).toContain('共 27 条');
  });
  it.each(['P1', ''])('legacy create=1 preserves the explicit parent %s and never opens an empty SKU drawer', async code => {
    window.history.replaceState(null, '', `/master-data/product-skus?product_code=${code}&create=1`);
    await render(<SkuManagementPage productCode={code} />);
    expect(state.replace).toHaveBeenLastCalledWith(`/master-data/product-skus/new?product_code=${code}`);
    expect(document.body.querySelector('input')).toBeNull();
  });
  it('product detail shows exact >10 total and inactive counts with ten preview rows', async () => {
    await render(<MasterDataDetailDrawer open code="P1" config={productConfig} onClose={() => undefined} />);
    expect(host.textContent).toContain('全部状态共 27 个 SKU/销售规格'); expect(host.textContent).toContain('已生效 25 · 已冻结 1 · 已归档 1');
    expect(host.querySelectorAll('li a')).toHaveLength(10); expect(host.textContent).toContain('此处展示前 10 条');
    expect(host.querySelector('a[href="/master-data/product-skus?product_code=P1"]')).not.toBeNull();
    expect(host.querySelector('a[href="/master-data/product-skus?product_code=P1&sku_code=SKU-0"]')).not.toBeNull();
    expect(calls().some(path => path.includes('/product-master/skus?'))).toBe(false);
  });
  it('product-only V does not query or disclose SKU details; C and V control separate links', async () => {
    state.permissions = ['MENU_MD_PRODUCT:V'];
    await render(<MasterDataDetailDrawer open code="P1" config={productConfig} onClose={() => undefined} />);
    expect(host.textContent).toContain('旧基础名'); expect(host.textContent).toContain('无 SKU 查看权限');
    expect(host.textContent).not.toContain('部分数据加载失败'); expect(host.querySelector('a[href*="product-skus"]')).toBeNull();
    expect(calls().some(path => path.includes('/sku'))).toBe(false);
    state.permissions = ['MENU_MD_SKU:C']; await render(<ProductSkuAssociation product={parent} />);
    expect(host.querySelector('a[href*="/new?"]')).not.toBeNull(); expect(host.textContent).not.toContain('管理此产品全部');
    state.permissions = ['MENU_MD_SKU:V']; await render(<ProductSkuAssociation product={parent} />);
    expect(host.querySelector('a[href*="/new?"]')).toBeNull(); expect(host.textContent).toContain('管理此产品全部');
  });
  it('legacy V reads and legacy E creates without granting V', async () => {
    state.permissions = ['MENU_MASTER_SKU:V']; await render(<ProductSkuAssociation product={parent} />);
    expect(host.textContent).toContain('全部状态共 27'); expect(host.querySelector('a[href*="/new?"]')).toBeNull();
    state.permissions = ['MENU_MASTER_SKU:E']; await render(<ProductSkuAssociation product={parent} />);
    expect(host.textContent).toContain('无 SKU 查看权限'); expect(host.querySelector('a[href*="/new?"]')).not.toBeNull();
  });
  it('association failure stays distinct from zero and leaves the product visible', async () => {
    state.request.mockImplementation((path: string) => path.includes('/sku/management') ? Promise.reject(new Error('offline')) : api(path));
    await render(<MasterDataDetailDrawer open code="P1" config={productConfig} onClose={() => undefined} />);
    expect(host.textContent).toContain('旧基础名'); expect(host.textContent).toContain('关联 SKU 加载失败'); expect(host.textContent).not.toContain('全部状态共 0');
  });
  it('loads historical states, paginates, resets page on product/status changes', async () => {
    await render(<SkuManagementPage productCode="P1" />);
    expect(calls()).toContain('/master-data/runtime/sku/management?product_code=P1&page=1');
    expect(host.textContent).toContain('已冻结'); expect(host.textContent).toContain('已归档'); expect(host.textContent).toContain('共 27 条');
    await click('下一页'); expect(calls()).toContain('/master-data/runtime/sku/management?product_code=P1&page=2');
    await render(<SkuManagementPage productCode="P2" />); expect(calls().at(-1)).toBe('/master-data/runtime/sku/management?product_code=P2&page=1');
    await select(host.querySelectorAll('select')[1], 'FROZEN'); expect(calls().at(-1)).toBe('/master-data/runtime/sku/management?status=FROZEN&product_code=P2&page=1');
    expect(host.textContent).toContain('共 1 条');
  });
  it('filter, clear and context create navigate with explicit product parameters', async () => {
    await render(<SkuManagementPage productCode="P1" />);
    await select(host.querySelector('select')!, 'P2'); expect(state.replace).toHaveBeenLastCalledWith('/master-data/product-skus?product_code=P2');
    await click('清除产品过滤'); expect(state.replace).toHaveBeenLastCalledWith('/master-data/product-skus');
    await click('新增'); expect(state.push).toHaveBeenLastCalledWith('/master-data/product-skus/new?product_code=P1');
    await render(<SkuManagementPage />); expect(calls()).toContain('/master-data/runtime/sku/management?page=1');
  });
  it('reuses the existing editor and lifecycle flow', async () => {
    await render(<SkuManagementPage productCode="P1" />);
    const edit = document.querySelector('button[title="编辑"]') as HTMLButtonElement;
    expect(edit).not.toBeNull(); await act(async () => edit.click()); expect(document.body.textContent).toContain('编辑SKU/销售规格');
    await click('取消');
    const more = document.querySelector('button[title="更多操作"]') as HTMLButtonElement;
    expect(more).not.toBeNull(); await act(async () => more.click());
    const restore = Array.from(document.querySelectorAll('button')).find(el => el.textContent?.includes('恢复'))!;
    await act(async () => restore.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    expect(state.request).toHaveBeenCalledWith('/master-data/runtime/sku/SKU-0/transition', expect.objectContaining({ method: 'POST', body: JSON.stringify({ action: 'restore' }) }));
  });
  it('without SKU V blocks direct list and detail requests even with C', async () => {
    state.permissions = ['MENU_MD_SKU:C']; await render(<SkuManagementPage initialSkuCode="SECRET" productCode="P1" />);
    expect(host.textContent).toContain('无 SKU 查看权限'); expect(calls().some(path => path.includes('/sku'))).toBe(false);
  });
  it('failed list fetch clears rows and surfaces error', async () => {
    await render(<SkuManagementPage productCode="P1" />);
    state.request.mockImplementation((path: string) => path.includes('/sku/management') ? Promise.reject(new Error('加载失败')) : api(path));
    await click('刷新'); expect(host.textContent).toContain('加载失败'); expect(host.querySelector('tbody')).toBeNull();
  });
  it('verifies context parent, locks authoritative name/code and saves through shared form', async () => {
    await render(<SkuCreatePage productCode="P1" />);
    expect(field('产品').value).toBe('P1'); expect((field('产品') as HTMLInputElement).readOnly).toBe(true);
    expect(field('产品名称').value).toBe('权威鲜蛋'); expect((field('产品名称') as HTMLInputElement).readOnly).toBe(true);
    await select(field('等级') as HTMLSelectElement, 'G1'); await select(field('销售换算规格（同商品共享基础库存）') as HTMLSelectElement, 'S1');
    expect(field('SKU 名称').value).toBe('权威鲜蛋 (G1 / S1)'); await click('保存');
    expect(state.request).toHaveBeenCalledWith('/master-data/runtime/sku', expect.objectContaining({ method: 'POST', body: expect.stringContaining('"product_name":"权威鲜蛋"') }));
    expect(state.replace).toHaveBeenLastCalledWith(expect.stringMatching(/^\/master-data\/product-skus\?product_code=P1&_refresh=/));
  });
  it('SKU C without product V uses minimal active lookup for authoritative context', async () => {
    state.permissions = ['MENU_MD_SKU:C']; await render(<SkuCreatePage productCode="P1" />);
    expect(field('产品名称').value).toBe('权威鲜蛋'); expect(calls()).toContain('/lookup/products');
    expect(calls().some(path => path.includes('/runtime/product/'))).toBe(false);
  });
  it.each(['FROZEN', 'ARCHIVED', 'DRAFT'])('parent %s prevents context creation without a blank fallback', async status => {
    state.request.mockImplementation((path: string) => path.startsWith('/master-data/runtime/product/') ? Promise.resolve({ ...parent, status }) : api(path));
    await render(<SkuCreatePage productCode="P1" />); expect(host.textContent).toContain('父产品当前未启用'); expect(host.querySelector('input,select')).toBeNull();
    await render(<ProductSkuAssociation product={{ ...parent, status }} />); expect(host.querySelector('a[href*="/new?"]')).toBeNull();
  });
  it('rejects absent/mismatched parent, explicit empty context and failed parent query', async () => {
    state.request.mockResolvedValue({ ...parent, product_code: 'OTHER' }); await render(<SkuCreatePage productCode="P1" />);
    expect(host.textContent).toContain('父产品不存在、未启用或信息不完整'); expect(host.querySelector('input')).toBeNull();
    await render(<SkuCreatePage productCode="" />); expect(host.textContent).toContain('父产品编码为空');
    state.request.mockRejectedValue(new Error('404')); await render(<SkuCreatePage productCode="P2" />);
    expect(host.textContent).toContain('父产品核验失败'); expect(host.querySelector('input')).toBeNull();
  });
  it('V does not grant creation or a parent query', async () => {
    state.permissions = ['MENU_MD_SKU:V']; await render(<SkuCreatePage productCode="P1" />);
    expect(host.textContent).toContain('无 SKU 新增权限'); expect(state.request).not.toHaveBeenCalled();
  });
  it('global create uses shared product selector and read-only name', async () => {
    await render(<SkuCreatePage />); expect(field('产品').tagName).toBe('SELECT');
    await select(field('产品') as HTMLSelectElement, 'P1'); expect(field('产品名称').value).toBe('权威鲜蛋');
  });
});
