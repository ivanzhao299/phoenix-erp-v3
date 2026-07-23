import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pageSource = readFileSync(
  join(process.cwd(), "src/app/(admin)/sales2/pricing/page.tsx"),
  "utf8",
);

describe("BUG-20260723-0007 sales pricing approval submit", () => {
  it("keeps submit visibility behind the existing price approval permission", () => {
    expect(pageSource).toContain("pricePerm.canApprove");
    expect(pageSource).toContain('onClick={() => openSubmit(row)}');
  });

  it("loads approvers with the sales price permission and company data scope", () => {
    expect(pageSource).toContain('menuCode: "MENU_SALES2_PRICE"');
    expect(pageSource).toContain('requiredPerm: "E"');
    expect(pageSource).toContain('params.set("companyCode", row.company_code)');
    expect(pageSource).toContain("/api/approval/eligible-approvers?");
  });

  it("submits the selected approver and optional comment", () => {
    expect(pageSource).toContain("approverUserId: approverUserId || undefined");
    expect(pageSource).toContain("comment: submitComment.trim() || undefined");
    expect(pageSource).toContain("提交给所选审批人");
  });

  it("preserves loading, empty, and API error states", () => {
    expect(pageSource).toContain("submitCandidateLoading");
    expect(pageSource).toContain("未找到可指定审批人");
    expect(pageSource).toContain("setErrorMsg(e.message)");
  });
});
