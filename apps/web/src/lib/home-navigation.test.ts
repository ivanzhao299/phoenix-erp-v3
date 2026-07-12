import { describe, expect, it } from "vitest";
import { PROCUREMENT_DASHBOARD_PATH, resolveProcurementCenterHref, type HomeNavigationPermissionChecker } from "./home-navigation";

function checker(entries: string[]): HomeNavigationPermissionChecker {
  return (menuCode, permCode = "V") => !menuCode || entries.includes("*") || entries.includes(`${menuCode}:${permCode}`);
}

describe("resolveProcurementCenterHref", () => {
  it("uses the procurement dashboard when its permission exists", () => {
    expect(resolveProcurementCenterHref(checker(["MENU_PRC2_DASHBOARD:V"]), () => "/procurement2/payments"))
      .toBe(PROCUREMENT_DASHBOARD_PATH);
  });

  it("falls back to the first visible child without dashboard permission", () => {
    expect(resolveProcurementCenterHref(checker(["MENU_PRC2_PAYMENT:V"]), () => "/procurement2/payments"))
      .toBe("/procurement2/payments");
  });

  it("does not expose an inaccessible procurement route", () => {
    expect(resolveProcurementCenterHref(checker([]), () => undefined)).toBeUndefined();
  });
});
