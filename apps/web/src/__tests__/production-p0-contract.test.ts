import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('production P0 contracts', () => {
  it('uses the real production analytics endpoint and response contract', () => {
    const page = read('src/app/(admin)/analytics/production/page.tsx');
    expect(page).toContain('"/api/v2/analytics/production"');
    expect(page).toContain('data?.trend30Day');
    expect(page).not.toContain('/api/breeding/daily-reports');
  });

  it('does not reuse packed boxes as the warehoused metric', () => {
    const page = read('src/app/(terminal)/terminal/packaging/dashboard/page.tsx');
    expect(page).toContain('shiftWarehousedBoxes');
    expect(page).toContain('value: summary.warehousedBoxes');
    expect(page).not.toMatch(/label: t\('ui\.已入库'[\s\S]{0,120}value: packedBoxes/);
  });

  it('centralizes production operation enum labels', () => {
    for (const relative of [
      'src/app/(admin)/breeding/daily-inbound-ledger/page.tsx',
      'src/app/(admin)/breeding/med-stock/page.tsx',
      'src/app/(admin)/breeding/device-ops/page.tsx',
    ]) expect(read(relative)).toContain('formatBusinessEnum');
  });
});
