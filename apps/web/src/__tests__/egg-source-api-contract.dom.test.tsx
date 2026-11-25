/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import EggSourcesPage from '@/app/(admin)/master-data/egg-sources/page';
import EggSourceHistoryPage from '@/app/(admin)/breeding/egg-source-history/page';

vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ canView: true, canEdit: true, canApprove: true }) }));
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (_key: string, fallback: string) => fallback }) }));
vi.mock('@/hooks/useProductGrades', () => ({
  useProductGrades: () => ({ grades: [{ grade_code: 'GRADE_1', grade_name: '1号蛋' }] }),
}));
vi.mock('@/components/PageHeader', () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/components/shared-selectors/MasterDataSelectors', () => {
  type Props = {
    onChange: (value: string) => void;
    onPick?: (option: { raw: { companyCode: string; siteCode: string } }) => void;
    disabled?: boolean;
  };
  return {
    HouseSelector: (p: Props) => <>{['H1','H2'].map(code => <button key={code} type="button" disabled={p.disabled} onClick={() => {
      p.onChange(code);
      p.onPick?.({ raw: { companyCode: 'CO', siteCode: 'SITE' } });
    }}>{code}</button>)}</>,
    WarehouseSelector: (p: Props) => <button type="button" disabled={p.disabled} onClick={() => p.onChange('WH')}>选择目标仓</button>,
    SpecSelector: (p: Props) => <button type="button" onClick={() => p.onChange('SPEC')}>选择规格</button>,
  };
});
vi.mock('@/components/design-system/forms/AttachmentUploader', () => ({
  AttachmentUploader: ({ onChange }: { onChange: (files: string[]) => void }) =>
    <button type="button" onClick={() => onChange(['EVIDENCE-1'])}>上传核认证据</button>,
}));

const endpoint = '/api/product-master/egg-sources';
const fetchMock = vi.fn<(path: string, options: RequestInit) => Promise<Response>>();
const respond = (data: unknown, code = 200, status = code) => Response.json({ code, data }, { status });
const timeline = (houseCode: string) => ({
  owner: { companyCode: 'CO', siteCode: 'SITE', houseCode },
  businessDay: '2026-11-25', zone: 'Asia/Vientiane',
  profiles: [{ profile_code: 'P1', effective_date: '2026-11-01', expire_date: null, shellClass: 'RED', status: 'ACTIVE' }],
  changes: [],
});
const evidence = (batchNo: string, exactQuantity: number | null) => ({
  evidence: { batchNo, productCode: 'EGG_RED', skuCode: 'SKU-1', originalShell: 'RED', exactQuantity,
    ledger: [{ id: '123', ref_no: null, change_type: 'INBOUND', qty_change: '30' }] },
  reviews: [],
});
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('crypto', { randomUUID: () => '11111111-2222-4333-8444-555555555555' });
  history.replaceState(null, '', '/');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});
async function flushHouseLoad() {
  await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
}
async function click(label: string) {
  const button = [...host.querySelectorAll('button')].find(node => node.textContent?.trim() === label);
  expect(button, label).toBeDefined();
  expect(button?.disabled, label).toBe(false);
  await act(async () => button?.click());
}
async function change(selector: string, value: string) {
  const field = host.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector);
  expect(field, selector).toBeTruthy();
  if (!field) return;
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')?.set?.call(field, value);
    field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}

