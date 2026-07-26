import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pageSource = readFileSync(
  join(process.cwd(), "src/app/(admin)/finance2/expenses/page.tsx"),
  "utf8",
);

describe("expense request approval routing", () => {
  it("loads eligible approvers using expense permission and company scope", () => {
    expect(pageSource).toContain("menuCode: 'MENU_FIN2_EXPENSE'");
    expect(pageSource).toContain("requiredPerm: 'E'");
    expect(pageSource).toContain("companyCode: data.company_code");
    expect(pageSource).toContain("/api/approval/eligible-approvers?");
  });

  it("requires an explicit candidate and submits that user to the backend", () => {
    expect(pageSource).toContain("disabled={!pickedApproverId || acting}");
    expect(pageSource).toContain("{ pickedApproverId }");
    expect(pageSource).toContain("提交给所选审批人");
  });

  it("fails closed when no scoped approver exists", () => {
    expect(pageSource).toContain("当前公司没有符合权限和数据域要求的审批人");
  });
});
