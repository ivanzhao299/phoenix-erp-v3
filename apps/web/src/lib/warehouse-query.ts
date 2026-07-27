export interface WarehouseQueryBatch {
  id?: number;
  batch_no?: string;
  product_code?: string;
  sku_code?: string;
  material_code?: string;
  item_type?: string;
  material_type?: string;
  unit?: string;
  product_name?: string;
  sku_name?: string;
  qty?: number | string | null;
  quantity_kg?: number | string | null;
  qty_available?: number | string | null;
  warehouse_code?: string;
  warehouse_name?: string;
  warehouse_name_zh?: string;
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

export interface WarehouseQuantityGroup {
  unit: string;
  quantity: number;
  batchCount: number;
}

export function groupWarehouseQuantitiesByUnit(rows: WarehouseQueryBatch[]): WarehouseQuantityGroup[] {
  const groups = new Map<string, WarehouseQuantityGroup>();
  for (const row of rows) {
    const unit = String(row.unit ?? "").trim() || "未标单位";
    const current = groups.get(unit) ?? { unit, quantity: 0, batchCount: 0 };
    current.quantity += getWarehouseBatchQuantity(row);
    current.batchCount += 1;
    groups.set(unit, current);
  }
  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      quantity: Math.round(group.quantity * 1000) / 1000,
    }))
    .sort((a, b) => a.unit.localeCompare(b.unit, "zh-CN"));
}

export function filterWarehouseBatchRows(rows: WarehouseQueryBatch[], keyword: string): WarehouseQueryBatch[] {
  const q = keyword.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => [
    row.batch_no,
    row.product_code,
    row.sku_code,
    row.material_code,
    row.item_type,
    row.material_type,
    row.unit,
    row.product_name,
    row.sku_name,
    row.warehouse_code,
    row.warehouse_name,
    row.warehouse_name_zh,
    row.location_code,
    row.store_code,
    row.status,
  ].some((value) => String(value ?? "").toLowerCase().includes(q)));
}

export function formatWarehouseDisplay(row: WarehouseQueryBatch): string {
  const code = String(row.warehouse_code ?? "").trim();
  const name = String(row.warehouse_name_zh ?? row.warehouse_name ?? "").trim();
  if (name && code && name !== code) return `${name}（${code}）`;
  return name || code || "—";
}

export function formatWarehouseBatchDate(value?: string): string {
  return value ? String(value).slice(0, 10) : "-";
}
