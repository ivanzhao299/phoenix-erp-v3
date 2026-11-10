/** @vitest-environment jsdom */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ default: requestMock }));
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (_: string, fallback: string) => fallback, lang: 'zh' }) }));
import { renderMdFieldInput } from './MasterDataRuntimePanel';
import { skuFields } from './sku-fields';
import { SkuSelector } from '../shared-selectors/MasterDataSelectors';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const fields = skuFields((_, fallback) => fallback);
function Form({ initial = {} }: { initial?: Record<string, string> }) {
  const [form, setForm] = useState(initial);
  return <>{fields.map(f => <div key={f.key} data-field={f.key}>{renderMdFieldInput(f, form, setForm)}</div>)}<output>{JSON.stringify(form)}</output></>;
}

describe('SKU reference form', () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    requestMock.mockReset();
    requestMock.mockImplementation((path: string) => Promise.resolve({ data: path === '/lookup/products'
      ? [{ product_code: 'P1', product_name: '鸡蛋', status: 'ACTIVE' }, { product_code: 'P2', product_name: '鲜蛋', status: 'ACTIVE' }]
      : path === '/lookup/product-grades' ? [{ grade_code: 'G1', grade_name: '一等', status: 'ACTIVE' }]
        : [{ spec_code: 'S1', spec_name: '托', status: 'ACTIVE' }] }));
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
  async function select(field: string, value: string) {
    const input = host.querySelector(`[data-field="${field}"] select`) as HTMLSelectElement;
    await act(async () => { input.value = value; input.dispatchEvent(new Event('change', { bubbles: true })); });
  }
  function value(field: string) { return (host.querySelector(`[data-field="${field}"] input`) as HTMLInputElement).value; }
  it('uses authenticated lookup choices and atomically fills canonical product and default SKU names', async () => {
    await act(async () => root.render(<Form />));
    await select('product_code', 'P1'); await select('grade_code', 'G1'); await select('spec_code', 'S1');
    expect(value('product_name')).toBe('鸡蛋');
    expect(value('sku_name')).toBe('鸡蛋 (G1 / S1)');
    expect((host.querySelector('[data-field="product_name"] input') as HTMLInputElement).readOnly).toBe(true);
    expect(host.querySelector('[data-field="product_code"] input')).toBeNull();
    await select('product_code', 'P2'); expect(value('sku_name')).toBe('鲜蛋 (G1 / S1)');
    expect(requestMock.mock.calls.map(([path]) => path)).toEqual(['/lookup/products', '/lookup/product-grades', '/lookup/packaging-specs']);
  });
  it('preserves an explicit legal SKU name while updating a parent selection', async () => {
    await act(async () => root.render(<Form initial={{ product_code: 'P1', product_name: '鸡蛋', grade_code: 'G1', spec_code: 'S1', sku_name: '客户专供鲜蛋' }} />));
    await select('product_code', 'P2'); expect(value('sku_name')).toBe('客户专供鲜蛋'); expect(value('product_name')).toBe('鲜蛋');
  });
  it('retains an unavailable historical code without offering it as a new selection', async () => {
    await act(async () => root.render(<Form initial={{ product_code: 'OLD', product_name: '旧名称' }} />));
    const select = host.querySelector('[data-field="product_code"] select') as HTMLSelectElement;
    expect(select.value).toBe('OLD'); expect(select.selectedOptions[0].disabled).toBe(true);
    expect(select.selectedOptions[0].textContent).toContain('历史值或当前不可用');
    expect(value('product_name')).toBe('旧名称');
  });
  it('distinguishes an empty lookup from failure', async () => {
    requestMock.mockResolvedValue({ data: [] });
    await act(async () => root.render(<Form />));
    expect(host.textContent).toContain('暂无启用产品'); expect(host.textContent).toContain('暂无启用等级'); expect(host.textContent).toContain('暂无启用规格');
  });
  it('shows lookup failure while preserving the historical value and name', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined); requestMock.mockRejectedValue(new Error('offline'));
    await act(async () => root.render(<Form initial={{ product_code: 'OLD', product_name: '旧产品' }} />));
    expect(host.textContent).toContain('产品加载失败，请重试'); expect(host.textContent).not.toContain('暂无启用产品');
    expect((host.querySelector('[data-field="product_code"] select') as HTMLSelectElement).value).toBe('OLD');
    expect(value('product_name')).toBe('旧产品');
  });
  it('sends the business applicability to the SKU endpoint', async () => {
    requestMock.mockResolvedValue({ data: [] });
    await act(async () => root.render(<SkuSelector value="" onChange={() => undefined} usage="sale-stock" />));
    expect(requestMock).toHaveBeenCalledWith('/product-master/skus?status=ACTIVE&usage=sale-stock');
    expect(host.textContent).toContain('暂无可用 SKU');
  });
});
