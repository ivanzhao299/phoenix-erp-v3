import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pageSource = readFileSync(
  join(process.cwd(), "src/app/(admin)/procurement2/shipments/page.tsx"),
  "utf8",
);

const ordersPageSource = readFileSync(
  join(process.cwd(), "src/app/(admin)/procurement2/orders/page.tsx"),
  "utf8",
);

const cssSource = readFileSync(
  join(process.cwd(), "src/app/(admin)/procurement2/shipments/shipments.module.css"),
  "utf8",
);

describe("procurement shipments drawer layout", () => {
  it("uses a page-scoped layout instead of the shared title-only formSection", () => {
    expect(pageSource).toContain('import styles from "./shipments.module.css"');
    expect(pageSource).toContain("className={styles.shipmentForm}");
    expect(pageSource).toContain("className={styles.formSection}");
    expect(pageSource).not.toContain("className={s.formSection}");
    expect(pageSource).not.toContain("className={`${s.formSection}");
  });

  it("keeps shipment form actions in the drawer footer and supports mobile single-column layout", () => {
    expect(pageSource).toContain("footer={formOpen ? (");
    expect(pageSource).toContain("className={styles.drawerActions}");
    expect(cssSource).toContain("grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)");
    expect(cssSource).toContain("@media (max-width: 768px)");
    expect(cssSource).toContain("grid-template-columns: minmax(0, 1fr)");
  });

  it("lets approved procurement orders start a shipment with locked PO prefill", () => {
    expect(ordersPageSource).toContain('usePermission("MENU_PRC2_SHIPMENT")');
    expect(ordersPageSource).toContain("shipmentPerm.canCreate");
    expect(ordersPageSource).toContain('create: "1"');
    expect(ordersPageSource).toContain("poId: row.id");
    expect(ordersPageSource).toContain("poNo: row.poNo");
    expect(ordersPageSource).toContain("/procurement2/shipments?");
    expect(pageSource).toContain('usePermission("MENU_PRC2_SHIPMENT")');
    expect(pageSource).toContain('params.get("create") !== "1"');
    expect(pageSource).toContain('params.get("poId")?.trim()');
    expect(pageSource).toContain('params.get("poNo")?.trim()');
    expect(pageSource).toContain("if (!shipmentPerm.canCreate) return");
    expect(pageSource).toContain("{shipmentPerm.canCreate && <button");
    expect(pageSource).toContain("openNew({");
    expect(pageSource).toContain("readOnly={poLocked}");
    expect(pageSource).toContain("aria-readonly={poLocked}");
  });
});
