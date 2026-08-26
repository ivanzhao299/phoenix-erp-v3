type PickOption = { raw?: Record<string, unknown>; label?: string } | null | undefined;

/**
 * onPickKeys maps an exact raw master-data field into a form field.
 * A null raw value means “this identity does not apply” (for example material_code
 * on a SKU), so it must stay empty instead of falling back to the display label.
 */
export function mappedPickValue(option: PickOption, rawField: string): unknown {
  return option?.raw?.[rawField] ?? "";
}
