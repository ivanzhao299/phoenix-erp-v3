/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const context = vi.hoisted(() => ({ lang: 'zh', canView: true }));
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ lang: context.lang, t: (_key: string, fallback: string) => fallback }) }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ canView: context.canView }) }));
vi.mock('@/components/PageHeader', () => ({ default: () => <header>Ledger</header> }));
import DailyInboundLedgerPage from '@/app/(admin)/breeding/daily-inbound-ledger/page';

// Started by farm-egg.pg.spec.ts: the page fetches the real local Nest HTTP API.
// Ordinary Web unit runs skip this opt-in suite visibly, rather than inventing API rows.
const describeLive = process.env.ISSUE400_API_URL ? describe : describe.skip;
describeLive('Issue 400 live API ledger DOM', () => {
  let host: HTMLDivElement;
  let root: Root;
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    // Freeze only Date, not timers or HTTP, so the initial wider range is reproducible.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T12:00:00Z'));
    context.canView = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    vi.stubGlobal('fetch', vi.fn((input: string, init?: RequestInit) => realFetch(new URL(input, process.env.ISSUE400_API_URL), init)));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each(['zh', 'en', 'lo'])('shows nine event codes, translated names and quantities from PG (%s)', async lang => {
    context.lang = lang;
    await act(async () => root.render(<DailyInboundLedgerPage />));
    // Finish the initial real request before changing the range; this avoids
    // making server response order part of this grade-projection regression.
    for (let tries = 0; tries < 100; tries++) {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      if (!(host.querySelector('button') as HTMLButtonElement)?.disabled) break;
    }
    expect((host.querySelector('button') as HTMLButtonElement).disabled).toBe(false);

    // Keep both responses real, but deliver the intermediate wider range last.
    // Two native change events can flush separately even inside the same act().
    const fetchLedger = vi.mocked(fetch).getMockImplementation()!;
    let releaseIntermediate!: () => void;
    const intermediateGate = new Promise<void>(resolve => { releaseIntermediate = resolve; });
    let intermediateRequest: Promise<Response> | undefined;
    let intermediateBody: Promise<{ data: unknown[] }> | undefined;
    vi.mocked(fetch).mockImplementation((input, init) => {
      const response = fetchLedger(input, init);
      const url = new URL(String(input), process.env.ISSUE400_API_URL);
      if (url.searchParams.get('start') === '2026-10-11' && url.searchParams.get('end') !== '2026-10-11') {
        intermediateRequest = Promise.resolve(response).then(async result => {
          intermediateBody = result.clone().json();
          await intermediateGate;
          return result;
        });
        return intermediateRequest;
      }
      return response;
    });
    const inputs = host.querySelectorAll('input[type=date]');
    await act(async () => {
      for (const input of inputs) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '2026-10-11');
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    // Poll only DOM/network completion; no fixture response is substituted.
    for (let tries = 0; tries < 100; tries++) {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      if (host.querySelectorAll('tbody tr').length === 9) break;
    }
    expect(fetch).toHaveBeenCalledWith('/api/farm/egg/ledger?start=2026-10-11&end=2026-10-11', expect.any(Object));
    expect(host.querySelectorAll('tbody tr')).toHaveLength(9);
    expect(intermediateRequest).toBeDefined();
    await act(async () => {
      releaseIntermediate();
      await intermediateRequest!;
      // The stale response is genuinely wider; it must not replace the final range.
      expect((await intermediateBody!).data).toHaveLength(37);
    });
    const rows = Array.from(host.querySelectorAll('tbody tr'));
    expect(rows).toHaveLength(9);
    const grades = ['GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'DIRTY', 'CRACKED', 'BROKEN', 'DAMAGED'];
    const names = ['1号蛋', '2号蛋', '3号蛋', '4号蛋', '5号蛋', '脏蛋', '裂缝蛋', '破损蛋', '损坏蛋'];
    grades.forEach((grade, i) => {
      const row = rows.find(row => row.children[2]?.textContent?.includes(`（${grade}）`));
      expect(row).toBeDefined();
      expect(row!.children[2].textContent).toBe(`${lang === 'zh' ? names[i] : lang === 'en' ? `Grade ${grade}` : `ໄຂ່ ${grade}`}（${grade}）`);
      expect(row!.children[3].textContent).toBe(`+${(i + 1) * 11}`);
      expect(row!.children[0].textContent).toBe('2026-10-11');
    });
  });

  it('does not request or render inventory for a viewer without the existing permission', async () => {
    context.canView = false;
    await act(async () => root.render(<DailyInboundLedgerPage />));
    expect(fetch).not.toHaveBeenCalled();
    expect(host.textContent).toContain('无权限访问');
    expect(host.querySelector('table')).toBeNull();
  });
});
