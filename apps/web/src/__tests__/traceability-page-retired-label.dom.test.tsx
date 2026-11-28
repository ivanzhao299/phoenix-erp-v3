/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (_key: string, fallback: string) => fallback }) }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ canView: true }) }));
vi.mock('@/hooks/useDictOptions', () => ({ useDictOptions: () => ({ codeMap: {} }) }));
vi.mock('@/lib/api-client', () => ({ default: mocks.request }));
vi.mock('@/components/PageHeader', () => ({ default: () => null }));

import TraceabilityPage from '@/app/(admin)/traceability/page';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  mocks.request.mockReset();
  host = document.body.appendChild(document.createElement('div'));
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function submitLabelLookup(result: unknown) {
  mocks.request.mockResolvedValue(result);
  await act(async () => root.render(<TraceabilityPage />));
  await act(async () => {
    const select = host.querySelector('select')!;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, 'label');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await act(async () => {
    const input = host.querySelector('input')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'TEST-LABEL');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const search = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('追溯'));
  await act(async () => search?.click());
}

it('shows void status only when the server confirms an authorized retired code', async () => {
  await submitLabelLookup({ found: false, entry: 'label', key: 'TEST-LABEL', registryState: 'RETIRED' });
  expect(host.textContent).toContain('箱码已作废');
  expect(host.textContent).not.toContain('未找到追溯记录');
});

it('keeps missing and unauthorized labels on the generic not-found message', async () => {
  await submitLabelLookup({ found: false, entry: 'label', key: 'TEST-LABEL' });
  expect(host.textContent).toContain('未找到追溯记录');
  expect(host.textContent).not.toContain('箱码已作废');
});
