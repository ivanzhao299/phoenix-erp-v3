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
  FEED_ISSUE: "饲料领用出库",
  MEDICINE_ISSUE: "兽药领用出库",
  PRODUCTION_ISSUE: "生产领用出库",
  LOGISTICS_ISSUE: "后勤领用出库",
  SPARE_PART_ISSUE: "配件领用出库",
  OFFICE_ISSUE: "办公领用出库",
  MAINTENANCE_ISSUE: "维修领用出库",
  SALE_OUTBOUND: "销售出库",
  RETURN_OUTBOUND: "采购退货出库",
  PACK_DONE: "包装完成入库",
  PACKAGING_INBOUND: "包装入库",
  SALE_OUT: "销售出库",
  SCRAP: "报废",
  TEMP_PRODUCTION_INBOUND: "临时生产入库",
  TEMP_PRODUCTION_REVERSAL: "误入库冲销",
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
  FEED_ISSUE: "warning",
  MEDICINE_ISSUE: "warning",
  PRODUCTION_ISSUE: "warning",
  LOGISTICS_ISSUE: "warning",
  SPARE_PART_ISSUE: "warning",
  OFFICE_ISSUE: "warning",
  MAINTENANCE_ISSUE: "warning",
  SALE_OUTBOUND: "danger",
  RETURN_OUTBOUND: "danger",
  PACK_DONE: "success",
  PACKAGING_INBOUND: "success",
  SALE_OUT: "danger",
  SCRAP: "default",
  TEMP_PRODUCTION_INBOUND: "success",
  TEMP_PRODUCTION_REVERSAL: "warning",
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

/** Keep the stored trace intact; the ledger shows only its business reference. */
export function formatWarehouseLedgerNote(
  value: unknown,
  changeType: unknown,
  t: (key: string, fallback: string) => string,
): string {
  if (changeType !== "TEMP_PRODUCTION_REVERSAL") return String(value ?? "—");
  let trace: unknown;
  try {
    trace = typeof value === "string" ? JSON.parse(value) : undefined;
  } catch {
    trace = undefined;
  }
  if (trace && typeof trace === "object" && !Array.isArray(trace)) {
    const record = trace as Record<string, unknown>;
    if (record.version === 1 && typeof record.case_id === "string" && record.case_id.trim()
      && typeof record.original_ledger_id === "number" && Number.isSafeInteger(record.original_ledger_id) && record.original_ledger_id > 0) {
      return t("warehouse.note.temp_production_reversal", "误入库冲销 · 原入库流水 #{id}")
        .replace("{id}", String(record.original_ledger_id));
    }
  }
  return t("warehouse.note.temp_production_reversal_pending", "误入库冲销 · 备注待核验");
}
