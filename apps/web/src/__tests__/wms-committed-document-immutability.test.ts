import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("WMS committed document action contract", () => {
  it("hides inbound edit/delete actions after confirmation", () => {
    const page = read("app/(admin)/warehouse/inbound/page.tsx");
    expect(page).toContain('["PENDING", "PROCESSING"].includes');
    expect(page).toContain('=== "PENDING"');
    expect(page).toContain("isEditableRow(row)");
    expect(page).toContain("isDeletableRow(row)");
  });

  it("does not expose APPROVED as a generic stocktake or loss status", () => {
    const stocktake = read("app/(admin)/warehouse/stocktake/page.tsx");
    const loss = read("app/(admin)/warehouse/loss-report/page.tsx");
    expect(stocktake).toContain('String(row.status ?? "").toUpperCase() !== "APPROVED"');
    expect(loss).toContain('String(row.status ?? "").toUpperCase() !== "APPROVED"');
    expect(stocktake).toContain("isMutableRow(row)");
    expect(loss).toContain("isMutableRow(row)");
    expect(stocktake).not.toMatch(/label: t\("status\.approved"[\s\S]{0,80}value: "APPROVED"/);
    expect(loss).not.toMatch(/label: t\("status\.approved"[\s\S]{0,80}value: "APPROVED"/);
  });
});
