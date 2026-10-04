import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildSalesPriceAnomaliesPath,
  getSalesPriceAnomalyError,
} from "@/lib/sales-price-anomalies";

const pageSource = readFileSync(
  join(process.cwd(), "src/app/(admin)/sales2/pricing/page.tsx"),
  "utf8",
);

describe("sales pricing price anomaly closure", () => {
  it("builds the existing endpoint contract without reimplementing anomaly math", () => {
    expect(buildSalesPriceAnomaliesPath(10)).toBe(
      "/api/v2/sales/analytics/price-anomalies?threshold=10&limit=100",
    );
    expect(pageSource).toContain('usePermission("MENU_SALES2_REPORT")');
    expect(pageSource).toContain("buildSalesPriceAnomaliesPath(threshold)");
    expect(pageSource).not.toContain("Math.abs((actual");
  });

  it("renders loading, result, below-floor, empty, and error states", () => {
    expect(pageSource).toContain("t('ui.加载中…','加载中…')");
    expect(pageSource).toContain("t('ui.暂无数据','当前没有价格异常记录')");
    expect(pageSource).toContain("t('ui.低于底价','低于底价')");
    expect(pageSource).toContain("role=\"alert\"");
    expect(pageSource).toContain("setRows([]);");
  });

  it("prefers the API business error message", () => {
    expect(getSalesPriceAnomalyError(new Error("业务拒绝查询"), "fallback")).toBe("业务拒绝查询");
    expect(getSalesPriceAnomalyError({}, "fallback")).toBe("fallback");
  });

  it("keeps the existing reports page contract intact", () => {
    const reportsSource = readFileSync(
      join(process.cwd(), "src/app/(admin)/sales2/reports/page.tsx"),
      "utf8",
    );
    expect(reportsSource).toContain("/api/v2/sales/analytics/price-anomalies?threshold=${threshold}");
  });
});
