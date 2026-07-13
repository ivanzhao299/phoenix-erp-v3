import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pageSource = readFileSync(
  join(process.cwd(), "src/app/(admin)/sales2/pricing/page.tsx"),
  "utf8",
);

describe("sales pricing lifecycle action repair", () => {
  it("uses the sales price permission hook for price-book action visibility", () => {
    expect(pageSource).toContain('usePermission("MENU_SALES2_PRICE")');
    expect(pageSource).toContain("pricePerm.canCreate");
    expect(pageSource).toContain("pricePerm.canApprove");
    expect(pageSource).toContain("pricePerm.canDelete");
  });

  it("exposes the guarded restore action for cancelled price books", () => {
    expect(pageSource).toContain('row.status === "CANCELLED" && pricePerm.canApprove');
    expect(pageSource).toContain('doAction(row.id, "restore"');
    expect(pageSource).toContain("t('ui.恢复','恢复')");
  });

  it("exposes guarded draft deletion with a danger confirmation", () => {
    expect(pageSource).toContain("const deleteBook = async");
    expect(pageSource).toContain('method: "DELETE"');
    expect(pageSource).toContain("pricePerm.canDelete && <button");
    expect(pageSource).toContain("confirmLabel: t('ui.确认删除','确认删除')");
    expect(pageSource).toContain("danger: true");
  });
});
