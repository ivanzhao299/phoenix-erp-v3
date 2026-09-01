import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Store POS V1-4 contract', () => {
  const root = join(__dirname, '../..');
  const migration = readFileSync(join(root, 'database/migrations/1788220800000-ImplementStorePosV14TenderSettlement.ts'), 'utf8');
  const pricing = readFileSync(join(root, 'modules/sales-v2/services/price-runtime.service.ts'), 'utf8');
  const pos = readFileSync(join(root, 'modules/store-pos/services/store-pos.service.ts'), 'utf8');

  it('persists the adjudicated pricing, tender, settlement and reconciliation schema', () => {
    expect(migration).toContain('publish_version integer NOT NULL');
    expect(migration).toContain('sal_store_sale_tenders');
    expect(migration).toContain('sal_store_price_drift_events');
    expect(migration).toContain('UNIQUE (store_code, business_date)');
    expect(migration).toContain('cash_transaction_id');
    expect(migration).toContain("MENU_STORE_SETTLEMENT");
    expect(migration).not.toContain('gl_journal');
  });

  it('uses the complete deterministic price order and POS resolver snapshot', () => {
    expect(pricing).toContain('pb.store_code');
    expect(pricing).toContain('pb.publish_version DESC');
    expect(pricing).toContain('pb.effective_from DESC NULLS LAST');
    expect(pos).toContain('price_item_id');
    expect(pos).toContain('PRICE_VERSION_DRIFT');
  });
});
