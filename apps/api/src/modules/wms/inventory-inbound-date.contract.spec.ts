import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (relative: string) => readFileSync(join(__dirname, relative), 'utf8');

describe('inventory inbound-date write-path contract', () => {
  const wms = read('wms.service.ts');
  const receipt = read('../procurement-v2/services/receipts.service.ts');
  const egg = read('../sales-v2/services/egg-inventory.service.ts');
  const returns = read('../sales-v2/services/return-orders.service.ts');
  const packaging = read('../terminal/packaging.service.ts');
  const storePos = read('../store-pos/services/store-pos.service.ts');
  const medicine = read('../farm/farm-medicine.service.ts');
  const legacyProcurement = read('../procurement/procurement.service.ts');

  it('passes proven document dates through generic WMS and procurement V2', () => {
    expect(wms).toContain('status, type, date FROM wms_inbound');
    expect(wms).toContain('ctx.inboundDate || null');
    expect(receipt).toContain('inboundDate:   rcp.receiptDate');
  });

  it('uses the earliest non-null date when an existing batch is merged', () => {
    expect(wms.match(/ELSE LEAST\(inv_batches\.inbound_date, EXCLUDED\.inbound_date\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(storePos).toContain('LEAST(inv_batches.inbound_date, EXCLUDED.inbound_date)');
    expect(medicine).toContain('LEAST(inv_batches.inbound_date, EXCLUDED.inbound_date)');
  });

  it('defines dates for production, transfer, returns and medicine', () => {
    expect(egg).toContain('egg_date, inbound_date, expire_date');
    expect(wms.match(/company_code, inbound_date/g)?.length).toBeGreaterThanOrEqual(3);
    expect(returns).toContain("new Date().toISOString().slice(0, 10), mgr");
    const posBatchColumns = storePos.match(/INSERT INTO inv_batches\s*\(([^)]+)\)/)?.[1].split(',').map(column => column.trim());
    expect(posBatchColumns).toEqual(expect.arrayContaining(['location_code', 'inbound_date', 'created_at']));
    // The persisted inbound date is parameter $9; formatting the argument list
    // across lines must not change this contract or substitute a creation date.
    expect(medicine).toMatch(/'MED_INBOUND',\s*safeDate,\s*expireDate/);
    expect(medicine).toMatch(/'AVAILABLE',\s*\$9::date,\s*\$10::date,\s*NOW\(\),\s*NOW\(\)/);
    expect(medicine).toContain('const safeDate = normalizeDate(logDate)');
  });

  it('records unknown legacy and packaging dates as NULL without created-at fallback', () => {
    // The retired terminal grading/pack completion no longer writes inventory:
    // raw-egg collection keeps only shift/daily-log/task records, while fresh
    // batches come from source-aware integration with authoritative dates.
    expect(packaging).not.toContain("INSERT INTO inv_batches");
    expect(packaging).not.toContain("INSERT INTO inv_ledger");
    expect(packaging).not.toContain("'PRD-EGG-RAW'");
    expect(packaging).toContain('completePackagingBatch');
    expect(legacyProcurement).toContain('location_code, inbound_date)');
    expect(legacyProcurement).toContain('VALUES ($1, $2, $3, $4, $5, NULL)');
    expect([wms, receipt, egg, packaging, storePos, medicine, legacyProcurement].join('\n'))
      .not.toMatch(/COALESCE\s*\(\s*inbound_date\s*,\s*created_at/i);
  });
});
