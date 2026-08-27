export type TerminalPayType = 'CASH' | 'CREDIT' | 'MIXED';

export function terminalPosDraftKey(userId: string, storeCode: string, registerId: string) {
  return `phoenix_store_pos_draft:v1:${userId || 'anonymous'}:${storeCode || 'none'}:${registerId || 'unregistered'}`;
}

export function addTerminalCartLine<T extends { product_code:string; sku_code?:string }>(cart:Array<T & {qty:number}>, product:T):Array<T & {qty:number}> {
  const key = product.sku_code || product.product_code;
  const index = cart.findIndex(line => (line.sku_code || line.product_code) === key);
  if (index < 0) return [...cart, { ...product, qty: 1 }];
  return cart.map((line, i) => i === index ? { ...line, qty: line.qty + 1 } : line);
}

export function changeTerminalCartQty<T extends { qty:number }>(cart:T[], index:number, delta:number):T[] {
  return cart.map((line, i) => i === index ? { ...line, qty: line.qty + delta } : line).filter(line => line.qty > 0);
}

export function canTerminalSettle(input:{online:boolean;shiftOpen:boolean;cartSize:number;canCreate:boolean;canEdit:boolean}) {
  return input.online && input.shiftOpen && input.cartSize > 0 && input.canCreate && input.canEdit;
}
