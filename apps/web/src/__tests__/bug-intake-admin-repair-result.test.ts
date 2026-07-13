import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pageSource = readFileSync(
  join(process.cwd(), "src/app/(admin)/bug-reports/page.tsx"),
  "utf8",
);

describe("bug intake administrator repair result visibility", () => {
  it("renders an administrator-facing result instead of requiring raw agent logs", () => {
    expect(pageSource).toContain("function RepairResultPanel");
    expect(pageSource).toContain("修复结果");
    expect(pageSource).toContain("提交版本");
    expect(pageSource).toContain("result.validations.map");
  });

  it("refreshes an open result every ten seconds", () => {
    expect(pageSource).toContain("window.setInterval");
    expect(pageSource).toContain("10_000");
    expect(pageSource).toContain("每 10 秒自动更新");
    expect(pageSource).toContain("refreshDetail(detail.bugNo, false)");
  });

  it("keeps internal evidence hidden until the administrator asks for it", () => {
    expect(pageSource).toContain("查看技术过程与证据");
    expect(pageSource).toContain("隐藏技术过程与证据");
    expect(pageSource).toContain("showTechnicalDetails &&");
  });
});
