/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import EggSourceHistoryPage from '@/app/(admin)/breeding/egg-source-history/page';

vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ canView: true, canEdit: true, canApprove: true }) }));
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (_key: string, fallback: string) => fallback }) }));
vi.mock('@/hooks/useProductGrades', () => ({
  useProductGrades: () => ({ grades: [{ grade_code: 'GRADE_1', grade_name: '1号蛋' }] }),
}));
vi.mock('@/components/PageHeader', () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/components/design-system/forms/AttachmentUploader', () => ({
  AttachmentUploader: ({ onChange }: { onChange: (files: string[]) => void }) =>
    <button type="button" onClick={() => onChange(['EVIDENCE-1'])}>上传核认证据</button>,
}));

const endpoint = '/api/product-master/egg-sources';
const fetchMock = vi.fn<(path: string, options: RequestInit) => Promise<Response>>();
const respond = (data: unknown, code = 200, status = code) => Response.json({ code, data }, { status });
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

it('submits a mixed batch without old quantity and distinguishes a saved review from a failed refresh', async () => {
  let saved = false;
  fetchMock.mockImplementation(async (path, options) => {
    const url = new URL(path, location.origin);
    if (url.pathname === endpoint + '/history/options') {
      return url.searchParams.has('houseCode')
        ? respond({ warehouses: [{ code: 'WH', name: '原仓', status: 'INACTIVE' }] })
        : respond({ houses: [{ houseCode: 'H1', name: '原舍', status: 'INACTIVE', companyCode: 'CO', siteCode: 'SITE' }] });
    }
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
  expect(host.textContent).toContain('历史鸡舍');
  await change('select', 'H1');
  await change('label:nth-child(2) select', 'WH');
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
