type PickOption = { raw?: Record<string, unknown>; label?: string } | null | undefined;

/**
 * onPickKeys maps an exact raw master-data field into a form field.
 * A null raw value means “this identity does not apply” (for example material_code
 * on a SKU), so it must stay empty instead of falling back to the display label.
 */
export function mappedPickValue(option: PickOption, rawField: string): unknown {
  return option?.raw?.[rawField] ?? "";
}

/**
 * 库存身份字段（sku_code / material_code / product_code）在后端的契约是
 * “缺省 = 物料/legacy 兼容路径，传值 = 明确身份”。表单侧约定 `""` 表示
 * “无值”，提交前必须把空串/纯空格身份键整体剔除，避免后端把它当脏编码拒绝。
 * 返回原对象（原地删除，调用方传构造好的 payload）。
 */
export function omitEmptyIdentityFields<T extends Record<string, unknown>>(payload: T): T {
  for (const key of ["sku_code", "material_code", "product_code"] as const) {
    const value = payload[key];
    if (typeof value === "string" && !value.trim()) delete payload[key];
  }
  return payload;
}
