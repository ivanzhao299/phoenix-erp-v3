import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pageSource = readFileSync(
  join(process.cwd(), "src/components/breeding/ScopedFeedLedger.tsx"),
  "utf8",
);

const cssSource = readFileSync(
  join(process.cwd(), "src/components/breeding/ScopedFeedLedger.module.css"),
  "utf8",
);

describe('scoped breeding feed ledger', () => {
  it('keeps warehouse issues separate from editable field measurements', () => {
    expect(pageSource).toContain('仓储发放');
    expect(pageSource).toContain('实际耗用');
    expect(pageSource).toContain('现场盘余');
    expect(pageSource).toContain('version: day.version');
  });
  it('uses a scrollable table on narrow screens and leaves data on the current range', () => {
    expect(pageSource).toContain('className={styles.tableViewport}');
    expect(cssSource).toContain('overflow-x: auto');
    expect(pageSource).toContain('loaded === range');
    expect(pageSource).toContain('version: day.version');
  });
});
