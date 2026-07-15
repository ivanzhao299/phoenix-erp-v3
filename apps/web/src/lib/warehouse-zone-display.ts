export type WarehouseZoneRow = Record<string, unknown>;

export const DEFAULT_ZONE_TYPE_LABELS: Record<string, string> = {
  NORMAL: "常温区",
  AMBIENT: "常温区",
  COLD: "冷藏区",
  CHILLED: "冷藏区",
  REFRIGERATED: "冷藏区",
  FROZEN: "冷冻区",
  FREEZER: "冷冻区",
  STAGING: "暂存区",
  TEMPORARY: "暂存区",
  RETURN: "退货区",
  RETURNS: "退货区",
};

export const DEFAULT_ZONE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "启用",
  ENABLED: "启用",
  "1": "启用",
  "true": "启用",
  INACTIVE: "停用",
  DISABLED: "停用",
  "0": "停用",
  "false": "停用",
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function firstText(row: WarehouseZoneRow, keys: string[]): string {
  for (const key of keys) {
    const value = clean(row[key]);
    if (value) return value;
  }
  return "";
}

export function formatWarehouseZoneWarehouse(
  value: unknown,
  row: WarehouseZoneRow,
  warehouseLabelMap: Record<string, string> = {}
): string {
  const code = clean(value || row.warehouse_code || row.warehouseCode);
  if (!code) return "—";

  const rowName = firstText(row, [
    "warehouse_name_zh",
    "warehouseNameZh",
    "warehouse_name",
    "warehouseName",
  ]);
  const label = rowName || warehouseLabelMap[code] || "";
  return label ? `${label}（${code}）` : code;
}

export function formatWarehouseZoneType(
  value: unknown,
  dictCodeMap: Record<string, string> = {}
): string {
  const code = clean(value);
  if (!code) return "—";
  return dictCodeMap[code] || DEFAULT_ZONE_TYPE_LABELS[code] || code;
}

export function formatWarehouseZoneStatus(value: unknown): string {
  const code = clean(value);
  if (!code) return "—";
  return DEFAULT_ZONE_STATUS_LABELS[code] || code;
}
