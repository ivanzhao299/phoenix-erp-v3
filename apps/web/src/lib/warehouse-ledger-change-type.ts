export type WarehouseLedgerChangeTone = "default" | "success" | "warning" | "danger" | "info" | "brand";

const CHANGE_TYPE_LABELS: Record<string, string> = {
  ADJUST: "库存调整",
  EGG_IN: "蛋品入库",
  EGG_REVERSED: "蛋品冲销",
  FARM_IN: "养殖入库",
  FARM_OUT_MEDICATION: "养殖用药出库",
  FARM_REVERSED: "养殖冲销",
  MED_INBOUND: "药品入库",
  MED_OUTBOUND: "药品出库",
  PACK_DONE: "包装完成入库",
  PACKAGING_INBOUND: "包装入库",
  SALE_OUT: "销售出库",
  SCRAP: "报废",
  TEMP_PRODUCTION_INBOUND: "临时生产入库",
  TRANSFER_IN: "调拨入库",
  TRANSFER_OUT: "调拨出库",
};

const CHANGE_TYPE_TONES: Record<string, WarehouseLedgerChangeTone> = {
  ADJUST: "warning",
  EGG_IN: "success",
  EGG_REVERSED: "danger",
  FARM_IN: "success",
  FARM_OUT_MEDICATION: "danger",
  FARM_REVERSED: "danger",
  MED_INBOUND: "success",
  MED_OUTBOUND: "danger",
  PACK_DONE: "success",
  PACKAGING_INBOUND: "success",
  SALE_OUT: "danger",
  SCRAP: "default",
  TEMP_PRODUCTION_INBOUND: "success",
  TRANSFER_IN: "info",
  TRANSFER_OUT: "warning",
};

export function formatWarehouseLedgerChangeType(value: unknown): string {
  const code = String(value ?? "").trim();
  if (!code) return "—";
  return CHANGE_TYPE_LABELS[code] ?? code;
}

export function getWarehouseLedgerChangeTone(value: unknown): WarehouseLedgerChangeTone {
  const code = String(value ?? "").trim();
  if (CHANGE_TYPE_TONES[code]) return CHANGE_TYPE_TONES[code];
  if (code.endsWith("_IN") || code.endsWith("_INBOUND")) return "success";
  if (code.endsWith("_OUT") || code.endsWith("_OUTBOUND")) return "danger";
  if (code.includes("TRANSFER")) return "warning";
  return "default";
}
