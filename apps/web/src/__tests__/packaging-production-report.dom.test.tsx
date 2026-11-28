/** @vitest-environment jsdom */
import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PackingProductionReport from '@/components/packaging/PackingProductionReport';
import type { SummaryResult } from '@/components/packaging/PackingProductionReport';
import { useAuth } from '@/contexts/AuthContext';

const session = vi.hoisted(() => ({ user: { id: 'report-user', permissions: ['MENU_PKG_OP:V'] }, listeners: new Set<() => void>() }));
vi.mock('@/contexts/AuthContext', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useAuth: () => ({
      user: useSyncExternalStore(
        listener => { session.listeners.add(listener); return () => session.listeners.delete(listener); },
        () => session.user,
      ),
    }),
  };
});
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (_key: string, fallback?: string) => fallback || _key }) }));
vi.mock('@/hooks/useProductGrades', () => ({ useProductGrades: () => ({ grades: [
  { grade_code: 'GRADE_0', grade_name: '0号蛋' },
  { grade_code: 'GRADE_4', grade_name: '4号蛋' },
  { grade_code: 'GRADE_5', grade_name: '5号蛋' },
] }) }));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

let root: Root;
let host: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;

const baseReport = (date: string): SummaryResult => ({
  basis: 'TERMINAL_RECORDS',
  aggregation: 'DAY',
  shiftId: null,
  dateFrom: date,
  dateTo: date,
  totalEggs: 100,
  totalBoxes: 7,
  shiftPackedEggs: 100,
  gradingOutputs: { GRADE_5: 30 },
  committedBoxes: 2,
  voidCount: 0,
  shiftIds: ['17'],
  unassigned: { state: 'NOT_ATTRIBUTABLE', count: null, message: 'Unknown history' },
  days: [{ date, totalEggs: 100, totalBoxes: 7 }],
  records: [
    { code: 'PACK-1', shiftId: '17', shiftDate: '2026-11-27', productionDate: '2026-11-26', totalEggs: 30, totalBoxes: 2, inventoryMode: 'PACKAGING_INBOUND', handoverEligible: false, handover: { state: 'COMMITTED', quality: 'VERIFIED', issues: [] } },
    { code: 'PACK-2', shiftId: '17', shiftDate: '2026-11-27', productionDate: '2026-11-26', totalEggs: 20, totalBoxes: 1, inventoryMode: 'PACKAGING_INBOUND', handoverEligible: true, handover: { state: 'PENDING', quality: 'VERIFIED', issues: [] } },
    { code: 'PACK-3', shiftId: '18', shiftDate: '2026-11-28', productionDate: '2026-11-28', totalEggs: 50, totalBoxes: 4, inventoryMode: 'PACKAGING_INBOUND', handoverEligible: false, handover: { state: 'PENDING', quality: 'UNKNOWN', issues: ['TEMP aggregate'] } },
  ],
});

function response(status: number, data?: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => ({ code: 200, data }) };
}

function IdentityProbe() {
  const { user } = useAuth();
  return <span>{user?.id}</span>;
}

async function flush() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  session.user = { id: 'report-user', permissions: ['MENU_PKG_OP:V'] };
  session.listeners.clear();
  localStorage.setItem('phoenix_token', 'TEST-ONLY');
  fetchMock = vi.fn(async (input: string) => {
    const url = new URL(input, window.location.origin);
    if (url.searchParams.get('aggregation') === 'SHIFT') {
      return response(200, { ...baseReport('2026-11-27'), aggregation: 'SHIFT', shiftId: '17', totalEggs: 50, totalBoxes: 3, committedBoxes: 2, records: baseReport('2026-11-27').records.slice(0, 2) });
    }
    return response(200, baseReport(url.searchParams.get('dateTo') || '2026-11-28'));
  });
  vi.stubGlobal('fetch', fetchMock);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
});

it('keeps production date, original shift, committed handover, and review counts distinct', async () => {
  await act(async () => root.render(<PackingProductionReport />));
  await flush();

  expect(host.textContent).toContain('包装原单枚数');
  expect(host.textContent).toContain('100');
  expect(host.textContent).toContain('待交库箱数');
  expect(host.textContent).toContain('1');
  expect(host.textContent).toContain('待核原单');
  expect(host.textContent).toContain('原入库路径或切换管控待核，不按包装交库处理');
  expect(host.querySelector('a[href="/packaging/history/PACK-1"]')).not.toBeNull();
  expect(host.textContent).toContain('2026-11-26');
  expect(host.textContent).toContain('2026-11-27');
  expect(host.textContent).toContain('分级产出');
  expect(host.textContent).toContain('0号蛋');
  expect(host.textContent).toContain('5号蛋：30 枚');
  expect(host.textContent).toContain('包装原单枚数：100');

  const exact = [...host.querySelectorAll('button')].find(button => button.textContent === '班次明细');
  expect(exact).toBeDefined();
  await act(async () => exact?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await flush();
  const exactUrl = new URL(fetchMock.mock.calls[1][0] as string, window.location.origin);
  expect(exactUrl.searchParams.get('aggregation')).toBe('SHIFT');
  expect(exactUrl.searchParams.get('shiftId')).toBe('17');
  expect(exactUrl.searchParams.get('dateFrom')).toBe('2026-11-27');
  expect(host.textContent).toContain('班次明细 · 2026-11-27 · 17');
});

it('does not present unauthorized data as zero totals', async () => {
  fetchMock.mockImplementationOnce(async () => response(403));
  await act(async () => root.render(<PackingProductionReport />));
  await flush();

  expect(host.textContent).toContain('当前账号无权查看包装生产统计');
  expect(host.textContent).not.toContain('包装原单枚数');
});

it('does not render a delayed report after the signed-in identity changes', async () => {
  let resolveOld: ((value: ReturnType<typeof response>) => void) | undefined;
  fetchMock.mockReset();
  fetchMock.mockImplementationOnce(() => new Promise<ReturnType<typeof response>>(resolve => { resolveOld = resolve; }))
    .mockImplementationOnce(async () => {
      const fresh = baseReport('2026-11-28');
      return response(200, { ...fresh, records: [{ ...fresh.records[0], code: 'PACK-NEW' }] });
    });

  await act(async () => root.render(<><IdentityProbe /><PackingProductionReport /></>));
  await flush();
  expect(session.listeners.size).toBeGreaterThan(0);
  await act(async () => {
    session.user = { id: 'another-user', permissions: ['MENU_PKG_OP:V'] };
    session.listeners.forEach(listener => listener());
  });
  expect(host.textContent).toContain('another-user');
  await flush();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain('PACK-NEW');

  const old = baseReport('2026-11-28');
  resolveOld?.(response(200, { ...old, records: [{ ...old.records[0], code: 'PACK-OLD' }] }));
  await flush();
  expect(host.textContent).toContain('PACK-NEW');
  expect(host.textContent).not.toContain('PACK-OLD');
});
