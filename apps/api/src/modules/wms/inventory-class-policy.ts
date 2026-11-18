/**
 * Inventory classification for the approved eight-grade egg inventory model.
 *
 * Quality grade remains the source-of-truth for traceability, while the
 * inventory class decides which sales context may consume a batch.
 */
export const INVENTORY_CLASSES = ['STANDARD', 'DEFECT_SALE', 'WIP'] as const;
export type InventoryClass = typeof INVENTORY_CLASSES[number];

export const DEFECT_SALE_GRADES = ['DIRTY', 'BROKEN'] as const;
export const LIVE_EGG_GRADES = [
  'GRADE_0', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5',
  ...DEFECT_SALE_GRADES,
] as const;
/** Historical standard grade codes may remain on legacy WMS batches; they map
 * to STANDARD for classification but are not reactivated in product_grades. */
export const LEGACY_STANDARD_GRADES = ['1', '2', '3', '4', '5', 'AA', 'AAA', 'A', 'B', 'C', 'XL', 'L', 'M', 'S', 'XS', 'GRD-001'] as const;

function normalize(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

export function resolveInventoryClass(gradeCode: unknown): InventoryClass {
  const normalized = normalize(gradeCode);
  if (!normalized) return 'STANDARD';
  if (!(LIVE_EGG_GRADES as readonly string[]).includes(normalized)
      && !(LEGACY_STANDARD_GRADES as readonly string[]).includes(normalized)) {
    throw new Error(`未知鸡蛋等级，禁止推导库存分类: ${normalized}`);
  }
  return (DEFECT_SALE_GRADES as readonly string[]).includes(normalized)
    ? 'DEFECT_SALE'
    : 'STANDARD';
}

export function isInventoryClass(value: unknown): value is InventoryClass {
  return (INVENTORY_CLASSES as readonly string[]).includes(normalize(value));
}

/**
 * Farm wholesale sales may consume both pools. Store/POS sales are restricted
 * to STANDARD by the caller's server-side sales context.
 */
export function allowedInventoryClassesForSales(context: 'FARM_SALES' | 'STORE_POS'): InventoryClass[] {
  return context === 'FARM_SALES' ? ['STANDARD', 'DEFECT_SALE'] : ['STANDARD'];
}
