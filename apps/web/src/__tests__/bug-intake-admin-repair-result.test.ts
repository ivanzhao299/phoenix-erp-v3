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

  it("keeps the administrator workflow action visible outside technical details", () => {
    const actionIndex = pageSource.indexOf("受理并启动自动修复");
    const technicalIndex = pageSource.indexOf("showTechnicalDetails &&", actionIndex);
    expect(actionIndex).toBeGreaterThan(0);
    expect(technicalIndex).toBeGreaterThan(actionIndex);
    expect(pageSource).toContain("/start-repair");
    expect(pageSource).toContain("仍有问题，重新派发");
    expect(pageSource).toContain("确认问题已解决");
  });

  it("surfaces backend action failures instead of silently ignoring non-2xx responses", () => {
    expect(pageSource).toContain("async function apiJson");
    expect(pageSource).toContain("setActionError(actionErrorMessage(error, t(\"system.bugIntake.actionFailed\"");
    expect(pageSource).toContain('role="alert"');
  });
});
