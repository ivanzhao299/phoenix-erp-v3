import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pageSource = readFileSync(
  join(process.cwd(), "src/app/(admin)/procurement2/shipments/page.tsx"),
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
});
