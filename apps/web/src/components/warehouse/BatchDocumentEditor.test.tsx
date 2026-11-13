/** @vitest-environment jsdom */
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BatchDocumentEditor, { type BatchDocumentPolicy, type BatchHeader, type BatchLine } from './BatchDocumentEditor';
import { canCreateOutboundType, constrainOutboundBatchLine, OUTBOUND_DESTINATIONS, resetOutboundDestination, STANDALONE_OUTBOUND_TYPES, validateOutboundBatch } from '@/lib/warehouse-outbound';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (_key: string, fallback: string) => fallback }) }));
vi.mock('@/hooks/useDictOptions', () => ({ useDictOptions: (type: string) => ({ loading: false, optionPairs: (type === 'INV_OUTBOUND_TYPE' ? [...STANDALONE_OUTBOUND_TYPES, 'TRANSFER', 'STOCKTAKE_LOSS'] : type === 'INV_INBOUND_TYPE' ? ['PURCHASE', 'RETURN'] : [...new Set(Object.values(OUTBOUND_DESTINATIONS).flat())]).map(value => ({ value, label: `字典-${value}` })) }) }));
vi.mock('@/components/shared-selectors/MasterDataSelectors', () => {
  type SelectorProps = { value: string; onChange: (value: string) => void; onPick?: (option: unknown) => void };
  const Selector = (p: SelectorProps) => createElement('select', { value: p.value, onChange: (e: { target: { value: string } }) => { p.onChange(e.target.value); p.onPick?.({ value: e.target.value, label: `名称-${e.target.value}` }); } }, ['', 'C-1', 'WH-1'].map(value => createElement('option', { key: value, value }, value)));
  const InventoryItemSelector = (p: SelectorProps) => createElement('select', { 'data-item': true, value: p.value, onChange: (e: { target: { value: string } }) => {
    const itemType = e.target.value.startsWith('SKU') ? 'SKU' : 'MATERIAL';
    p.onChange(e.target.value);
    // 与真实 /lookup/inventory-items 对齐：不适用的一侧是 null（后端 SQL NULL::varchar），
    // 绝不是空串——空串会被后端当成脏 SKU 编码拒绝。
    p.onPick?.({ value: e.target.value, raw: { itemType, itemName: `名称-${e.target.value}`, unit: '个', skuCode: itemType === 'SKU' ? e.target.value : null, materialCode: itemType === 'MATERIAL' ? e.target.value : null } });
  } }, ['', 'SKU-1', 'M-1'].map(value => createElement('option', { key: value, value }, value)));
  return { InventoryItemSelector, WarehouseSelector: Selector, CustomerSelector: Selector, StoreSelector: Selector, DepartmentSelector: Selector, ProjectSelector: Selector, UserSelector: Selector, SupplierSelector: Selector, HouseSelector: Selector };
});

const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.replaceChildren(); });
const permissions = { inout: true, issue: true };
const policy: BatchDocumentPolicy = {
  typeValues: STANDALONE_OUTBOUND_TYPES.filter(type => canCreateOutboundType(type, permissions)),
  destinationValues: header => OUTBOUND_DESTINATIONS[String(header.type)] ?? [],
  transformHeader: resetOutboundDestination,
  transformLine: constrainOutboundBatchLine,
  validate: (header, items) => validateOutboundBatch(header, items, permissions),
  showDestinationName: true,
};
async function mount(kind: 'inbound' | 'outbound', customPolicy?: BatchDocumentPolicy) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  let current: { header: BatchHeader; items: BatchLine[] };
  const submit = vi.fn();
  function Harness() {
    const initialType = customPolicy?.typeValues?.[0] ?? 'SALE';
    const [header, setHeader] = useState<BatchHeader>({ type: initialType, date: '2026-11-11', warehouse_code: 'WH-1', destination_type: OUTBOUND_DESTINATIONS[initialType]?.[0] ?? 'CUSTOMER', destination_code: 'C-1', destination_name: '旧客户' });
    const [items, setItems] = useState<BatchLine[]>([1, 2].map(i => ({ _key: String(i), item: 'SKU-1', item_type: 'SKU', item_name: '鸡蛋', sku_code: 'SKU-1', unit: '枚', qty: '2' })));
    current = { header, items };
    return createElement(BatchDocumentEditor, { kind, header, setHeader, items, setItems, policy: customPolicy, onSubmit: submit, onCancel: vi.fn() });
  }
  await act(async () => root.render(createElement(Harness)));
  return { host, state: () => current!, submit };
}
const field = (host: HTMLElement, label: string) => Array.from(host.querySelectorAll('label')).find(node => node.firstChild?.textContent === label)!.querySelector('select')!;
const values = (select: HTMLSelectElement) => Array.from(select.options).map(option => option.value);
async function change(select: HTMLSelectElement, value: string) { await act(async () => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); }); }

