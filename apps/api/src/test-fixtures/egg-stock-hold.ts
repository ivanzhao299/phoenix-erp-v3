import { DataSource } from 'typeorm';

/** Inventory-only fixtures supply the farm's per-batch eligibility result. The flock PG suite installs the full migration. */
export async function installEggStockHoldFixture(db: DataSource) {
  await db.query(`CREATE TABLE fixture_egg_stock_holds(batch_no text PRIMARY KEY);
    CREATE FUNCTION vet_egg_batch_held(batch text) RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT EXISTS(SELECT 1 FROM fixture_egg_stock_holds h WHERE h.batch_no=batch) $$`);
}
