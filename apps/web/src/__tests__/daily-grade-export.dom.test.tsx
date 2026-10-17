/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DailyPage from '@/app/(admin)/breeding/daily/page';
import { DailyReportExport } from '@/components/breeding/DailyReportExport';
import request from '@/lib/api-client';
import type { ProductGrade } from '@/hooks/useProductGrades';

const fixtures = vi.hoisted(() => ({ allowed: true, reports: [{ id: 1, log_date: '2026-10-16', house_code: 'H-A', eggs_produced: 999, eggs_by_grade: { GRADE_1: 11, GRADE_2: 22, GRADE_3: 33, GRADE_4: 44, GRADE_5: 55, DIRTY: 6, CRACKED: 7, BROKEN: 8, DAMAGED: 9 }, mortality_qty: 2, elimination_qty: 3, note: 'saved record' }], error: vi.fn(), success: vi.fn(), fetchReports: vi.fn(), fetchEmpty: vi.fn() }));
const grades = ['GRADE_1','GRADE_2','GRADE_3','GRADE_4','GRADE_5','DIRTY','CRACKED','BROKEN','DAMAGED'].map((grade_code, i) => ({ grade_code, grade_name: `Grade ${i + 1}`, sort_order: i })) as ProductGrade[];
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (_key: string, fallback: string) => fallback, lang: 'en' }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ success: fixtures.success, error: fixtures.error }) }));
vi.mock('@/contexts/DialogContext', () => ({ useDialog: () => ({ showConfirm: vi.fn() }) }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ canExport: fixtures.allowed, canEdit: false, canCreate: false, can: () => false }) }));
vi.mock('@/hooks/useDictOptions', () => ({ useDictOptions: () => ({ optionPairs: [], codeMap: {} }) }));
vi.mock('@/hooks/useProductGrades', () => ({ useProductGrades: () => ({ grades }) }));
vi.mock('@/hooks/useCrud', () => ({ useCrud: (table: string) => ({ fetchRecords: table === 'brd_daily_logs' ? fixtures.fetchReports : fixtures.fetchEmpty, createRecord: vi.fn() }) }));
vi.mock('@/components/PageHeader', () => ({ default: ({ actions }: { actions: React.ReactNode }) => <header>{actions}</header> }));
vi.mock('@/components/shared-selectors/MasterDataSelectors', () => ({ HouseSelector: () => null }));
vi.mock('@/components/shared-selectors/DictSelect', () => ({ default: () => null }));
vi.mock('@/lib/api-client', () => ({ default: vi.fn() }));
let root: Root;
let host: HTMLDivElement;
const click = async (text: string) => act(async () => { const target = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === text); if (!target) throw Error(`Missing ${text}`); target.click(); });
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  fixtures.allowed = true;
  fixtures.fetchReports.mockResolvedValue(fixtures.reports);
  fixtures.fetchEmpty.mockResolvedValue([]);
  vi.mocked(request).mockResolvedValue({ data: fixtures.reports });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn().mockReturnValue('blob:issue403'), revokeObjectURL: vi.fn() }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  sessionStorage.setItem('phoenix_user', JSON.stringify({ storeCode: 'ALL' }));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('renders all nine stored grades and preserves total, death, cull and remark history fields', async () => {
  await act(async () => root.render(<DailyPage />));
  const detail = host.querySelector('dl'); expect(detail).not.toBeNull();
  expect([...detail!.querySelectorAll('dd')].map(n => n.textContent)).toEqual(['11','22','33','44','55','6','7','8','9']);
  const row = detail!.closest('tr')!; expect(row.textContent).toContain('999'); expect(row.textContent).toContain('saved record');
  expect([...row.querySelectorAll('td')].map(n => n.textContent)).toContain('2'); expect([...row.querySelectorAll('td')].map(n => n.textContent)).toContain('3');
  await click('导出报表'); expect(document.querySelector('input[type=date]')).not.toBeNull();
});
it('selects a calendar date, queries saved records and downloads the resulting CSV', async () => {
  await act(async () => root.render(<DailyReportExport grades={grades} />)); await click('导出报表');
  const date = document.querySelector('input[type=date]') as HTMLInputElement;
  await act(async () => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!; setter.call(date, '2026-10-16'); date.dispatchEvent(new Event('input', { bubbles: true })); date.dispatchEvent(new Event('change', { bubbles: true })); });
  const modalExport = [...document.querySelectorAll('button')].filter(b => b.textContent?.trim() === '导出报表').at(-1)!;
  await act(async () => modalExport.click());
  expect(request).toHaveBeenCalledWith(expect.stringContaining('log_date=2026-10-16'), expect.objectContaining({ cache: 'no-store' }));
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce(); expect(fixtures.success).toHaveBeenCalledWith(expect.stringContaining('1'));
});
it('shows empty/error state without downloading and hides export without permission', async () => {
  vi.mocked(request).mockResolvedValue({ data: [] });
  await act(async () => root.render(<DailyReportExport grades={grades} />)); await click('导出报表');
  await act(async () => [...document.querySelectorAll('button')].filter(b => b.textContent?.trim() === '导出报表').at(-1)!.click());
  expect(document.querySelector('[role=alert]')?.textContent).toContain('所选日期没有'); expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  vi.mocked(request).mockRejectedValue(Error('403'));
  await act(async () => [...document.querySelectorAll('button')].filter(b => b.textContent?.trim() === '导出报表').at(-1)!.click());
  expect(document.querySelector('[role=alert]')?.textContent).toContain('导出失败');
  fixtures.allowed = false; await act(async () => root.render(<DailyReportExport grades={grades} />)); expect(host.querySelector('button')).toBeNull();
});
