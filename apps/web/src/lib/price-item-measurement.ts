/** Changing the sales specification requires a fresh quote and quantity tier confirmation. */
export function changeQuotedSku<T extends { skuCode: string; productCode: string; gradeCode: string; packagingSpec: string; unitPrice: string; floorPrice: string; ceilingPrice: string; minQty: string; maxQty: string; quantityBasis: 'BASE' | 'PACKAGE' | '' }>(
  previous: T, skuCode: string, sku?: { product_code: string; grade_code: string; spec_code: string },
): T {
  return { ...previous, skuCode, productCode: sku?.product_code ?? '', gradeCode: sku?.grade_code ?? '', packagingSpec: sku?.spec_code ?? '',
    unitPrice: '', floorPrice: '', ceilingPrice: '', minQty: '', maxQty: '', quantityBasis: 'PACKAGE' };
}
