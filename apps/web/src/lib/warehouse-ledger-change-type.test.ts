import { describe, expect, it } from "vitest";
import {
  formatWarehouseLedgerChangeType,
  getWarehouseLedgerChangeTone,
} from "./warehouse-ledger-change-type";

describe("warehouse ledger change type display", () => {
  it("localizes the transaction codes captured in BUG-20260708-0004 evidence", () => {
    expect(formatWarehouseLedgerChangeType("FARM_OUT_MEDICATION")).toBe("养殖用药出库");
    expect(formatWarehouseLedgerChangeType("TEMP_PRODUCTION_INBOUND")).toBe("临时生产入库");
    expect(formatWarehouseLedgerChangeType("FARM_IN")).toBe("养殖入库");
    expect(formatWarehouseLedgerChangeType("MED_INBOUND")).toBe("药品入库");
    expect(formatWarehouseLedgerChangeType("MED_OUTBOUND")).toBe("药品出库");
    expect(formatWarehouseLedgerChangeType("PRODUCTION_ISSUE")).toBe("生产领用出库");
    expect(formatWarehouseLedgerChangeType("SPARE_PART_ISSUE")).toBe("配件领用出库");
    expect(formatWarehouseLedgerChangeType("SALE_OUTBOUND")).toBe("销售出库");
  });

  it("keeps unknown codes visible instead of hiding ledger audit data", () => {
    expect(formatWarehouseLedgerChangeType("CUSTOM_BACKFILL")).toBe("CUSTOM_BACKFILL");
    expect(formatWarehouseLedgerChangeType("")).toBe("—");
  });

  it("assigns movement tones for known and directional fallback codes", () => {
    expect(getWarehouseLedgerChangeTone("MED_INBOUND")).toBe("success");
    expect(getWarehouseLedgerChangeTone("FARM_OUT_MEDICATION")).toBe("danger");
    expect(getWarehouseLedgerChangeTone("CUSTOM_OUTBOUND")).toBe("danger");
    expect(getWarehouseLedgerChangeTone("CUSTOM_INBOUND")).toBe("success");
  });
});