describe('BatchDocumentEditor opt-in outbound policy DOM', () => {
  it('filters dictionary types/destinations and clears every existing and newly added incompatible row', async () => {
    const { host, state, submit } = await mount('outbound', policy);
    expect(host.querySelector('form')).toBeNull();
    const type = field(host, '出库类型');
    expect(values(type)).toEqual(STANDALONE_OUTBOUND_TYPES);
    expect(type.options[0].textContent).toBe('字典-SALE');
    expect(values(field(host, '去向类型'))).toEqual(['CUSTOMER', 'STORE']);
    await change(type, 'PRODUCTION_USE');
    expect(values(field(host, '去向类型'))).toEqual(['HOUSE', 'DEPARTMENT', 'PROJECT']);
    expect(state().header).toMatchObject({ destination_type: 'HOUSE', destination_code: '', destination_name: '' });
    expect(state().items.every(line => line.item === '' && line.sku_code === undefined && line.item_name === '')).toBe(true);
    const add = Array.from(host.querySelectorAll('button')).find(button => button.textContent === '新增明细')!;
    await act(async () => add.click());
    expect(state().items).toHaveLength(3);
    for (const select of host.querySelectorAll<HTMLSelectElement>('select[data-item]')) await change(select, 'SKU-1');
    expect(state().items.every(line => line.item === '')).toBe(true);
    for (const select of host.querySelectorAll<HTMLSelectElement>('select[data-item]')) await change(select, 'M-1');
    expect(state().items.every(line => line.item === 'M-1' && line.item_name === '名称-M-1' && line.item_type === 'MATERIAL')).toBe(true);
    // 契约（2026-11-13 生产 400 回归）：物料行只能带 material_code 身份；
    // sku_code 必须缺省（JSON 序列化后不含该键），否则后端按脏 SKU 编码拒绝。
    expect(state().items.every(line => line.material_code === 'M-1' && line.sku_code === undefined)).toBe(true);
    expect(JSON.parse(JSON.stringify(state().items)).every((line: Record<string, unknown>) => !('sku_code' in line))).toBe(true);
    expect(host.querySelectorAll('tbody input[readonly]')).toHaveLength(6);
    await change(type, 'SALE');
    expect(state().items.every(line => line.item === '' && line.material_code === undefined)).toBe(true);
    expect(submit).not.toHaveBeenCalled();
  });

  it('starts issue-only users on allowed options and never exposes ordinary or dedicated workflow types', async () => {
    const allowed = STANDALONE_OUTBOUND_TYPES.filter(type => canCreateOutboundType(type, { inout: false, issue: true }));
    // The page supplies the initial permitted type; the component filters SYS options.
    const { host } = await mount('outbound', { ...policy, typeValues: allowed });
    const type = field(host, '出库类型');
    const options = Array.from(type.options);
    expect(type.value).toBe('PRODUCTION_USE');
    expect(options.map(option => option.value)).toEqual(allowed);
    expect(options.some(option => ['TRANSFER', 'STOCKTAKE_LOSS'].includes(option.value))).toBe(false);
  });

  it('clears typed recipients when changing business type or destination, even if destination is still allowed', async () => {
    const { host, state } = await mount('outbound', policy);
    const type = field(host, '出库类型');
    await change(field(host, '去向类型'), 'STORE');
    expect(state().header).toMatchObject({ destination_type: 'STORE', destination_code: '', destination_name: '' });
    await change(type, 'SCRAP');
    const input = Array.from(host.querySelectorAll('label')).find(label => label.firstChild?.textContent === '去向')!.querySelector('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'stale recipient');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(state().header.destination_code).toBe('stale recipient');
    await change(type, 'RETURN');
    expect(state().header).toMatchObject({ destination_type: 'SUPPLIER', destination_code: '' });
    await change(type, 'SCRAP');
    expect(state().header).toMatchObject({ destination_type: 'OTHER', destination_code: '' });
  });

  it('keeps inbound dictionary options and existing lines unchanged without a policy', async () => {
    const { host, state } = await mount('inbound');
    const type = field(host, '入库类型');
    expect(values(type).filter(value => value !== 'SALE')).toEqual(['PURCHASE', 'RETURN']);
    await change(type, 'PURCHASE');
    expect(state().items.every(line => line.item === 'SKU-1' && line.item_name === '鸡蛋')).toBe(true);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
});
