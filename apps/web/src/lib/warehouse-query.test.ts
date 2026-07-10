import { describe, expect, it } from "vitest";
import {
  filterWarehouseBatchRows,
  formatWarehouseBatchDate,
  getWarehouseBatchQuantity,
  normalizeWarehouseBatchRows,
} from "./warehouse-query";

describe("warehouse query helpers", () => {
  it("normalizes dedicated inventory endpoint row envelopes", () => {
    expect(normalizeWarehouseBatchRows({ data: { rows: [{ batch_no: "B-001" }] } })).toEqual([
      { batch_no: "B-001" },
    ]);
    expect(normalizeWarehouseBatchRows({ data: { data: [{ batch_no: "B-002" }] } })).toEqual([
      { batch_no: "B-002" },
    ]);
    expect(normalizeWarehouseBatchRows({ rows: [{ batch_no: "B-003" }] })).toEqual([
      { batch_no: "B-003" },
    ]);
  });

  it("keeps permission or malformed responses from becoming fake stock rows", () => {
    expect(normalizeWarehouseBatchRows({ code: 403, message: "MENU_PERMISSION_DENIED" })).toEqual([]);
    expect(normalizeWarehouseBatchRows(null)).toEqual([]);
  });

  it("filters visible inventory by batch, product, warehouse, location, store, status, and names", () => {
    const rows = [
      {
        batch_no: "B-001",
        product_code: "SKU-EGG",
        sku_name: "Fresh Egg",
        warehouse_code: "WH-A",
        location_code: "A-01",
        store_code: "ST-01",
        status: "AVAILABLE",
      },
      {
        batch_no: "B-002",
        product_code: "SKU-FEED",
        product_name: "Layer Feed",
        warehouse_code: "WH-B",
        location_code: "B-01",
        store_code: "ST-02",
        status: "FROZEN",
      },
    ];

    expect(filterWarehouseBatchRows(rows, "egg")).toHaveLength(1);
    expect(filterWarehouseBatchRows(rows, "wh-b")).toHaveLength(1);
    expect(filterWarehouseBatchRows(rows, "frozen")).toHaveLength(1);
    expect(filterWarehouseBatchRows(rows, "missing")).toHaveLength(0);
  });

  it("uses available quantity first and safely handles historical quantity fields", () => {
    expect(getWarehouseBatchQuantity({ qty_available: "12.5", qty: 99, quantity_kg: 100 })).toBe(12.5);
    expect(getWarehouseBatchQuantity({ qty: "8" })).toBe(8);
    expect(getWarehouseBatchQuantity({ quantity_kg: 6 })).toBe(6);
    expect(getWarehouseBatchQuantity({ qty_available: "not-a-number" })).toBe(0);
  });

  it("formats batch dates without leaking undefined into the table", () => {
    expect(formatWarehouseBatchDate("2026-07-10T04:38:18.820Z")).toBe("2026-07-10");
    expect(formatWarehouseBatchDate()).toBe("-");
  });
});
