/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { QuantityBasisInput, quantityText } from './QuantityBasisInput';
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
describe('Explicit quantity presentation', () => {
  it('shows tray and box conversion and preserves unknown historical unit wording', () => {
    expect(quantityText(1,{basis:'PACKAGE',factor:30,baseQty:30,baseUnit:'枚',tradeUnit:'托'})).toBe('1 托（1 托 = 30 枚；合计 30 枚）');
    expect(quantityText(1,{basis:'PACKAGE',factor:360,baseQty:360,baseUnit:'枚',tradeUnit:'箱'})).toContain('360 枚');
    expect(quantityText(1,null)).toContain('单位未记录');
  });
  it('makes base and package choices explicit without inferring an old price unit', async () => {
    const host=document.createElement('div');const root=createRoot(host);const change=vi.fn();
    await act(async()=>root.render(createElement(QuantityBasisInput,{value:'',onChange:change})));
    expect(host.querySelectorAll('input:checked')).toHaveLength(0);
    await act(async()=> (host.querySelectorAll('input')[1] as HTMLInputElement).click());
    expect(change).toHaveBeenCalledWith('PACKAGE');
    await act(async()=>root.unmount());
  });
});
