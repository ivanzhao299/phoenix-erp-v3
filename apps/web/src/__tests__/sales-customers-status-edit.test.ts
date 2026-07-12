import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pageSource = readFileSync(
  join(process.cwd(), "src/app/(admin)/sales2/customers/page.tsx"),
  "utf8",
);

describe("sales customers status edit repair", () => {
  it("adds status to the customer edit form with a default active value", () => {
    expect(pageSource).toContain("const CUSTOMER_STATUS_OPTIONS = [{");
    expect(pageSource).toContain('key: "status"');
    expect(pageSource).toContain("label: t('ui.状态', '状态')");
    expect(pageSource).toContain('defaultValue: "ACTIVE"');
    expect(pageSource).toContain('status: editing.status ?? "ACTIVE"');
  });

  it("uses status action endpoints instead of patching status directly", () => {
    expect(pageSource).toContain("const applyCustomerStatus = async");
    expect(pageSource).toContain('status === "ACTIVE" ? "activate"');
    expect(pageSource).toContain('status === "FROZEN" ? "freeze" : "blacklist"');
    expect(pageSource).toContain("delete patchValues.status");
    expect(pageSource).toContain("await applyCustomerStatus(editing.id, requestedStatus)");
  });

  it("releases blacklisted customers before saving editable fields and surfaces save errors", () => {
    expect(pageSource).toContain('currentStatus === "BLACKLIST"');
    expect(pageSource).toContain('await applyCustomerStatus(editing.id, "ACTIVE")');
    expect(pageSource).toContain("await patchCustomer(editing.id, patchValues)");
    expect(pageSource).toContain('role="alert"');
    expect(pageSource).toContain("setSaveError(err instanceof Error ? err.message");
  });
});
