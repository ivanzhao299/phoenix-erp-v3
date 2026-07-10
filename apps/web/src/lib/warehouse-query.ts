export interface WarehouseQueryBatch {
  id?: number;
  batch_no?: string;
  product_code?: string;
  product_name?: string;
  sku_name?: string;
  qty?: number | string | null;
  quantity_kg?: number | string | null;
  qty_available?: number | string | null;
  warehouse_code?: string;
  location_code?: string;
  expire_date?: string;
  expiry_date?: string;
  store_code?: string;
  status?: string;
}

type RowEnvelope = {
  data?: unknown;
  rows?: unknown;
  items?: unknown;
};

export function normalizeWarehouseBatchRows(payload: unknown): WarehouseQueryBatch[] {
  if (Array.isArray(payload)) return payload as WarehouseQueryBatch[];

  const root = payload as RowEnvelope | null | undefined;
  const data = root?.data as RowEnvelope | unknown[] | null | undefined;
  const candidates = [
    Array.isArray(data) ? data : undefined,
    !Array.isArray(data) ? data?.data : undefined,
    !Array.isArray(data) ? data?.rows : undefined,
    !Array.isArray(data) ? data?.items : undefined,
    root?.rows,
    root?.items,
  ];
  const rows = candidates.find(Array.isArray);
  return rows ? rows as WarehouseQueryBatch[] : [];
}

export function getWarehouseBatchQuantity(row: WarehouseQueryBatch): number {
  const raw = row.qty_available ?? row.qty ?? row.quantity_kg ?? 0;
  const qty = Number(raw);
  return Number.isFinite(qty) ? qty : 0;
}

export function filterWarehouseBatchRows(rows: WarehouseQueryBatch[], keyword: string): WarehouseQueryBatch[] {
  const q = keyword.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => [
    row.batch_no,
    row.product_code,
    row.product_name,
    row.sku_name,
    row.warehouse_code,
    row.location_code,
    row.store_code,
    row.status,
  ].some((value) => String(value ?? "").toLowerCase().includes(q)));
}

export function formatWarehouseBatchDate(value?: string): string {
  return value ? String(value).slice(0, 10) : "-";
}
