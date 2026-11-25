/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import MedicinePage from '@/app/(mobile)/mobile/medicine/page';

const state = vi.hoisted(() => ({
  readonly: false,
  stock: vi.fn(async () => [
    { material_code: 'MAT-A', medication_code: 'MAT-A', medication_name: '实际物料', unit: '瓶', qty: 15 },
    { material_code: null, medication_code: 'MED-001', medication_name: '历史模板', unit: '瓶', qty: 1 },
  ]),
  warehouses: vi.fn(async () => [{ warehouse_code: 'W1', site_code: 'S1', company_code: 'C1' }]),
  inbound: vi.fn(async (_date: string, _items: unknown[]) => ({ lines: [{batchNo: 'LOT-A', ledgerId: 1}] })),
  ledger: vi.fn(async () => []),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn() }) }));
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (_: string, fallback: string) => fallback }) }));
vi.mock('@/contexts/MobileThemeContext', () => ({ useMobileTheme: () => ({ t: {} }) }));
vi.mock('@/hooks/useMobilePermission', () => ({
  useMobilePermission: () => ({ allowed: true, readonly: state.readonly, loading: false }),
}));
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ canEdit: !state.readonly, user: { userId: 1 } }),
}));
vi.mock('@/hooks/useMedicineInbound', () => ({
  useMedicineInbound: () => ({ submit: state.inbound }),
}));
vi.mock('@/lib/mobile-api', () => ({
  invalidateCache: vi.fn(),
  mobileApi: { getMedicineWarehouses: state.warehouses, medInbound: state.inbound, getMedStock: state.stock, getMedLedger: state.ledger, getFeedHousesDetail: async () => [] },
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

it('receives only actual material into the selected authorized medicine warehouse', async () => {
  state.readonly = false;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const button = (label: string) => Array.from(host.querySelectorAll('button')).find(b => b.textContent === label);
  try {
    await act(async () => root.render(<MedicinePage />));
    await act(async () => button('入库')!.click());
    expect(host.querySelector('select')?.value).toBe('W1');
    expect(host.textContent).toContain('实际物料');
    expect(host.textContent).not.toContain('历史模板');
    const input = host.querySelector<HTMLInputElement>('input[type="number"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '2');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button('保存')!.click());
    expect(state.inbound).toHaveBeenCalledWith(expect.any(String), [{
      material_code: 'MAT-A', qty: 2, note: undefined, warehouse_code: 'W1', site_code: 'S1', company_code: 'C1',
    }]);
  } finally {
    await act(async () => root.unmount());
  }
});
