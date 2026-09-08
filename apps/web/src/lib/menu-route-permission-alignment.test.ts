import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canAccessPath,
  getVisibleMenu,
  type PermissionChecker,
} from "@/components/layout/Sidebar";

function checker(entries: string[]): PermissionChecker {
  return (menuCode, permCode = "V") =>
    !menuCode || entries.includes("*") || entries.includes(`${menuCode}:${permCode}`);
}

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("menu entry and target route permission alignment", () => {
  it("lets the procurement project permission cross the redirect into the shared project page", () => {
    const procurementProject = checker(["MENU_PRC2_PROJECT:V"]);

    expect(canAccessPath("/procurement2/projects", procurementProject)).toBe(true);
    expect(canAccessPath("/master-data/projects", procurementProject)).toBe(true);
    expect(canAccessPath("/master-data/customers", procurementProject)).toBe(false);
  });

  it("keeps other master-data project users and types isolated", () => {
    expect(canAccessPath("/master-data/projects", checker(["MENU_MD_PROJECT:V"]))).toBe(true);
    expect(canAccessPath("/master-data/projects", checker(["MENU_MD_CUSTOMER:V"]))).toBe(false);
  });

  it("gates transfer navigation with the permission required by its dedicated endpoints", () => {
    const inventoryMenu = getVisibleMenu(checker(["MENU_INV_BATCH:V"]));
    const transfer = inventoryMenu
      .find(item => item.id === "inventory")
      ?.children?.find(item => item.id === "wh-transfer");

    expect(transfer?.path).toBe("/warehouse/transfer");
    expect(canAccessPath("/warehouse/transfer", checker(["MENU_INV_BATCH:V"]))).toBe(true);
    expect(canAccessPath("/warehouse/transfer", checker(["MENU_WMS_INOUT:V"]))).toBe(false);
  });

  it("uses the backend write permissions for henhouse and manual inbound actions", () => {
    expect(source("src/app/(admin)/breeding/henhouse/page.tsx"))
      .toContain("usePermission('MENU_FARM_MASTER')");
    expect(source("src/app/(admin)/daily-work/page.tsx"))
      .toMatch(/key: 'manual_in'[\s\S]*?perm: 'MENU_WMS_INOUT',[\s\S]*?permOp: 'C'/);
  });
});
