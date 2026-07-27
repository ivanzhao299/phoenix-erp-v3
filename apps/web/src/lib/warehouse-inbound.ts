export interface WarehouseInboundConfirmItem {
  product_code?: string;
  sku_code?: string;
  material_code?: string;
  item_type?: string;
  material_type?: string;
  unit?: string;
  actual_qty: number;
  expected_qty?: number;
  batch_no?: string;
  warehouse_code?: string;
  location_code?: string;
}

export interface WarehouseInboundConfirmPayload {
  task_no: string;
  items: WarehouseInboundConfirmItem[];
}

export interface WarehouseInboundSaveOptions {
  isEditing?: boolean;
  now?: Date;
  random?: () => number;
}

export type WarehouseInboundConfirmBuildResult =
  | { ok: true; payload: WarehouseInboundConfirmPayload }
  | { ok: false; reason: "missing_task_no" | "missing_product_code" | "invalid_qty" };

type InboundRow = Record<string, unknown> | null | undefined;

function stringValue(value: unknown): string {
  return String(value ?? "").trim();
}

function quantityValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 1000) / 1000 : 0;
}

function buildTaskNo(now: Date, random: () => number): string {
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "0");
  return `INB-${ymd}-${suffix}`;
}

function buildInboundNo(now: Date): string {
  return `WI-${now.getTime().toString().slice(-6)}`;
}

export function buildWarehouseInboundSavePayload(
  values: Record<string, unknown>,
  options: WarehouseInboundSaveOptions = {},
): Record<string, unknown> {
  const payload = { ...values };
  delete payload.status;
  if (options.isEditing) return payload;

  const now = options.now ?? new Date();
  const random = options.random ?? Math.random;
  return {
    ...payload,
    task_no: stringValue(payload.task_no) || buildTaskNo(now, random),
    inbound_no: stringValue(payload.inbound_no) || buildInboundNo(now),
    status: "PENDING",
    date: stringValue(payload.date) || now.toISOString().slice(0, 10),
  };
}

export function buildWarehouseInboundConfirmPayload(row: InboundRow): WarehouseInboundConfirmBuildResult {
  const taskNo = stringValue(row?.task_no);
  if (!taskNo) return { ok: false, reason: "missing_task_no" };

  const productCode = stringValue(row?.product_code);
  const skuCode = stringValue(row?.sku_code);
  const materialCode = stringValue(row?.material_code);
  const fallbackItem = stringValue(row?.item);
  if (!productCode && !skuCode && !materialCode && !fallbackItem) {
    return { ok: false, reason: "missing_product_code" };
  }

  const actualQty = quantityValue(row?.actual_qty ?? row?.qty);
  if (actualQty <= 0) return { ok: false, reason: "invalid_qty" };

  const item: WarehouseInboundConfirmItem = {
    actual_qty: actualQty,
    expected_qty: actualQty,
  };
  if (productCode) item.product_code = productCode;
  if (skuCode) item.sku_code = skuCode;
  if (materialCode) item.material_code = materialCode;
  if (!productCode && !skuCode && !materialCode) item.product_code = fallbackItem;
  const itemType = stringValue(row?.item_type);
  const materialType = stringValue(row?.material_type);
  const unit = stringValue(row?.unit);
  if (itemType) item.item_type = itemType;
  if (materialType) item.material_type = materialType;
  if (unit) item.unit = unit;

  const batchNo = stringValue(row?.batch_no);
  const warehouseCode = stringValue(row?.warehouse_code);
  const locationCode = stringValue(row?.location_code);
  if (batchNo) item.batch_no = batchNo;
  if (warehouseCode) item.warehouse_code = warehouseCode;
  if (locationCode) item.location_code = locationCode;

  return { ok: true, payload: { task_no: taskNo, items: [item] } };
}

export function getWarehouseInboundConfirmKeyword(row: InboundRow): string {
  return stringValue(row?.material_code)
    || stringValue(row?.sku_code)
    || stringValue(row?.product_code)
    || stringValue(row?.item)
    || stringValue(row?.inbound_no)
    || stringValue(row?.task_no);
}
