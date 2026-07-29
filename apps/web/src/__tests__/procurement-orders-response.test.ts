import { describe, expect, it } from "vitest";
import { normalizeProcurementOrdersPage } from "@/lib/procurement-orders-response";

describe("normalizeProcurementOrdersPage", () => {
  const order = { id: "35", poNo: "PO2-20260707-00002" };

  it("preserves a valid paginated response", () => {
    expect(normalizeProcurementOrdersPage({
      items: [order], total: 35, page: 1, pageSize: 20,
    })).toEqual({ items: [order], total: 35, page: 1, pageSize: 20 });
  });

  it("uses the loaded row count when total is zero or missing", () => {
    expect(normalizeProcurementOrdersPage({ items: [order], total: 0 })).toMatchObject({
      items: [order], total: 1,
    });
    expect(normalizeProcurementOrdersPage({ items: [order] })).toMatchObject({
      items: [order], total: 1,
    });
  });

  it("uses the loaded page boundary when a later page carries a stale total", () => {
    expect(normalizeProcurementOrdersPage({
      items: [order], total: 0, page: 2, pageSize: 20,
    })).toMatchObject({ total: 21, page: 2, pageSize: 20 });
  });

  it("accepts wrapped responses and keeps empty or malformed states safe", () => {
    expect(normalizeProcurementOrdersPage({ data: { items: [order], count: 1 } })).toMatchObject({
      items: [order], total: 1,
    });
    expect(normalizeProcurementOrdersPage(null)).toEqual({
      items: [], total: 0, page: 1, pageSize: 20,
    });
  });
});
