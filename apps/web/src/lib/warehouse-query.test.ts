import { describe, expect, it } from "vitest";
import {
  filterWarehouseBatchRows,
  formatWarehouseBatchDate,
  formatWarehouseDisplay,
  getWarehouseBatchQuantity,
  groupWarehouseQuantitiesByUnit,
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

  it("never adds incompatible inventory units into one stock total", () => {
    expect(groupWarehouseQuantitiesByUnit([
      { batch_no: "EGG-1", qty_available: "120", unit: "枚" },
      { batch_no: "EGG-2", qty_available: "30.5", unit: "枚" },
      { batch_no: "FEED-1", qty_available: "25.75", unit: "kg" },
      { batch_no: "LEGACY-1", qty_available: 2 },
    ])).toEqual([
      { unit: "枚", quantity: 150.5, batchCount: 2 },
      { unit: "未标单位", quantity: 2, batchCount: 1 },
      { unit: "kg", quantity: 25.75, batchCount: 1 },
    ]);
  });

  it("formats batch dates without leaking undefined into the table", () => {
    expect(formatWarehouseBatchDate("2026-07-10T04:38:18.820Z")).toBe("2026-07-10");
    expect(formatWarehouseBatchDate()).toBe("-");
  });

  it("shows the Chinese warehouse name with its stable code", () => {
    expect(formatWarehouseDisplay({
      warehouse_code: "LPH_MS_EGG_FARM",
      warehouse_name: "Mengsai Egg Farm Storage",
      warehouse_name_zh: "孟赛农场鸡蛋暂存仓",
    })).toBe("孟赛农场鸡蛋暂存仓（LPH_MS_EGG_FARM）");
    expect(formatWarehouseDisplay({ warehouse_code: "WH-ONLY" })).toBe("WH-ONLY");
  });
});
