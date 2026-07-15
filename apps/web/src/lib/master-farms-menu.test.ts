import { describe, expect, it } from "vitest";
import { canAccessPath, getVisibleMenu, pathTitle, type PermissionChecker } from "@/components/layout/Sidebar";
import zh from "@/locales/zh.json";

function checker(entries: string[]): PermissionChecker {
  return (menuCode, permCode = "V") => !menuCode || entries.includes("*") || entries.includes(`${menuCode}:${permCode}`);
}

describe("master farms navigation", () => {
  it("exposes farm master data from the master data center with farm master permission", () => {
    const menu = getVisibleMenu(checker(["MENU_FARM_MASTER:V"]));
    const masterData = menu.find(item => item.id === "master-data");
    const farms = masterData?.children?.find(item => item.id === "mdc-farms");

    expect(farms?.path).toBe("/master/farms");
    expect(farms?.label).toBe("养殖场档案");
    expect(canAccessPath("/master/farms", checker(["MENU_FARM_MASTER:V"]))).toBe(true);
    expect(pathTitle("/master/farms")).toBe("养殖场档案");
    expect(zh["menu.mdc-farms"]).toBe("养殖场档案");
  });

  it("does not expose the farm archive without farm master view permission", () => {
    const menu = getVisibleMenu(checker(["MENU_MD_CENTER:V"]));
    const masterData = menu.find(item => item.id === "master-data");

    expect(masterData?.children?.some(item => item.id === "mdc-farms")).toBe(false);
    expect(canAccessPath("/master/farms", checker([]))).toBe(false);
  });
});
