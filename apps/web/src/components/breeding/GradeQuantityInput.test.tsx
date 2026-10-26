/** @vitest-environment jsdom */
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GradeQuantityInput } from './GradeQuantityInput';

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

async function renderInput() {
  function Form() {
    const [value, setValue] = useState('12');
    return <GradeQuantityInput aria-label="1号蛋 · 数量(枚)" value={value} onValueChange={setValue} />;
  }
  await act(async () => root.render(<Form />));
  return host.querySelector('input')!;
}

it('cancels only ArrowUp/ArrowDown so native edit and focus keys stay available', async () => {
  const input = await renderInput();
  for (const key of ['ArrowUp', 'ArrowDown']) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(input.value).toBe('12');
  }
  for (const key of ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End', '1']) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  }
});

it('keeps native numeric bounds, integral step validation, and an accessible grade name', async () => {
  const input = await renderInput();
  expect(input.type).toBe('number');
  expect(input.min).toBe('0');
  expect(input.step).toBe('1');
  expect(input.inputMode).toBe('numeric');
  expect(input.getAttribute('aria-label')).toBe('1号蛋 · 数量(枚)');
  input.value = '1.5';
  expect(input.validity.stepMismatch).toBe(true);
});

it('preserves manual quantity updates and clamps negative values without blocking clearing', async () => {
  const input = await renderInput();
  const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  for (const [typed, expected] of [['123', '123'], ['-5', '0'], ['0', '0'], ['', '']]) {
    await act(async () => {
      setNativeValue.call(input, typed);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(input.value).toBe(expected);
  }
});
