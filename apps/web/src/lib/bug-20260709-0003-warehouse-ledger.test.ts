import { describe, expect, it } from "vitest";
import { formatWarehouseLedgerChangeType } from "./warehouse-ledger-change-type";

describe("BUG-20260709-0003 warehouse ledger labels", () => {
  it("does not expose reported transaction codes as English labels", () => {
    for (const code of ["FARM_OUT_MEDICATION", "TEMP_PRODUCTION_INBOUND", "FARM_IN", "MED_INBOUND", "MED_OUTBOUND"]) {
      expect(formatWarehouseLedgerChangeType(code)).not.toBe(code);
    }
  });
});
