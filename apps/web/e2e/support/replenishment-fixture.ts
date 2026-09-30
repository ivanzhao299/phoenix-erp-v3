import { readFileSync } from 'node:fs';

export type ReplenishmentFixture = {
  storeCode: string;
  sourceWarehouseCode: string;
  skuCode: string;
  qty: number;
};

/** Load an isolated fixture supplied by the harness, without embedding a DB id. */
export function loadReplenishmentFixture(): ReplenishmentFixture {
  const raw = process.env.REPLENISH_E2E_FIXTURE
    || (process.env.REPLENISH_E2E_FIXTURE_FILE
      ? readFileSync(process.env.REPLENISH_E2E_FIXTURE_FILE, 'utf8')
      : '');
  if (!raw) {
    throw new Error(
      'store-replenishment E2E requires an isolated fixture. Set REPLENISH_E2E_FIXTURE to JSON '
      + 'or REPLENISH_E2E_FIXTURE_FILE to the generated bootstrap output; no database id is hard-coded.',
    );
  }
  let fixture: Partial<ReplenishmentFixture>;
  try { fixture = JSON.parse(raw); } catch { throw new Error('REPLENISH_E2E_FIXTURE must be valid JSON'); }
  if (!fixture.storeCode || !fixture.sourceWarehouseCode || !fixture.skuCode || !Number.isFinite(fixture.qty) || fixture.qty <= 0) {
    throw new Error('REPLENISH_E2E_FIXTURE must contain storeCode, sourceWarehouseCode, skuCode and positive qty');
  }
  return fixture as ReplenishmentFixture;
}
