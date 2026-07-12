import { describe, expect, it } from "vitest";
import {
  buildWarehouseInboundConfirmPayload,
  buildWarehouseInboundSavePayload,
  getWarehouseInboundConfirmKeyword,
} from "./warehouse-inbound";

describe("warehouse inbound helpers", () => {
  it("forces new rows to pending so inventory changes only through confirm", () => {
    expect(buildWarehouseInboundSavePayload({
      item: "PRD-EGG-1",
      qty: 12,
      status: "COMPLETED",
    }, {
      now: new Date("2026-07-09T01:15:45.325Z"),
      random: () => 0.123456,
    })).toMatchObject({
      inbound_no: "WI-745325",
      task_no: "INB-20260709-4FZY",
      date: "2026-07-09",
      status: "PENDING",
    });
  });

  it("strips generic status edits so CRUD cannot bypass confirmation", () => {
    expect(buildWarehouseInboundSavePayload({
      item: "PRD-EGG-1",
      qty: 12,
      status: "COMPLETED",
      remark: "fix qty only",
    }, { isEditing: true })).toEqual({
      item: "PRD-EGG-1",
      qty: 12,
      remark: "fix qty only",
    });
  });

  it("builds WMS confirm payloads from admin inbound rows", () => {
    expect(buildWarehouseInboundConfirmPayload({
      task_no: "INB-20260708-ABCD",
      item: "PRD-EGG-1",
      qty: "12",
      warehouse_code: "WH-A",
      location_code: "LOC-01",
    })).toEqual({
      ok: true,
      payload: {
        task_no: "INB-20260708-ABCD",
        items: [{
          product_code: "PRD-EGG-1",
          actual_qty: 12,
          expected_qty: 12,
          warehouse_code: "WH-A",
          location_code: "LOC-01",
        }],
      },
    });
  });

  it("prefers explicit product_code and batch_no when available", () => {
    expect(buildWarehouseInboundConfirmPayload({
      task_no: "INB-20260708-EFGH",
      item: "legacy item text",
      product_code: "SKU-EGG",
      batch_no: "B-001",
      qty: 8.9,
    })).toEqual({
      ok: true,
      payload: {
        task_no: "INB-20260708-EFGH",
        items: [{
          product_code: "SKU-EGG",
          actual_qty: 8,
          expected_qty: 8,
          batch_no: "B-001",
        }],
      },
    });
  });

  it("rejects rows that cannot create inventory safely", () => {
    expect(buildWarehouseInboundConfirmPayload({ item: "PRD-EGG-1", qty: 1 })).toEqual({ ok: false, reason: "missing_task_no" });
    expect(buildWarehouseInboundConfirmPayload({ task_no: "INB-1", qty: 1 })).toEqual({ ok: false, reason: "missing_product_code" });
    expect(buildWarehouseInboundConfirmPayload({ task_no: "INB-1", item: "PRD-EGG-1", qty: 0 })).toEqual({ ok: false, reason: "invalid_qty" });
  });

  it("uses the inventory-query keyword that will match the created batch product code", () => {
    expect(getWarehouseInboundConfirmKeyword({ product_code: "SKU-EGG", item: "legacy" })).toBe("SKU-EGG");
    expect(getWarehouseInboundConfirmKeyword({ item: "LPH-MED-003" })).toBe("LPH-MED-003");
    expect(getWarehouseInboundConfirmKeyword({ inbound_no: "WI-123" })).toBe("WI-123");
  });
});
