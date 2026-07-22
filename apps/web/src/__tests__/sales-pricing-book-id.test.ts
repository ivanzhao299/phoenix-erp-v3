import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pageSource = readFileSync(
  join(process.cwd(), "src/app/(admin)/sales2/pricing/page.tsx"),
  "utf8",
);

describe("sales pricing price-book ID regression", () => {
  it("renders the price-book ID as the first table column", () => {
    const idHeader = "t('ui.价格册 ID','价格册 ID')";
    const numberHeader = "t('ui.编号','编号')";

    expect(pageSource).toContain(`[${idHeader}, ${numberHeader}`);
    expect(pageSource).toContain("{row.id}</td>");
  });

  it("keeps loading and empty states aligned with all ten columns", () => {
    expect(pageSource).toContain("loading && <tr><td colSpan={10}");
    expect(pageSource).toContain("rows.length === 0 && <tr><td colSpan={10}");
  });

  it("allows the widened table to scroll on narrow viewports", () => {
    expect(pageSource).toContain('overflowX: "auto"');
  });
});
