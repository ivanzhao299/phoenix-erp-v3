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
    expect(source).toContain("colSpan={13}");
  });
});
