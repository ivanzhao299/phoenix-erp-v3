import type { MdField } from './MasterDataRuntimePanel';

type Form = Record<string, unknown>;
export function defaultSkuName(form: Form): string {
  return form.product_name && form.grade_code && form.spec_code
    ? `${form.product_name} (${form.grade_code} / ${form.spec_code})` : '';
}

export function updateSkuReference(previous: Form, key: string, code: string, raw: Form | null): Form {
  const next = { ...previous, [key]: code };
  if (key === 'product_code') next.product_name = raw?.product_name ?? '';
  if (!previous.sku_name || previous.sku_name === defaultSkuName(previous)) next.sku_name = defaultSkuName(next);
  return next;
}

/** Shared with future page consolidation; never export field configuration from a Next page. */
export function skuFields(t: (key: string, fallback: string) => string): MdField[] {
  return [
    ...(['product', 'grade', 'spec'] as const).map(type => ({
      key: `${type}_code`, label: t(`md.${type}Code`, { product: '产品', grade: '等级', spec: '销售换算规格（同商品共享基础库存）' }[type]),
      type, required: true,
      referenceUpdate: (previous: Form, code: string, raw: Form | null) => updateSkuReference(previous, `${type}_code`, code, raw),
    })),
    { key: 'product_name', label: t('md.productName', '产品名称'), type: 'readonly' },
    { key: 'sku_name', label: t('md.skuName', 'SKU 名称'), required: true },
    { key: 'barcode', label: t('md.barcode', '条码') },
    { key: 'effective_date', label: t('md.effectiveDate', '生效日期'), type: 'date' },
    { key: 'expire_date', label: t('md.expireDate', '失效日期'), type: 'date' },
    { key: 'remark', label: t('md.remark', '备注') },
  ];
}
