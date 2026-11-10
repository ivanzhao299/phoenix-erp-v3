import { describe, expect, it } from 'vitest';
import { changeQuotedSku } from './price-item-measurement';
describe('Quotes per sales specification', () => {
  it('clears tray prices and tiers when switching to a box SKU, retaining the chosen currency/book', () => {
    const tray={skuCode:'TRAY',productCode:'P',gradeCode:'G',packagingSpec:'T',unitPrice:'100',floorPrice:'90',ceilingPrice:'120',minQty:'10',maxQty:'50',quantityBasis:'PACKAGE' as const,currencyCode:'LAK',priceBookId:'PB'};
    expect(changeQuotedSku(tray,'BOX',{product_code:'P',grade_code:'G',spec_code:'B'})).toEqual({skuCode:'BOX',productCode:'P',gradeCode:'G',packagingSpec:'B',unitPrice:'',floorPrice:'',ceilingPrice:'',minQty:'',maxQty:'',quantityBasis:'PACKAGE',currencyCode:'LAK',priceBookId:'PB'});
  });
});
