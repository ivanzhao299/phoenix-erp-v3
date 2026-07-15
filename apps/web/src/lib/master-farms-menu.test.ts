import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canAccessPath, getVisibleMenu, pathTitle, type PermissionChecker } from "@/components/layout/Sidebar";
import {
  FARM_MASTER_MENU_LABEL,
  FARM_MASTER_PATH,
  FARM_MASTER_PERMISSION,
  getFarmMasterUiState,
} from "@/lib/master-farms-ui";
import zh from "@/locales/zh.json";

const adminLayoutSource = readFileSync(
  join(process.cwd(), "src/app/(admin)/layout.tsx"),
  "utf8",
);

function checker(entries: string[]): PermissionChecker {
  return (menuCode, permCode = "V") => !menuCode || entries.includes("*") || entries.includes(`${menuCode}:${permCode}`);
}

describe("master farms navigation", () => {
  it("exposes farm master data from the master data center with farm master permission", () => {
    const menu = getVisibleMenu(checker([`${FARM_MASTER_PERMISSION}:V`]));
    const masterData = menu.find(item => item.id === "master-data");
    const farms = masterData?.children?.find(item => item.id === "mdc-farms");

    expect(farms?.path).toBe(FARM_MASTER_PATH);
    expect(farms?.label).toBe(FARM_MASTER_MENU_LABEL);
    expect(canAccessPath(FARM_MASTER_PATH, checker([`${FARM_MASTER_PERMISSION}:V`]))).toBe(true);
    expect(pathTitle(FARM_MASTER_PATH)).toBe(FARM_MASTER_MENU_LABEL);
    expect(zh["menu.mdc-farms"]).toBe(FARM_MASTER_MENU_LABEL);
  });

  it("does not expose the farm archive without farm master view permission", () => {
    const menu = getVisibleMenu(checker(["MENU_MD_CENTER:V"]));
    const masterData = menu.find(item => item.id === "master-data");

    expect(masterData?.children?.some(item => item.id === "mdc-farms")).toBe(false);
    expect(canAccessPath(FARM_MASTER_PATH, checker([]))).toBe(false);
  });

  it("shows the create affordance only with farm master create permission", () => {
    expect(getFarmMasterUiState({
      canCreate: true,
      canEdit: false,
      canDelete: false,
    })).toEqual({
      showCreateButton: true,
      enableCreate: true,
      showRowActions: false,
    });

    expect(getFarmMasterUiState({
      canCreate: false,
      canEdit: true,
      canDelete: false,
    })).toEqual({
      showCreateButton: false,
      enableCreate: false,
      showRowActions: true,
    });
  });

  it("uses the master data center locale key for the admin title", () => {
    expect(adminLayoutSource).toContain(`"${FARM_MASTER_PATH}":                 "menu.mdc-farms"`);
    expect(adminLayoutSource).not.toContain(`"${FARM_MASTER_PATH}":                 "menu.md-farms"`);
  });
});
