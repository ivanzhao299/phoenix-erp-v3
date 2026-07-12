import { describe, expect, it } from "vitest";
import {
  formatPilotAmount,
  getPilotReadinessLabel,
  getPilotStatusTone,
  getPilotStatusVariant,
} from "./pilot-run-ui";

describe("pilot run UI helpers", () => {
  it("formats currency values without layout-hostile decimals", () => {
    expect(formatPilotAmount(0)).toBe("¥0");
    expect(formatPilotAmount(9500)).toBe("¥9,500");
    expect(formatPilotAmount(12500)).toBe("¥1.3万");
    expect(formatPilotAmount(Number.NaN)).toBe("¥0");
  });

  it("maps score statuses to semantic visual variants", () => {
    expect(getPilotStatusVariant("GREEN")).toBe("good");
    expect(getPilotStatusVariant("YELLOW")).toBe("warn");
    expect(getPilotStatusVariant("RED")).toBe("danger");
    expect(getPilotStatusTone("GREEN")).toBe("green");
    expect(getPilotStatusTone("YELLOW")).toBe("amber");
    expect(getPilotStatusTone("RED")).toBe("red");
  });

  it("uses text-only readiness labels for compact KPI cards", () => {
    expect(getPilotReadinessLabel(true, 0)).toEqual({ label: "可上线", accentColor: "green" });
    expect(getPilotReadinessLabel(false, 3)).toEqual({ label: "3 项阻塞", accentColor: "red" });
    expect(getPilotReadinessLabel(false, -1)).toEqual({ label: "0 项阻塞", accentColor: "red" });
  });
});
