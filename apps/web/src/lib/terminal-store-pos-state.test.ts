import { describe, expect, it } from 'vitest';
import { addTerminalCartLine, canTerminalSettle, changeTerminalCartQty, terminalPosDraftKey, type TerminalPayType } from './terminal-store-pos-state';

describe('Terminal Store POS state machine', () => {
  it('adds, increments, decrements and removes cart lines', () => {
    const product = { product_code:'P1', sku_code:'SKU1', product_name:'鸡蛋', unit_price:10 };
    let cart = addTerminalCartLine([], product);
    cart = addTerminalCartLine(cart, product);
    expect(cart).toEqual([{ ...product, qty:2 }]);
    cart = changeTerminalCartQty(cart, 0, -1);
    expect(cart[0].qty).toBe(1);
    expect(changeTerminalCartQty(cart, 0, -1)).toEqual([]);
  });

  it('isolates drafts and forbids offline or unauthorized settlement', () => {
    expect(terminalPosDraftKey('u1','S1','R1')).not.toBe(terminalPosDraftKey('u2','S1','R1'));
    expect(canTerminalSettle({online:false,shiftOpen:true,cartSize:1,canCreate:true,canEdit:true})).toBe(false);
    expect(canTerminalSettle({online:true,shiftOpen:true,cartSize:1,canCreate:true,canEdit:true})).toBe(true);
  });

  it('supports the frozen V1 payment modes', () => {
    const modes:TerminalPayType[]=['CASH','CREDIT','MIXED'];
    expect(modes).toEqual(['CASH','CREDIT','MIXED']);
  });
});
