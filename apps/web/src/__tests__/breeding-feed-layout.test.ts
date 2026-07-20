import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pageSource = readFileSync(
  join(process.cwd(), "src/app/(admin)/breeding/feed/page.tsx"),
  "utf8",
);

const cssSource = readFileSync(
  join(process.cwd(), "src/app/(admin)/breeding/feed/feed.module.css"),
  "utf8",
);

describe("breeding feed ledger column alignment", () => {
  it("uses page-scoped header alignment that overrides the shared left-aligned table heading", () => {
    expect(pageSource).toContain("className={`${s.table} ${styles.feedTable}`}");
    expect(pageSource.match(/className=\{styles\.alignRight\}/g)).toHaveLength(5);
    expect(pageSource.match(/className=\{styles\.alignCenter\}/g)).toHaveLength(2);
    expect(cssSource).toContain(".feedTable th.alignRight");
    expect(cssSource).toContain(".feedTable th.alignCenter");
  });

  it("keeps the ledger readable through horizontal scrolling on narrow screens", () => {
    expect(pageSource).toContain("className={styles.tableViewport}");
    expect(cssSource).toContain("overflow-x: auto");
    expect(cssSource).toContain("min-width: 1080px");
    expect(cssSource).toContain("@media (max-width: 768px)");
    expect(cssSource).toContain("min-width: 980px");
  });

  it("preserves permission gates plus loading, empty, and error states", () => {
    expect(pageSource).toContain("usePermission('MENU_BREEDING')");
    expect(pageSource).toContain("{canEdit && (");
    expect(pageSource).toContain("{error && <div role=\"alert\"");
    expect(pageSource).toContain("loading ? <tr>");
    expect(pageSource).toContain("rows.length === 0 ? <tr>");
  });
});
