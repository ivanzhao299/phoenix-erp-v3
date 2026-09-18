/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import UserManagementPage from '@/app/(admin)/settings/users/page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (_key: string, fallback: string) => fallback }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ canCreate: false, canEdit: false }) }));
vi.mock('@/components/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/ui/RightDrawer', () => ({ RightDrawer: () => null }));
vi.mock('@/components/ui/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
vi.mock('@/components/settings/RolePicker', () => ({ RolePicker: () => null, levelColor: () => 'black' }));

let root: Root;
let host: HTMLDivElement;
const button = (text: string) => {
  const node = [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === text);
  if (!node) throw new Error(`Missing button: ${text}`);
  return node;
};
beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({
    data: Array.from({ length: 240 }, (_, i) => ({ id: i + 1, username: `user${i}`, real_name_zh: `Name${i}`, status: 'ACTIVE', user_type: 'REAL', roles_detail: [] })), roles: [],
  }) }));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('keeps the page for the active type tab and resets for a different type, size, and sort without refetching', async () => {
  await act(async () => root.render(<UserManagementPage />));
  await act(async () => button('列表视图').click());
  await act(async () => button('›').click());
  expect(host.textContent).toContain('2 / 3');
  await act(async () => button('全部(240)').click());
  expect(host.textContent).toContain('2 / 3');
  await act(async () => button('✅ 正式员工(240)').click());
  expect(host.textContent).toContain('1 / 3');
  await act(async () => button('›').click());
  const size = [...host.querySelectorAll('select')].find(s => s.value === '100')!;
  await act(async () => { size.value = '50'; size.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(host.textContent).toContain('1 / 5');
  await act(async () => button('›').click());
  const sortable = [...host.querySelectorAll('th')].find(n => n.textContent?.includes('用户名'))!;
  await act(async () => sortable.click());
  expect(host.textContent).toContain('1 / 5');
  expect(fetch).toHaveBeenCalledTimes(1);
});
