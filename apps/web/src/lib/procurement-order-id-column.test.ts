import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("procurement order list ID visibility", () => {
  it("shows the internal purchase-order ID before the business order number", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/(admin)/procurement2/orders/page.tsx"), "utf8");
    const idHeader = source.indexOf("t('prc2.po_id'");
    const numberHeader = source.indexOf("t('prc2.po_no'");

    expect(idHeader).toBeGreaterThan(0);
    expect(numberHeader).toBeGreaterThan(idHeader);
    expect(source).toContain("{row.id}</td>");
    expect(source).toContain("prc2.po_id_help");
    expect(source).toContain("aria-label={`${t('prc2.po_id'");
    expect(source).toContain("colSpan={13}");
    expect(source.indexOf("value: detailData.id")).toBeLessThan(source.indexOf("value: detailData.poNo"));
  });

  it("shows generated identifiers as read-only fields in the create/edit form", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/(admin)/procurement2/orders/OrderForm.tsx"), "utf8");
    expect(source).toContain("setFOrderId(row.id ?? orderId)");
    expect(source).toContain('setFPoNo(row.poNo ?? "")');
    expect(source).toContain("value={fOrderId || generatedAfterSave}");
    expect(source).toContain("value={fPoNo || generatedAfterSave}");
    expect(source).toContain('readOnly aria-readonly="true"');
  });
});
