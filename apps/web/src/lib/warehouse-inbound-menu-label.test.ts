import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("warehouse inbound navigation label", () => {
  it("keeps /warehouse/inbound labeled as 入库管理", () => {
    const sidebarSource = readFileSync(
      resolve(process.cwd(), "src/components/layout/Sidebar.tsx"),
      "utf8",
    );
    const zhLocale = JSON.parse(readFileSync(resolve(process.cwd(), "src/locales/zh.json"), "utf8")) as Record<string, string>;

    const inboundMenuEntry = sidebarSource.match(
      /\{ id: "wh-in",\s+path: "\/warehouse\/inbound",[\s\S]*?\}/,
    )?.[0];

    expect(inboundMenuEntry).toContain('label: "入库管理"');
    expect(inboundMenuEntry).not.toContain('label: "手工入库"');
    expect(zhLocale["menu.wh-in"]).toBe("入库管理");
  });
});
