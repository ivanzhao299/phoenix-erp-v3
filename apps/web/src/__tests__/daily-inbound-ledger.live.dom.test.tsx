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
  });

  it.each(['zh', 'en', 'lo'])('shows nine event codes, translated names and quantities from PG (%s)', async lang => {
    context.lang = lang;
    await act(async () => root.render(<DailyInboundLedgerPage />));
    // Finish the initial real request before changing the range; this avoids
    // making server response order part of this grade-projection regression.
    for (let tries = 0; tries < 100; tries++) {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      if (host.querySelectorAll('tbody tr').length > 1 && !(host.querySelector('button') as HTMLButtonElement)?.disabled) break;
    }
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
