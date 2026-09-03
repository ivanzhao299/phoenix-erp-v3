import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import en from "../../../../locales/en.json";
import lo from "../../../../locales/lo.json";
import zh from "../../../../locales/zh.json";
import {
  TRANSFER_DISPLAY_STATUSES,
  TRANSFER_LIFECYCLE_STATUSES,
  transferActionForStatus,
  transferStatusLabel,
} from "./transfer-status";

const locales = { zh, en, lo } as const;
const backendStatuses = ["PENDING", "IN_TRANSIT", "RECEIVED", "COMPLETED"];
const backendMigration = readFileSync(resolve(
  process.cwd(),
  "../api/src/database/migrations/1787965200000-UpgradeWmsTransferLifecycle.ts",
), "utf8");
const transferPage = readFileSync(resolve(
  process.cwd(),
  "src/app/(admin)/warehouse/transfer/page.tsx",
), "utf8");

describe("warehouse transfer status contract", () => {
  it("covers every backend lifecycle status and the historical cancelled value", () => {
    const check = backendMigration.match(/status IN \(([^)]+)\)/)?.[1] ?? "";
    const migrationStatuses = [...check.matchAll(/'([A-Z_]+)'/g)].map(match => match[1]);
    expect(migrationStatuses).toEqual(backendStatuses);
    expect(TRANSFER_LIFECYCLE_STATUSES).toEqual(backendStatuses);
    expect(TRANSFER_DISPLAY_STATUSES).toEqual([...backendStatuses, "CANCELLED"]);
  });

  it("drives the page filter from the shared display statuses", () => {
    expect(transferPage).toContain("TRANSFER_DISPLAY_STATUSES.map");
    expect(transferPage).not.toMatch(/value:\s*["'](?:DONE|CANCELLED)["']/);
  });

  it.each(Object.entries(locales))("renders every status in %s", (_lang, messages) => {
    const t = (key: string, fallback = key) =>
      (messages as Record<string, string>)[key] ?? fallback;
    for (const status of TRANSFER_DISPLAY_STATUSES) {
      expect(transferStatusLabel(status, t)).toBe(
        (messages as Record<string, string>)[`warehouse.transfer.status.${status.toLowerCase()}`],
      );
    }
  });

  it("preserves unknown raw values", () => {
    expect(transferStatusLabel("LEGACY_HOLD", () => "translated")).toBe("LEGACY_HOLD");
  });

  it("matches backend action guards", () => {
    expect(transferActionForStatus("PENDING")).toBe("dispatch");
    expect(transferActionForStatus("IN_TRANSIT")).toBe("receive");
    for (const status of ["RECEIVED", "COMPLETED", "CANCELLED", "LEGACY_HOLD"]) {
      expect(transferActionForStatus(status)).toBeNull();
    }
  });
});
