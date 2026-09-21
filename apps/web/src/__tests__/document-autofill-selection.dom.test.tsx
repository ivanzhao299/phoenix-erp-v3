/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DocumentAutofillPanel } from '@/components/design-system/forms/DocumentAutofillPanel';

vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (_key: string, fallback: string) => fallback }) }));
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const click = async (text: string) => {
  const button = [...host.querySelectorAll('button')].find(b => b.textContent === text);
  if (!button) throw new Error(`Missing button: ${text}`);
  await act(async () => button.click());
};
it('selects new suggestions, preserves manual deselection on rerender, and resets on another extraction', async () => {
  const suggestions = [{ field: 'name', value: 'Test' }, { field: 'code', value: 'TEST' }];
  const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ fieldSuggestions: suggestions }) });
  vi.stubGlobal('fetch', request);
  const onApply = vi.fn();
  const render = () => root.render(<DocumentAutofillPanel fileRefs={['FILE-test']} purpose="GENERIC_DOCUMENT" fields={['name', 'code']} onApply={onApply} />);
  await act(async () => render());
  expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  await click('开始识别');
  const boxes = () => [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  expect(boxes().map(b => b.checked)).toEqual([true, true]);
  await act(async () => boxes()[0].click());
  await act(async () => render());
  expect(boxes().map(b => b.checked)).toEqual([false, true]);
  await click('确认无误并回填选中字段');
  expect(onApply).toHaveBeenCalledWith([suggestions[1]]);
  await click('开始识别');
  expect(boxes().map(b => b.checked)).toEqual([true, true]);
  request.mockResolvedValueOnce({ ok: false, json: async () => ({ message: 'Failed extraction' }) });
  await click('开始识别');
  expect(boxes()).toHaveLength(0);
  expect(host.textContent).toContain('Failed extraction');
  expect(request).toHaveBeenCalledTimes(3);
});
