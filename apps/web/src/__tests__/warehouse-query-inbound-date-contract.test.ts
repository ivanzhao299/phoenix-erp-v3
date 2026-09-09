import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const page = readFileSync(join(process.cwd(), 'src/app/(admin)/warehouse/query/page.tsx'), 'utf8');

describe('warehouse inventory inbound-date column contract', () => {
  it('places inbound date immediately after status and before expiry', () => {
    const status = page.indexOf('t("ui.状态", "状态")');
    const inbound = page.indexOf('t("ui.入库日期", "入库日期")');
    const expiry = page.indexOf('t("ui.保质期至", "保质期至")');
    expect(status).toBeGreaterThan(-1);
    expect(status).toBeLessThan(inbound);
    expect(inbound).toBeLessThan(expiry);
    expect(page).toContain('formatWarehouseBatchDate(row.inbound_date)');
    expect(page.match(/colSpan=\{9\}/g)).toHaveLength(2);
  });
});
