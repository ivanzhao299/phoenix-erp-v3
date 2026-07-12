export interface WarehouseInboundConfirmItem {
  product_code: string;
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

export type WarehouseInboundConfirmBuildResult =
  | { ok: true; payload: WarehouseInboundConfirmPayload }
  | { ok: false; reason: "missing_task_no" | "missing_product_code" | "invalid_qty" };

type InboundRow = Record<string, unknown> | null | undefined;

function stringValue(value: unknown): string {
  return String(value ?? "").trim();
}

function intValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

export function buildWarehouseInboundConfirmPayload(row: InboundRow): WarehouseInboundConfirmBuildResult {
  const taskNo = stringValue(row?.task_no);
  if (!taskNo) return { ok: false, reason: "missing_task_no" };

  const productCode = stringValue(row?.product_code) || stringValue(row?.item);
  if (!productCode) return { ok: false, reason: "missing_product_code" };

  const actualQty = intValue(row?.actual_qty ?? row?.qty);
  if (actualQty <= 0) return { ok: false, reason: "invalid_qty" };

  const item: WarehouseInboundConfirmItem = {
    product_code: productCode,
    actual_qty: actualQty,
    expected_qty: actualQty,
  };

  const batchNo = stringValue(row?.batch_no);
  const warehouseCode = stringValue(row?.warehouse_code);
  const locationCode = stringValue(row?.location_code);
  if (batchNo) item.batch_no = batchNo;
  if (warehouseCode) item.warehouse_code = warehouseCode;
  if (locationCode) item.location_code = locationCode;

  return { ok: true, payload: { task_no: taskNo, items: [item] } };
}

export function getWarehouseInboundConfirmKeyword(row: InboundRow): string {
  return stringValue(row?.product_code) || stringValue(row?.item) || stringValue(row?.inbound_no) || stringValue(row?.task_no);
}
