/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import MedicinePage from '@/app/(mobile)/mobile/medicine/page';

const state = vi.hoisted(() => ({
  readonly: false,
  stock: vi.fn(async () => []),
  ledger: vi.fn(async () => []),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn() }) }));
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (_: string, fallback: string) => fallback }) }));
vi.mock('@/contexts/MobileThemeContext', () => ({ useMobileTheme: () => ({ t: {} }) }));
vi.mock('@/hooks/useMobilePermission', () => ({
  useMobilePermission: () => ({ allowed: true, readonly: state.readonly, loading: false }),
}));
vi.mock('@/lib/mobile-api', () => ({
  mobileApi: { getMedStock: state.stock, getMedLedger: state.ledger, getFeedHousesDetail: async () => [] },
}));

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

it.each([false, true])('opens the governed treatment workflow and retains ledger access (readonly %s)', async readonly => {
  state.readonly = readonly;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<MedicinePage />));
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/breeding/medicine');
    const button = (label: string) => Array.from(host.querySelectorAll('button')).find(b => b.textContent === label);
    expect(Boolean(button('入库'))).toBe(!readonly);
    expect(button('出库')).toBeUndefined();
    await act(async () => button('今日流水')!.click());
    expect(state.ledger).toHaveBeenCalledOnce();
    expect(button('保存')).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
  }
});
