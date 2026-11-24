import { VetMaterialIdentity1795500100000 } from '../../database/migrations/1795500100000-VetMaterialIdentity';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { MasterDataRuntimeService } from '../master-data/master-data-runtime.service';
import { MasterDataAuditService } from '../master-data/master-data-audit.service';
import { WmsService } from '../wms/wms.service';
import { FarmMedicineService } from './farm-medicine.service';
import { ImmuneService } from './immune.service';
import { MedicationRecordService } from './medication-record.service';

// Run only against a disposable database after the repository's full migration chain.
const port = Number(process.env.VET_FULL_FIXTURE_PORT);
(port ? describe : describe.skip)('veterinary posting on the migrated PostgreSQL schema', () => {
  it('receives two actual material lots and posts separate immunization and treatment without a MED association', async () => {
    const db = await new DataSource({type:'postgres',host:'127.0.0.1',port,username:'postgres',database:'vet_full',
      installExtensions:false,synchronize:false,migrationsRun:false}).initialize();
    const runner=db.createQueryRunner();
    try {
      await runner.startTransaction();
      const m=runner.manager;
      const key='VTEST-'+randomUUID().slice(0,8);
      const id={company_code:key,site_code:key,farm_code:key,house_code:key,flock_no:key};
      await m.query("INSERT INTO brd_farms(farm_code,company_code,mapped_site_code,status) VALUES($1,$1,$1,'ACTIVE')",[key]);
      await m.query("INSERT INTO brd_flocks(flock_no,farm_code,house_code,current_qty,status) VALUES($1,$1,$1,70,'LAYING')",[key]);
      await m.query("INSERT INTO wms_warehouses(warehouse_code,company_code,site_code,type,status,domain) VALUES($1,$1,$1,'MEDICINE','ACTIVE','OPERATIONAL')",[key]);
      const mat='MAT-'+key, rx='RX-'+key;
      await m.query("INSERT INTO mst_materials(material_code,material_name,material_type,unit,status) VALUES($1,'fixture vaccine','VET_DRUG','瓶','ACTIVE'),($2,'fixture medicine','VET_DRUG','瓶','ACTIVE')",[mat,rx]);
      const cls={get:()=>({isGlobal:true,allowedWarehouseCodes:[]})} as any;
      // All services run their normal transactions as savepoints on this owned connection.
      const scopeDb=m as unknown as DataSource;
      const stock=new FarmMedicineService(scopeDb,{assertWritableWarehouse:()=>{}} as any,cls);
      const master=new MasterDataRuntimeService(scopeDb,{} as never,new MasterDataAuditService(scopeDb),{} as never,{} as never,cls,{} as never);
      await master.update('material',mat,{vet_kind:'VACCINE'},'fixture');
      await master.update('material',rx,{vet_kind:'MEDICATION',vet_withdraw_days:2},'fixture');
      expect(await m.query("SELECT after_json->>'vet_kind' AS kind FROM mst_audit_trail WHERE object_code=$1",[mat])).toEqual([{kind:'VACCINE'}]);
      const day=(await m.query("SELECT (now() AT TIME ZONE 'Asia/Singapore')::date::text AS day"))[0].day;
      await new WmsService(m,cls).inboundFromReceipt(m,{refNo:key,warehouseCode:key,storeCode:key,operator:'fixture',inboundDate:day,
        items:[{itemType:'MATERIAL',itemCode:mat,qty:15,batchNo:key},{itemType:'MATERIAL',itemCode:rx,qty:15,batchNo:rx}]});
      const immune=new ImmuneService(scopeDb,cls);
      const medicine=new MedicationRecordService(scopeDb,cls);
      const vaccineOptions=await immune.listVaccines({site_code:key,company_code:key});
      expect(vaccineOptions.some((row:any)=>row.material_code===mat)).toBe(true);
      expect(vaccineOptions.some((row:any)=>row.material_code===rx)).toBe(false);
      expect(await immune.getLots(rx,key,key)).toEqual([]);
      expect(await medicine.getLots(mat,key,key)).toEqual([]);
      expect(vaccineOptions.some((row:any)=>row.material_code==='MAT-VET-NDV')).toBe(true);
      expect(vaccineOptions.some((row:any)=>row.material_code==='MAT-VET-DISINFECT')).toBe(false);
      const lots=await immune.getLots(mat,key,key);
      expect(lots).toHaveLength(1);
      const lot=lots[0];
      expect(lot).toMatchObject({unit:'瓶',material_code:mat});
      expect(Number(lot.qty_available)).toBe(15);
      const plan=await immune.create({...id,material_code:mat,plan_date:day,planned_heads:60,
        issue_lines:[{inventory_batch_no:lot.batch_no,qty:3,unit_code:'瓶'}]},'fixture');
      await expect(immune.create({...id,material_code:mat,plan_date:day,planned_heads:60},'fixture')).rejects.toThrow('已存在');
      expect(plan).toMatchObject({material_code:mat,vaccine_code:null,vaccine_name:'fixture vaccine',stock_unit:'瓶'});
      const actual={actual_heads:49,issue_lines:[{inventory_batch_no:lot.batch_no,qty:2,unit_code:'瓶'}]};
      await immune.execute(plan.id,actual,'fixture');await immune.execute(plan.id,actual,'fixture');
      await expect(medicine.create({...id,material_code:rx,start_date:day,actual_heads:21,actual_qty:1,
        inventory_batch_no:rx},'fixture')).rejects.toThrow('疗程');
      const record=await medicine.create({...id,material_code:rx,start_date:day,end_date:day,actual_heads:21,actual_qty:1,
        qty_unit:'瓶',inventory_batch_no:rx},'fixture');
      expect((await m.query("SELECT qty::int AS qty FROM inv_batches WHERE batch_no=$1",[lot.batch_no]))[0].qty).toBe(13);
      expect(await m.query('SELECT qty_change::int AS qty,unit,material_code FROM inv_ledger WHERE material_code IN ($1,$2) AND qty_change<0 ORDER BY id',[mat,rx]))
        .toEqual([{qty:-2,unit:'瓶',material_code:mat},{qty:-1,unit:'瓶',material_code:rx}]);
      expect((await m.query('SELECT material_code,material_name,medication_code,days_used FROM brd_medication_records WHERE id=$1',[record.id]))[0])
        .toEqual({material_code:rx,material_name:'fixture medicine',medication_code:null,days_used:1});
      await medicine.cancel(record.id,'fixture');
      expect((await stock.getCatalog()).find(row=>row.medication_code===rx)).toMatchObject({qty:15,unit:'瓶'});
      const old='MED-'+key;
      await m.query("INSERT INTO brd_medications(medication_code,medication_name,status,store_code,product_type,unit_code) VALUES($1,'fixture vaccine','ACTIVE',$2,'VACCINE','DOSE')",[old,key]);
      const [legacy]=await m.query(`INSERT INTO brd_vaccinations(record_no,flock_no,house_code,farm_code,site_code,company_code,vaccine_code,vaccine_name,plan_date,planned_heads,status)
        VALUES($1,$2,$2,$2,$2,$2,$1,'original plan',$3,22,'PLANNED') RETURNING id`,[old,key,day]);
      await expect(immune.execute(legacy.id,{actual_heads:15,actual_qty:1},'fixture')).rejects.toThrow('请选择实际库存物料');
      await immune.execute(legacy.id,{material_code:mat,actual_heads:15,issue_lines:[{inventory_batch_no:lot.batch_no,qty:1,unit_code:'瓶'}]},'fixture');
      expect((await m.query('SELECT vaccine_code,vaccine_name,material_code,executed_material_name FROM brd_vaccinations WHERE id=$1',[legacy.id]))[0])
        .toEqual({vaccine_code:old,vaccine_name:'original plan',material_code:mat,executed_material_name:'fixture vaccine'});
      expect((await m.query('SELECT vaccine_code,material_code FROM brd_vaccination_issue_lines WHERE vaccination_id=$1',[legacy.id]))[0])
        .toEqual({vaccine_code:old,material_code:mat});
    } finally {
      if(runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();await db.destroy();
    }
  },30000);

  it('restores the original legacy nullability on rollback for both schema variants', async()=>{
    const db=await new DataSource({type:'postgres',host:'127.0.0.1',port,username:'postgres',database:'vet_full',
      installExtensions:false,synchronize:false,migrationsRun:false}).initialize();
    const runner=db.createQueryRunner(), migration=new VetMaterialIdentity1795500100000();
    try {
      await runner.startTransaction();
      await migration.down(runner);
      await runner.query('ALTER TABLE brd_vaccinations ALTER COLUMN vaccine_code DROP NOT NULL');
      await migration.up(runner);
      await migration.down(runner);
      expect(await runner.query(`SELECT table_name,is_nullable FROM information_schema.columns
        WHERE table_schema=current_schema() AND column_name='vaccine_code'
        AND table_name IN ('brd_vaccinations','brd_vaccination_issue_lines') ORDER BY table_name`))
        .toEqual([{table_name:'brd_vaccination_issue_lines',is_nullable:'NO'},{table_name:'brd_vaccinations',is_nullable:'YES'}]);
    } finally {
      if(runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();await db.destroy();
    }
  });
});
