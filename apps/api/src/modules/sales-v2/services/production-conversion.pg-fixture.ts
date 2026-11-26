import { DataSource } from 'typeorm';
import { installProductionInboundFixture } from './production-inbound.pg-fixture';
import { OfficialRawCollectionReceipts1795005390930 } from '../../../database/migrations/1795005390930-OfficialRawCollectionReceipts';
import { OfficialInventoryConversions1795011331222 } from '../../../database/migrations/1795011331222-OfficialInventoryConversions';
import { AlignWmsTransactionForms1787731200000 } from '../../../database/migrations/1787731200000-AlignWmsTransactionForms';
import { UpgradeWmsTransferLifecycle1787965200000 } from '../../../database/migrations/1787965200000-UpgradeWmsTransferLifecycle';
import { AddWmsDefectDisposition1794405000000 } from '../../../database/migrations/1794405000000-AddWmsDefectDisposition';
import { randomUUID } from 'crypto';

/** Caller owns the isolated schema and verifies the loopback PostgreSQL fixture. No .env is loaded. */
export async function installProductionConversionFixture(db:DataSource){
  await installProductionInboundFixture(db,['GRADE_0','GRADE_1','GRADE_2','GRADE_3','GRADE_4','GRADE_5','DIRTY','BROKEN']);
  await db.query(`ALTER TABLE pkg_source_batches ADD COLUMN batch_code text,ADD COLUMN source_inbound_no text,ADD COLUMN shift_id int,
    ADD COLUMN total_qty int,ADD COLUMN dirty_qty int DEFAULT 0,ADD COLUMN cracked_qty int DEFAULT 0,ADD COLUMN batch_status text;
    CREATE TABLE pkg_work_shifts(id int PRIMARY KEY,site_id text,production_date date,is_test boolean);
    CREATE TABLE inv_source_mode(scope_level text,scope_code text,mode text);
    INSERT INTO inv_source_mode VALUES('GROUP','ALL','PACKAGING_INBOUND');
    CREATE TABLE sys_user(user_id int PRIMARY KEY,username text,status int DEFAULT 1);
    INSERT INTO sys_user VALUES(1,'maker',1),(2,'reviewer',1),(3,'receiver',1);
    CREATE TABLE brd_medication_records(flock_no text,status text,start_date date,withdraw_until date);
    ALTER TABLE product_grades ADD COLUMN stock_managed boolean DEFAULT true,ADD COLUMN sale_enabled boolean DEFAULT true,
      ADD COLUMN default_stock_status text DEFAULT 'AVAILABLE';
    UPDATE product_grades SET sale_enabled=false,is_saleable=false,default_stock_status='QUARANTINE' WHERE grade_code='DIRTY';
    UPDATE product_grades SET sale_enabled=false,is_saleable=false,default_stock_status='DAMAGED' WHERE grade_code='BROKEN';
    ALTER TABLE file_metadata ADD COLUMN checksum text;
    INSERT INTO file_metadata(file_id,status,visibility,mime_type,module_code,owner_type,owner_id,company_code,uploaded_by,checksum)
      VALUES('CONVERSION-EVIDENCE','ACTIVE','PROTECTED','application/pdf','PRODUCTION_CONVERSION','WAREHOUSE','WH-A','COMP-A','maker',repeat('e',64));`);
  await db.query(`INSERT INTO file_metadata(file_id,status,visibility,mime_type,module_code,owner_type,owner_id,company_code,store_code,uploaded_by,checksum)
    VALUES('RAW-EVIDENCE','ACTIVE','PROTECTED','application/pdf','PRODUCTION_INBOUND','HOUSE','HOUSE-A','COMP-A','SITE-A','maker',repeat('a',64));
    INSERT INTO file_metadata(file_id,status,visibility,mime_type,module_code,owner_type,owner_id,company_code,uploaded_by,checksum)
      VALUES('PERIOD-EVIDENCE','ACTIVE','PROTECTED','application/pdf','PRODUCTION_INBOUND','HOUSE','HOUSE-A','COMP-A','reviewer',repeat('b',64));
    CREATE TABLE wms_stocktake(id bigserial PRIMARY KEY,stocktake_no text,date date,act_qty numeric,diff_qty numeric,status text,created_at timestamptz DEFAULT now());
    CREATE TABLE store_master(id bigint PRIMARY KEY,store_code text,status text,company_code text);
    ALTER TABLE wms_warehouses ADD COLUMN owner_store_id bigint;
    CREATE TABLE prc2_purchase_orders(id bigint PRIMARY KEY,company_code text,currency_code text);
    CREATE TABLE prc2_receipts(id bigint PRIMARY KEY,receipt_no text,company_code text,warehouse_code text,status text,po_id bigint REFERENCES prc2_purchase_orders(id));
    CREATE TABLE prc2_receipt_items(id bigint PRIMARY KEY,receipt_id bigint REFERENCES prc2_receipts(id),item_code text,actual_qty numeric,unit text,unit_price numeric(18,6));`);
  await db.query(`CREATE TABLE sal_return_orders(id bigint PRIMARY KEY,return_no text,status text);
    CREATE TABLE sal_return_items(id bigint PRIMARY KEY,return_order_id bigint REFERENCES sal_return_orders(id),sales_order_item_id bigint,
      accepted_qty numeric DEFAULT 0,damaged_qty numeric DEFAULT 0,restock_status text);
    CREATE TABLE sal_order_item_batch_allocations(id bigint PRIMARY KEY,sales_order_item_id bigint,batch_no text REFERENCES inv_batches(batch_no),outbound_qty numeric,
      reserved_qty numeric DEFAULT 0,released_qty numeric DEFAULT 0);
    CREATE TABLE sal_store_sales(id bigint PRIMARY KEY,sale_no text,status text);
    CREATE TABLE store_sale_allocations(id bigint PRIMARY KEY,sale_id bigint REFERENCES sal_store_sales(id),batch_no text REFERENCES inv_batches(batch_no),allocated_qty numeric,returned_qty numeric DEFAULT 0);`);
  await db.query(`INSERT INTO wms_warehouses(warehouse_code,company_code,site_code,status,type,domain) VALUES('WH-P','COMP-A','SITE-A','ACTIVE','PURCHASE_RECV','OPERATIONAL');
    INSERT INTO wms_locations VALUES('LOC-P','WH-P','ACTIVE');
    INSERT INTO file_metadata(file_id,status,visibility,mime_type,module_code,owner_type,owner_id,company_code,uploaded_by,checksum)
      VALUES('CONVERSION-P-EVIDENCE','ACTIVE','PROTECTED','application/pdf','PRODUCTION_CONVERSION','WAREHOUSE','WH-P','COMP-A','maker',repeat('c',64))`);
  const q=db.createQueryRunner();await q.connect();try{
    await new OfficialRawCollectionReceipts1795005390930().up(q);
    await new AlignWmsTransactionForms1787731200000().up(q);await new UpgradeWmsTransferLifecycle1787965200000().up(q);
    await new AddWmsDefectDisposition1794405000000().up(q);
    await new OfficialInventoryConversions1795011331222().up(q);
  }finally{await q.release();}
}

