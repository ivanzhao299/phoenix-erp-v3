import { DataSource } from 'typeorm';
import { FarmMedicineInboundReceipts1795565200000 } from '../../database/migrations/1795565200000-FarmMedicineInboundReceipts';
import { FarmMedicineService } from './farm-medicine.service';

const fixtureUrl = process.env.MEDICINE_INBOUND_FIXTURE_URL;
const suite = fixtureUrl ? describe : describe.skip;

suite('medicine receipt on owned PostgreSQL', () => {
  it('returns the same receipt after concurrent submits and rejects a partial batch', async () => {
    const url = new URL(fixtureUrl!);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/medicine_inbound_fixture') {
      throw new Error('Owned medicine fixture required');
    }
    const db = await new DataSource({ type: 'postgres', url: fixtureUrl, installExtensions: false }).initialize();
    const runner = db.createQueryRunner();
    try {
      const owner = await db.query('SELECT owner_key FROM medicine_fixture_owner');
      if (!process.env.MEDICINE_INBOUND_FIXTURE_OWNER || owner[0]?.owner_key !== process.env.MEDICINE_INBOUND_FIXTURE_OWNER) {
        throw new Error('Medicine fixture ownership mismatch');
      }
      await db.query(`CREATE TABLE mst_materials (material_code text PRIMARY KEY, material_type text, unit text, status text);
        CREATE TABLE wms_warehouses (warehouse_code text PRIMARY KEY, company_code text, site_code text, domain text, type text, status text);
        CREATE TABLE inv_batches (batch_no text PRIMARY KEY, product_code text, sku_code text, material_code text, item_type text, material_type text,
          unit text, qty numeric, qty_available numeric, warehouse_code text, store_code text, company_code text, source_type text,
          source_no text, status text, inbound_date date, expire_date date, manufacturer_batch_no text, updated_at timestamptz);
        CREATE TABLE inv_ledger (id serial PRIMARY KEY, batch_no text, change_type text, qty_change numeric, operator text,
          store_code text, ref_no text, note text, company_code text, log_date date, warehouse_code text, material_code text, unit text);
        INSERT INTO mst_materials VALUES ('MED','VET_DRUG','瓶','ACTIVE');
        INSERT INTO wms_warehouses VALUES ('WH','CO','SITE','OPERATIONAL','MEDICINE','ACTIVE')`);
      const migration = new FarmMedicineInboundReceipts1795565200000();
      await migration.up(runner);
      const scope = { isGlobal: true, allowedWarehouseCodes: [] };
      const service = new FarmMedicineService(db, { assertWritableWarehouse() {} } as never, { get: () => scope } as never);
      const firstKey = '266a0a88-a284-4624-b694-a5b32e1f946e';
      const secondKey = 'e5e8a863-effd-401c-a61e-c2ae199e02e4';
      const line = { material_code: 'MED', batch_no: 'LOT-ONE', qty: 5,
        warehouse_code: 'WH', company_code: 'CO', site_code: 'SITE' };
      await expect(service.inbound('2026-11-25', [line, { ...line, qty: 0 }], 'fixture', firstKey))
        .rejects.toThrow('第 2 行');
      expect(await db.query('SELECT * FROM inv_ledger')).toEqual([]);
      const make = () => service.inbound('2026-11-25', [line], 'fixture', firstKey);
      const [first, retry] = await Promise.all([make(), make()]);
      expect(retry).toEqual(first);
      expect(first.lines).toMatchObject([{ batchNo: 'LOT-ONE', qty: 5, ledgerId: 1 }]);
      await expect(service.inbound('2026-11-25', [{ ...line, qty: 6 }], 'fixture', firstKey)).rejects.toThrow('请求号');
      await expect(service.inbound('2026-11-25', [line], 'other', firstKey)).rejects.toThrow('请求号');
      await expect(service.inbound('2026-11-25', [line], 'fixture', secondKey)).resolves.toMatchObject({
        lines: [{ batchNo: 'LOT-ONE', qty: 5, ledgerId: 2 }],
      });
      expect(await db.query('SELECT qty::int AS qty FROM inv_batches')).toEqual([{ qty: 10 }]);
      expect(await db.query('SELECT qty_change::int AS qty FROM inv_ledger ORDER BY id')).toEqual([{ qty: 5 }, { qty: 5 }]);
      await expect(migration.down(runner)).rejects.toThrow('Cannot discard');
    } finally {
      await runner.release();
      await db.destroy();
    }
  });
});
