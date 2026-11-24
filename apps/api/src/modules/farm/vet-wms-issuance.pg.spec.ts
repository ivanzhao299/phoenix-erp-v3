import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { WmsService } from '../wms/wms.service';
import { ImmuneService } from './immune.service';
import { MedicationRecordService } from './medication-record.service';

// This proof uses the actual migrated database, including inventory triggers and ledger columns.
// Provision the named loopback clone of a clean CI database before running it.
const url = process.env.VET_WMS_PG_URL;
const suite = url ? describe : describe.skip;

suite('WMS vaccine receipt, immunization and medication on the migrated schema', () => {
  it('keeps physical units and bird counts separate across the real writers', async () => {
    const target = new URL(url!);
    if (target.hostname !== '127.0.0.1' || target.pathname !== '/vet1124_candidate') {
      throw new Error('Owned veterinary loopback fixture required');
    }
    const db = await new DataSource({ type: 'postgres', url, installExtensions: false }).initialize();
    const runner = db.createQueryRunner();
    await runner.startTransaction();
    try {
      const manager = runner.manager;
      const scope = { isGlobal: true, allowedWarehouseCodes: [] };
      const cls = { get: (key: string) => key === 'dataScope' ? scope : { username: 'vet-fixture' } } as unknown as ClsService;
      const wms = new WmsService(manager, cls);
      // Services share this outer transaction so the fixture is always rolled back.
      const scopedDb = { query: manager.query.bind(manager), transaction: manager.transaction.bind(manager) } as unknown as DataSource;
      const immune = new ImmuneService(scopedDb, cls);
      const medication = new MedicationRecordService(scopedDb, cls);
      const actor = 'vet-fixture';
      const company = 'COMP-LAO-AGRI', site = 'SITE-MENGSAI-LAYER', warehouse = 'LPH_MS_MEDICINE';
      const context = { flock_no: 'VET-QA-FLOCK', house_code: 'VET-QA-HOUSE', farm_code: 'VET-QA-FARM',
        company_code: company, site_code: site };
      const [{ today }] = await manager.query("SELECT (now() AT TIME ZONE 'Asia/Singapore')::date::text AS today");
      await manager.query("INSERT INTO brd_farms(farm_code,company_code,mapped_site_code,status) VALUES ($1,$2,$3,'ACTIVE')",
        [context.farm_code,company,site]);
      await manager.query("INSERT INTO brd_houses(house_code,farm_code,status) VALUES ($1,$2,'ACTIVE')",
        [context.house_code,context.farm_code]);
      await manager.query("INSERT INTO brd_flocks(flock_no,house_code,farm_code,current_qty,status) VALUES ($1,$2,$3,100,'LAYING')",
        [context.flock_no,context.house_code,context.farm_code]);
      const vaccine = 'MAT-VET-NDV', drug = 'MAT-VET-DEWORM';
      const task = 'VET-QA-IN';
      const received = await wms.createBatchInbound({ documents: [{ task_no: task, type: 'PURCHASE', date: today,
        warehouse_code: warehouse, items: [vaccine, drug].map(material => ({ item: material, material_code: material, item_type: 'MATERIAL', qty: 15 })) }] }, { username: actor });
      expect(received.code).toBe(200);
      const confirmed = await wms.confirmBatchInbound({ documents: [{ task_no: task }] }, { username: actor });
      expect(confirmed.code).toBe(200);

      const lots = await immune.getLots(vaccine, site, company, warehouse);
      expect(lots).toHaveLength(1);
      const lot = lots[0];
      expect(Number(lot.qty_available)).toBe(15);
      expect(lot.unit).toBe('瓶');
      const line = { inventory_batch_no: lot.batch_no, qty: 2, unit_code: lot.unit };
      const plan = await immune.create({ ...context, material_code: vaccine, plan_date: today,
        planned_heads: 80, issue_lines: [line] }, actor);
      await immune.execute(plan.id,{actual_heads: 75, issue_lines: [line]},actor);
      const [executed] = await manager.query('SELECT actual_heads FROM brd_vaccinations WHERE id=$1',[plan.id]);
      expect(Number(executed.actual_heads)).toBe(75);
      const [afterVaccination] = await immune.getLots(vaccine, site, company, warehouse);
      expect(Number(afterVaccination.qty_available)).toBe(13);
      const [drugLot] = await medication.getLots(drug, site, company, warehouse, today);
      expect(Number(drugLot.qty_available)).toBe(15);
      await medication.create({ ...context, material_code: drug, indication: 'QA', actual_heads: 10,
        start_date: today, end_date: today, withdraw_days: 3, actual_qty: 1, qty_unit: drugLot.unit,
        inventory_batch_no: drugLot.batch_no }, actor);
      const [stock] = await manager.query('SELECT qty,qty_available FROM inv_batches WHERE batch_no=$1',[drugLot.batch_no]);
      expect([Number(stock.qty), Number(stock.qty_available)]).toEqual([14,14]);
      const issues = await manager.query('SELECT material_code,qty_change FROM inv_ledger WHERE batch_no=ANY($1) AND qty_change<0 ORDER BY id',
        [[lot.batch_no, drugLot.batch_no]]);
      expect(issues.map((row: {material_code:string; qty_change:string}) => [row.material_code,Number(row.qty_change)]))
        .toEqual([[vaccine,-2],[drug,-1]]);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
      await db.destroy();
    }
  }, 30_000);
});