/** Explicit synthetic zero count, signatures and state events in the caller-owned schema only. */
export async function activateOwnedConversionDomain(db:DataSource,options?:{scopeId:string;houseCode:string;warehouseCode:string}){
  const scopeId=options?.scopeId??'50000000-0000-0000-0000-000000000001';
  const houseCode=options?.houseCode??'HOUSE-A',warehouseCode=options?.warehouseCode??'WH-A';
  const id='60000000-0000-0000-0000-000000000001';
  await db.transaction(async m=>{
    await m.query('ALTER TABLE production_opening_receipts ADD COLUMN IF NOT EXISTS cutover_manifest_id uuid UNIQUE REFERENCES production_cutover_manifests(id)');
    const manifest=randomUUID();
    await m.query(`INSERT INTO production_cutover_manifests(id,document_no,company_code,warehouse_code,intent_key,creation_hash,boundary,payload,created_by)
      VALUES($1,$2,'COMP-A',$4,$2,repeat('d',64),$3,'{"openingLines":[]}','owned synthetic count maker')`,
      [manifest,`SYNTHETIC-COUNT-${manifest}`,JSON.stringify({productCodes:['PRD-EGG-RAW'],houses:[{houseCode,firstProductionDate:'2026-11-17'}]}),warehouseCode]);
    await m.query("UPDATE production_cutover_manifests SET state='READY',version=version+1,snapshot='{}',snapshot_sha256=repeat('d',64),content_hash=repeat('d',64) WHERE id=$1",[manifest]);
    for(const [role,actor,name] of [['BUSINESS','1','maker'],['FINANCE','2','reviewer']]){
      const file=`DOMAIN-${role}`;
      await m.query(`INSERT INTO file_metadata(file_id,status,visibility,mime_type,module_code,owner_type,owner_id,company_code,uploaded_by,checksum)
        VALUES($1,'ACTIVE','PROTECTED','application/pdf','PRODUCTION_CUTOVER','WAREHOUSE',$3,'COMP-A',$2,repeat('d',64)) ON CONFLICT DO NOTHING`,[file,name,warehouseCode]);
      await m.query(`INSERT INTO production_cutover_signatures(id,manifest_id,signature_role,content_hash,snapshot_sha256,signed_by,evidence_file_id,evidence_checksum,reason)
        VALUES($1,$2,$3,repeat('d',64),repeat('d',64),$4,$5,repeat('d',64),'Owned synthetic zero count signature')`,[randomUUID(),manifest,role,actor,file]);
    }
    await m.query("UPDATE production_cutover_manifests SET state='APPROVED',version=version+1 WHERE id=$1",[manifest]);
    await m.query("INSERT INTO production_inventory_domain_states(id,company_code,warehouse_code,product_code,created_by) VALUES($1,'COMP-A',$2,'PRD-EGG-RAW','owned fixture')",[id,warehouseCode]);
    const opening=randomUUID();
    for(const [state,version] of [['FENCED',1],['ACTIVE',2]]){
      const event=randomUUID();
      await m.query(`INSERT INTO production_inventory_domain_events(id,domain_id,state,version,manifest_id,intent_key,content_hash,reason,signed_by,evidence_file_id,evidence_checksum)
        VALUES($1::uuid,$2,$3,$4,$5,$1::text,repeat('d',64),'Owned synthetic domain event','1','DOMAIN-BUSINESS',repeat('d',64))`,[event,id,state,version,manifest]);
      await m.query('UPDATE production_inventory_domain_states SET state=$2,version=$3 WHERE id=$1',[id,state,version]);
      if(state==='FENCED')await m.query(`INSERT INTO production_opening_domain_claims(domain_id,manifest_id,opening_receipt_id,scope_id,content_hash,claimed_by)
        VALUES($1,$2,$3,$4,repeat('d',64),'1')`,[id,manifest,opening,scopeId]);
    }
    await m.query(`INSERT INTO production_opening_receipts(id,handover_ref,company_code,warehouse_code,scope_id,evidence_sha256,manifest,created_by,receipt,cutover_manifest_id)
      VALUES($1,$2,'COMP-A',$4,$5,repeat('d',64),$3,'1','{"synthetic":true,"totalOpening":0,"batches":[]}', $6)`,
      [opening,`SYNTHETIC-ZERO-${manifest}`,JSON.stringify({manifestId:manifest}),warehouseCode,scopeId,manifest]);
    await m.query(`UPDATE production_cutover_manifests SET state='APPLIED',version=version+1,applied_at=now(),receipt='{"synthetic":true,"totalOpening":0,"batches":[]}' WHERE id=$1`,[manifest]);
    if(options)await m.query(`UPDATE production_inventory_domains SET inventory_domain_id=$1
      WHERE scope_id=$2 AND company_code='COMP-A' AND warehouse_code=$3 AND product_code='PRD-EGG-RAW'`,[id,scopeId,warehouseCode]);
  });return id;
}
