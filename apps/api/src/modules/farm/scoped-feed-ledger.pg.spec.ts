import { DataSource } from 'typeorm';
import { ScopedFarmFeedLedger1795565300000 } from '../../database/migrations/1795565300000-ScopedFarmFeedLedger';
import type { DataScopeContext } from '../org/services/data-scope.service';
import { readFeedDay, writeFeedDay } from './scoped-feed-ledger';

const fixtureUrl = process.env.SCOPED_FEED_FIXTURE_URL;
const suite = fixtureUrl ? describe : describe.skip;

suite('scoped feed day on owned PostgreSQL', () => {
  it('uses posted WMS facts and isolates farm versions and balances', async () => {
    const url = new URL(fixtureUrl!);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/scoped_feed_fixture') throw new Error('Owned feed fixture required');
    const db = await new DataSource({ type: 'postgres', url: fixtureUrl, installExtensions: false }).initialize();
    const runner = db.createQueryRunner();
    try {
      const owner = await db.query('SELECT owner_key FROM feed_fixture_owner');
      if (!process.env.SCOPED_FEED_FIXTURE_OWNER || owner[0]?.owner_key !== process.env.SCOPED_FEED_FIXTURE_OWNER) throw new Error('Feed fixture ownership mismatch');
      await db.query(`CREATE TABLE brd_farms (farm_code text PRIMARY KEY, farm_name text, company_code text, mapped_site_code text, status text);
        CREATE TABLE brd_houses (house_code text PRIMARY KEY, farm_code text);
        CREATE TABLE mst_materials (material_code text PRIMARY KEY, material_name text, material_type text, unit text, status text);
        CREATE TABLE wms_outbound (outbound_no text PRIMARY KEY, warehouse_code text, company_code text, type text,
          status text, date date, destination_type text, destination_house_code text, destination_code text);
        CREATE TABLE inv_ledger (id serial PRIMARY KEY, material_code text, unit text, qty_change numeric, destination_code text,
          batch_no text, ref_no text, warehouse_code text, company_code text, change_type text, business_type text, destination_type text);
        INSERT INTO brd_farms VALUES ('A','A Farm','CO','S-A','ACTIVE'),('B','B Farm','CO','S-B','ACTIVE');
        INSERT INTO brd_houses VALUES ('H-A','A'),('H-B','B');
        INSERT INTO mst_materials VALUES ('F1','Corn','FEED_RAW','kg','ACTIVE');
        INSERT INTO wms_outbound VALUES
          ('O-A','WH-A','CO','FEED_DISTRIBUTION','DONE','2026-11-25','HOUSE','H-A','H-A'),
          ('O-B','WH-B','CO','FEED_DISTRIBUTION','DONE','2026-11-25','HOUSE','H-B','H-B'),
          ('O-DRAFT','WH-A','CO','FEED_DISTRIBUTION','PENDING','2026-11-25','HOUSE','H-A','H-A');
        INSERT INTO inv_ledger(material_code,unit,qty_change,destination_code,batch_no,ref_no,warehouse_code,company_code,change_type,business_type,destination_type) VALUES
          ('F1','kg',-3,'H-A','BA-1','O-A','WH-A','CO','FEED_ISSUE','FEED_DISTRIBUTION','HOUSE'),
          ('F1','kg',-4,'H-A','BA-2','O-A','WH-A','CO','FEED_ISSUE','FEED_DISTRIBUTION','HOUSE'),
          ('F1','kg',-20,'H-B','BB','O-B','WH-B','CO','FEED_ISSUE','FEED_DISTRIBUTION','HOUSE'),
          ('F1','kg',-99,'H-A','BD','O-DRAFT','WH-A','CO','FEED_ISSUE','FEED_DISTRIBUTION','HOUSE');`);
      const migration = new ScopedFarmFeedLedger1795565300000();
      await migration.up(runner);
      const scopeA = { isGlobal: false, allowedBreedingCompanyCodes: [], allowedBreedingSiteCodes: ['S-A'], allowedBreedingFarmCodes: [],
        allowedCompanyCodes: ['CO'], allowedSiteCodes: ['S-A'], allowedWarehouseCodes: ['WH-A'] } as unknown as DataScopeContext;
      const scopeGlobal = { isGlobal: true } as DataScopeContext;
      const warehouse = { isGlobal: false, allowedWarehouseCodes: ['WH-A'] };
      const day = { companyCode: 'CO', farmCode: 'A', date: '2026-11-25', version: 0 };
      const prior = { ...day, farmCode: 'B', date: '2026-11-24' };
      const row = { materialCode: 'F1', unit: 'kg', consumed: 5, counted: 11, note: 'physical' };
      await writeFeedDay(db.manager, scopeGlobal, { ...prior, items: [row] }, 'actor', warehouse);
      await expect(readFeedDay(db.manager, scopeA, { ...day, farmCode: 'B' }, warehouse)).rejects.toThrow('无法访问');
      const view = await readFeedDay(db.manager, scopeA, day, warehouse);
      expect(view.rows[0]).toMatchObject({ opening: null, issued: '7', counted: null });
      expect(view.rows[0].movements).toMatchObject([{ batchNo: 'BA-1', quantity: 3 }, { batchNo: 'BA-2', quantity: 4 }]);
      await expect(readFeedDay(db.manager, scopeA, day, { ...warehouse, allowedWarehouseCodes: [] }))
        .resolves.toMatchObject({ warehouseCoverage: 'NONE', rows: [{ issued: null }] });
      await expect(writeFeedDay(db.manager, scopeA, { ...day, items: [row, { ...row, materialCode: 'MISSING' }] }, 'actor', warehouse))
        .rejects.toThrow('物料或单位');
      expect(await db.query("SELECT * FROM farm_feed_days WHERE farm_code='A'")).toEqual([]);
      const attempts = await Promise.allSettled([
        writeFeedDay(db.manager, scopeA, { ...day, items: [row] }, 'actor-1', warehouse),
        writeFeedDay(db.manager, scopeA, { ...day, items: [row] }, 'actor-2', warehouse),
      ]);
      expect(attempts.map(x => x.status).sort()).toEqual(['fulfilled', 'rejected']);
      await expect(readFeedDay(db.manager, scopeA, day, warehouse)).resolves.toMatchObject({ version: 1, rows: [{ counted: '11.000', issued: '7' }] });
      expect(await db.query('SELECT count(*)::int AS count FROM inv_ledger')).toEqual([{ count: 4 }]);
      await expect(migration.down(runner)).rejects.toThrow('contains business records');
    } finally {
      await runner.release();
      await db.destroy();
    }
  });
});
