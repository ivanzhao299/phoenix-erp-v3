import { describe, expect, it } from "vitest";
import { findMenuItemByPath, pathTitle } from "@/components/layout/Sidebar";
import zh from "@/locales/zh.json";

describe("dashboard navigation label", () => {
  it("keeps the business dashboard name consistent", () => {
    expect(findMenuItemByPath("/dashboard")?.label).toBe("经营仪表盘");
    expect(pathTitle("/dashboard")).toBe("经营仪表盘");
    expect(zh["menu.dashboard"]).toBe("经营仪表盘");
  });
});
