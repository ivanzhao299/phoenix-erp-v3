'use client';

export type QuantityBasis = 'BASE' | 'PACKAGE';
export type QuantitySnapshot = { basis: QuantityBasis; factor: number; baseQty: number; baseUnit: string; tradeUnit: string; priceFactor?: number; priceUnit?: string };

export function QuantityBasisInput({ value, onChange }: { value: QuantityBasis | ''; onChange: (basis: QuantityBasis) => void }) {
  return <fieldset style={{ border: 0, padding: 0, margin: '8px 0' }}>
    <legend>数量与价格计量口径（价格、底价和阶梯使用同一单位）</legend>
    <label><input type="radio" checked={value === 'BASE'} onChange={() => onChange('BASE')} />基本单位（如枚）</label>{' '}
    <label><input type="radio" checked={value === 'PACKAGE'} onChange={() => onChange('PACKAGE')} />销售规格单位（如托/箱）</label>
    {!value && <small>请明确计量口径；选择后按所选 SKU 主档保存换算关系，请核对价格及阶梯。</small>}
  </fieldset>;
}
export function quantityText(qty: number | string, snapshot?: QuantitySnapshot | null): string {
  return snapshot ? `${qty} ${snapshot.tradeUnit}（1 ${snapshot.tradeUnit} = ${snapshot.factor} ${snapshot.baseUnit}；合计 ${Number(qty) * snapshot.factor} ${snapshot.baseUnit}）` : `${qty} 原单数量（单位未记录）`;
}