it('reads actual HTTP envelopes after selecting a house, choosing its flock plan and previewing SKU', async () => {
  fetchMock.mockImplementation(async path => {
    const url = new URL(path, location.origin);
    const house = url.searchParams.get('houseCode') ?? '';
    if (url.pathname === endpoint) return respond(timeline(house));
    if (url.pathname === endpoint+'/flock-plans') {
      const index = house === 'H1' ? 1 : 2;
      return respond([{ id: 'PLAN-'+index, flock_no: 'FLOCK-'+index, kind: 'ADMIT', status: 'APPROVED' }]);
    }
    if (url.pathname === endpoint+'/preview') return respond({ verified: { items: [{ productCode: 'EGG_RED', skuCode: 'SKU-1' }] } },200,201);
    throw Error(path);
  });
  await act(async () => root.render(<EggSourcesPage/>));
  await click('H1');
  await flushHouseLoad();
  expect(host.textContent).toContain('CO · SITE · 2026-11-25');
  expect(host.textContent).toContain('红壳蛋');
  await change('input[type=date]', '2026-12-01');
  expect(host.textContent).toContain('FLOCK-1');
  await change('select:has(option[value="PLAN-1"])', 'PLAN-1');
  await change('select[required]', 'GRADE_1');
  await click('选择规格');
  await click('选择目标仓');
  await change('textarea', '依据');
  await click('预检 SKU 与库存范围');
  expect(host.textContent).toContain('EGG_RED · SKU-1');
  const sent = fetchMock.mock.calls.find(([path]) => path === endpoint+'/preview');
  expect(JSON.parse(String(sent?.[1].body))).toMatchObject({ houseCode: 'H1', planDocument: 'PLAN-1', effectiveDate: '2026-12-01' });

  await click('H2');
  await flushHouseLoad();
  const planControl = host.querySelector<HTMLSelectElement>('select:has(option[value="PLAN-2"])');
  expect(planControl?.value).toBe('');
  expect(host.querySelector('option[value="PLAN-1"]')).toBeNull();
  expect(host.textContent).not.toContain('EGG_RED · SKU-1');
});

it.each([
  { response: () => Response.json({ message: '鸡舍超出当前组织权限' }, { status: 403 }), error: '鸡舍超出当前组织权限' },
  { response: () => respond({ ...timeline('H1'), profiles: undefined }), error: '返回格式异常' },
])('keeps the house selector and retries a failed direct link in place', async ({ response, error }) => {
  history.replaceState(null, '', '/?houseCode=H1');
  fetchMock.mockResolvedValueOnce(response()).mockResolvedValueOnce(respond(timeline('H1')));
  await act(async () => root.render(<EggSourcesPage/>));
  await flushHouseLoad();
  await flushHouseLoad();
  expect(host.querySelector('[role=alert]')?.textContent).toContain(error);
  await click('重试');
  expect(host.textContent).toContain('CO · SITE · 2026-11-25');
  expect(host.querySelector('[role=alert]')).toBeNull();
});

it('submits a mixed batch without old quantity and distinguishes a saved review from a failed refresh', async () => {
  let saved = false;
  fetchMock.mockImplementation(async (path, options) => {
    const url = new URL(path, location.origin);
    expect(url.pathname).toBe(endpoint+'/history');
    if (options.method === 'POST') {
      saved = true;
      return respond({ id: 'REVIEW-1', state: 'SUBMITTED' },201);
    }
    if (saved) return Response.json({ message: '暂时无法查询历史凭据' }, { status: 409 });
    const batch = url.searchParams.get('batchNo') ?? '';
    return respond(evidence(batch, batch === 'EXACT' ? 30 : null));
  });
  await act(async () => root.render(<EggSourceHistoryPage/>));
  await click('H1');
  await click('选择目标仓');
  await change('input[type=date]', '2026-11-17');
  await change('input[maxlength="128"]', 'EXACT');
  await click('查询历史凭据');
  expect(host.textContent).toContain('EXACT · EGG_RED · SKU-1');
  await change('input[type=number]', '5');
  await change('input[maxlength="128"]', 'MIXED');
  await click('查询历史凭据');
  expect(host.querySelector<HTMLInputElement>('input[type=number]')?.disabled).toBe(true);
  await change('select[required]', '123');
  await change('textarea', '核认依据');
  await click('上传核认证据');
  await click('提交审核');
  const sent = fetchMock.mock.calls.find(([,options]) => options.method === 'POST');
  expect(JSON.parse(String(sent?.[1].body))).toMatchObject({ batchNo: 'MIXED', ledgerId: '123', quantity: null });
  expect(host.querySelector('[role=status]')?.textContent).toContain('已记录操作与回执');
  expect(host.querySelector('[role=alert]')?.textContent).toContain('暂时无法查询历史凭据');
  expect(host.querySelector('select[required]')).toBeNull();
});
