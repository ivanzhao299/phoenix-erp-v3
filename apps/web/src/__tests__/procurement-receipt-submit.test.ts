import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { receiptScopeFromPurchaseOrder } from "@/lib/procurement-receipt-submit";

const receiptPage = readFileSync(
  join(process.cwd(), "src/app/(admin)/procurement2/receipts/page.tsx"),
  "utf8",
);

describe("receiptScopeFromPurchaseOrder", () => {
  it("preserves the PO company and project DataScope in the receipt payload", () => {
    expect(receiptScopeFromPurchaseOrder({
      companyId: "7",
      companyCode: "LPH",
      companyName: "老挝凤凰农业发展有限公司",
      projectId: "19",
      projectCode: "PRJ_MENGSAI_LAYER",
      projectName: "勐赛蛋鸡项目",
    })).toEqual({
      companyId: "7",
      companyCode: "LPH",
      companyName: "老挝凤凰农业发展有限公司",
      projectId: "19",
      projectCode: "PRJ_MENGSAI_LAYER",
      projectName: "勐赛蛋鸡项目",
    });
  });

  it("does not invent optional project scope for a company-only PO", () => {
    expect(receiptScopeFromPurchaseOrder({
      companyCode: "LPH",
      projectCode: "",
    })).toEqual({
      companyId: undefined,
      companyCode: "LPH",
      companyName: undefined,
      projectId: undefined,
      projectCode: undefined,
      projectName: undefined,
    });
  });

  it("loads authorized POs, wires the selected PO scope into create, and clears it when selection changes", () => {
    expect(receiptPage).toContain(
      "setFormPoScope(receiptScopeFromPurchaseOrder(po))",
    );
    expect(receiptPage).toContain(
      "/api/v2/procurement/receipts/eligible-orders",
    );
    expect(receiptPage).toMatch(
      /poNo: formPoNo,\s+\.\.\.formPoScope,\s+shipmentId:/,
    );
    expect(receiptPage).toMatch(
      /const handlePoPick = \(poId: string\) => \{[\s\S]*setFormPoId\(poId\);[\s\S]*setFormPoScope\(\{\}\);/,
    );
    expect(receiptPage).toContain("onChange={e => handlePoPick(e.target.value)}");
  });
});
