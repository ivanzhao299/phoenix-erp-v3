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
    expect(storePos).toContain('location_code, inbound_date, created_at');
    expect(medicine).toContain("'MED_INBOUND', safeDate");
  });

  it('records unknown legacy and packaging dates as NULL without created-at fallback', () => {
    expect(packaging).toContain("warehouse_code, inbound_date)\n               VALUES ($1, $2, $3::int, $4::int, $5, $6, 'FACTORY', 'WMS-VTE-MAIN', NULL)");
    expect(legacyProcurement).toContain('location_code, inbound_date)');
    expect(legacyProcurement).toContain('VALUES ($1, $2, $3, $4, $5, NULL)');
    expect([wms, receipt, egg, packaging, storePos, medicine, legacyProcurement].join('\n'))
      .not.toMatch(/COALESCE\s*\(\s*inbound_date\s*,\s*created_at/i);
  });
});
