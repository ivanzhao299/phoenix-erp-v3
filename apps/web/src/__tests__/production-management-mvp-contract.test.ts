import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('production management MVP web contracts', () => {
  it('routes immune plans through transactional APIs with inventory fields', () => {
    const page = read('src/app/(admin)/breeding/immune/page.tsx');
    const client = read('src/lib/api-client.ts');

    expect(client).toContain("'/farm/immune/plans'");
    expect(client).toContain("/farm/immune/plans/${id}/execute");
    expect(page).toContain('farmProductionApi.createImmunePlan');
    expect(page).toContain('farmProductionApi.executeImmunePlan');
    expect(page).toContain('inventory_batch_no');
    expect(page).toContain('vaccine_batch_no');
    expect(client).toContain("/farm/immune/vaccines");
    expect(client).toContain("/farm/immune/lots");
    expect(page).toContain('DictSelect dictType="BRD_VACCINATE_METHOD"');
    expect(page).toContain('issue_lines');
    expect(page).not.toContain("crudApi.create('brd_vaccinations'");
  });

  it('routes medication courses through create and cancel APIs', () => {
    const page = read('src/app/(admin)/breeding/medicine/page.tsx');
    const client = read('src/lib/api-client.ts');

    expect(client).toContain("'/farm/medication-records'");
    expect(client).toContain("/farm/medication-records/${id}/cancel");
    expect(page).toContain('farmProductionApi.createMedicationRecord');
    expect(page).toContain('farmProductionApi.cancelMedicationRecord');
    expect(page).toMatch(/actual_qty:\s+Number\(form\.actualQty\)/);
    expect(page).toMatch(/inventory_batch_no:\s+form\.inventoryBatchNo/);
    expect(page).not.toContain("crudApi.create('brd_medication_records'");
  });

  it('keeps medicine stock page on stock and ledger endpoints', () => {
    const page = read('src/app/(admin)/breeding/med-stock/page.tsx');

    expect(page).toContain("'/api/farm/medicine/stock'");
    expect(page).toContain('`/api/farm/medicine/ledger?start=');
    expect(page).toContain("'/api/farm/medicine/inbound'");
    expect(page).not.toContain("crudApi.create('brd_medications'");
  });
});
