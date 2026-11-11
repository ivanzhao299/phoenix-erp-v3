import 'reflect-metadata';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { DataSource } from 'typeorm';
import { resolveQuantity, savedQuantity, sharedBatches, QuantitySnapshot } from './quantity-contract';
import { PackageQuantitySnapshots1794268800000 } from '../../../database/migrations/1794268800000-PackageQuantitySnapshots';
import { EggInventoryService } from '../../sales-v2/services/egg-inventory.service';
import { StorePosService } from '../../store-pos/services/store-pos.service';
import { ReturnOrdersService } from '../../sales-v2/services/return-orders.service';
import { PriceRuntimeService } from '../../sales-v2/services/price-runtime.service';
import { MasterDataReferencesService } from '../../master-data/master-data-references.service';
import { SalesOrdersService } from '../../sales-v2/services/sales-orders.service';
import { MasterDataRuntimeService } from '../../master-data/master-data-runtime.service';
import { WmsService } from '../../wms/wms.service';

const fixtureUrl = process.env.PACKAGE_QUANTITY_PG_URL;
const fixture = fixtureUrl ? describe : describe.skip;
fixture('package quantities: owned disposable PostgreSQL 18 service integration', () => {
  let db: DataSource; let inv: EggInventoryService; let pos: StorePosService; let returns: ReturnOrdersService;
  let price: PriceRuntimeService; let wms: WmsService;
  const cls = { get: (key: string) => key==='dataScope' ? { isGlobal: true, allowedCompanyCodes: ['C'], allowedWarehouseCodes: ['W'] } : { username: 'quantity-fixture' } };
  const migration = new PackageQuantitySnapshots1794268800000();
  const snapshot = async (skuCode = 'BOX', qty = 1) => db.transaction(m => resolveQuantity(m, { qty, skuCode, quantityBasis: 'PACKAGE' })) as Promise<QuantitySnapshot>;
  beforeAll(async () => {
    const url = new URL(fixtureUrl!);
    if (url.hostname!=='127.0.0.1' || url.pathname!=='/quantity_fixture' || !process.env.PACKAGE_QUANTITY_FIXTURE_OWNER) throw new Error('Owned loopback fixture required');
    db = await new DataSource({ type: 'postgres', url: fixtureUrl, synchronize: false, migrationsRun: false, installExtensions: false, extra: { max: 8 } }).initialize();
    const [owner] = await db.query('SELECT owner_key FROM quantity_fixture_owner');
    if (owner?.owner_key!==process.env.PACKAGE_QUANTITY_FIXTURE_OWNER) throw new Error('Fixture ownership mismatch');
    await db.query(`
      CREATE TABLE mst_products (product_code text PRIMARY KEY,product_name text,unit text DEFAULT '个',unit_zh text,status text,variety_code text);
      CREATE TABLE mst_materials (material_code text PRIMARY KEY,material_name text,material_type text,unit text,status text);
      CREATE TABLE packaging_specs (spec_code text PRIMARY KEY,qty_per_unit numeric(10,2),base_unit text,display_unit text,status text);
      CREATE TABLE product_grades (grade_code text PRIMARY KEY,sort_order int,status text,is_saleable boolean DEFAULT true,is_storable boolean DEFAULT true);
      CREATE TABLE product_skus (sku_code text PRIMARY KEY,product_code text,grade_code text,spec_code text,status text,effective_date date,expire_date date,variety_code text);
      CREATE TABLE sys_organizations (org_code text PRIMARY KEY,company_code text,org_type text,status text);
      CREATE TABLE md_product_varieties (variety_code text PRIMARY KEY,status text,effective_date date,expire_date date);
      CREATE TABLE md_sku_org_scope (sku_code text,scope_type text,scope_code text,sale_enabled boolean,stock_enabled boolean,status text,
        effective_date date,expire_date date,PRIMARY KEY(sku_code,scope_type,scope_code));
      CREATE TABLE wms_warehouses (warehouse_code text PRIMARY KEY,company_code text,domain text DEFAULT 'OPERATIONAL');
      CREATE TABLE wms_zones (zone_code text,warehouse_code text,zone_type text,status text);
      CREATE TABLE wms_locations (location_code text,warehouse_code text,zone_code text,status text);
      CREATE TABLE inv_batches (id serial PRIMARY KEY,batch_no text UNIQUE,product_code text,company_code text,warehouse_code text,location_code text,
        egg_date date,inbound_date date,expire_date date,quality_grade text,packaging_spec text,source_type text,source_no text,
        qty numeric(14,3),qty_available numeric(14,3),status text,sku_code text,grade_code_std text,spec_code text,variety_code text,unit text,
        material_code text,item_type text,material_type text,legacy_source text,store_code text,packaging_batch_ref text,collection_batch_ref text,
        created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE inv_ledger (id serial PRIMARY KEY,batch_no text,change_type text,qty_change numeric(14,3),operator text,store_code text,ref_no text,note text,
        batch_expire_date date,quality_grade text,company_code text,sku_code text,material_code text,log_date date,warehouse_code text,location_code text,
        business_type text,destination_type text,destination_code text,project_code text,department_code text,unit text,created_at timestamptz DEFAULT now());
      CREATE TABLE sal_sales_orders (id serial PRIMARY KEY,order_no text,company_code text,company_name text,customer_code text,customer_name text,currency_code text,fulfillment_warehouse_code text);
      CREATE TABLE sal_order_items (id serial PRIMARY KEY,sales_order_id int,product_code text,product_name text,grade_code text,packaging_spec text,sku_code text,
        qty numeric(18,2),allocated_qty numeric(18,2),allocated_batch_no text,unit_price numeric(18,2),actual_unit_price numeric(18,2),amount numeric(18,2),created_at timestamptz DEFAULT now());
      CREATE TABLE sal_order_item_batch_allocations (id serial PRIMARY KEY,sales_order_item_id int,batch_no text,reserved_qty numeric(18,2),outbound_qty numeric(18,2) DEFAULT 0,
        released_qty numeric(18,2) DEFAULT 0,reservation_ledger_id int,created_by text,updated_at timestamptz DEFAULT now());
      CREATE TABLE sal_order_item_batch_allocation_actions (id serial PRIMARY KEY,allocation_id int,sales_order_id int,delivery_order_id int,action_type text,action_key text,qty numeric(18,2),ledger_id int,created_by text);
      CREATE TABLE sal_store_sale_items (id serial PRIMARY KEY,sale_id int,sku_code text,qty numeric(18,3),product_code text,created_at timestamptz DEFAULT now());
      CREATE TABLE store_sale_allocations (id serial PRIMARY KEY,sale_id int,sale_item_id int,batch_no text,warehouse_code text,allocated_qty numeric(18,3),returned_qty numeric(18,3) DEFAULT 0,updated_at timestamptz DEFAULT now());
      CREATE TABLE sal_return_orders (id serial PRIMARY KEY,return_no text,sales_order_id int,sales_order_no text,delivery_order_id int,customer_code text,customer_name text,
        company_code text,company_name text,return_type text,reason_code text,currency_code text,subtotal numeric(18,2),target_warehouse_code text,target_zone_code text,target_location_code text,
        status text,need_approval boolean,created_by text,created_at timestamptz,updated_at timestamptz,inspected_at timestamptz);
      CREATE TABLE sal_return_items (id serial PRIMARY KEY,return_order_id int,sales_order_item_id int,product_code text,product_name text,grade_code text,packaging_spec text,
        returned_qty numeric(18,2),accepted_qty numeric(18,2),damaged_qty numeric(18,2),unit_price numeric(18,2),amount numeric(18,2),inspection_result text,restock_status text,remark text,sku_code text,created_at timestamptz);
      CREATE TABLE sal_price_books (id serial PRIMARY KEY,company_code text,status text,price_book_no text,priority int DEFAULT 1,store_code text,customer_code text,channel_code text,
        publish_version int DEFAULT 1,effective_from date,effective_to date);
      CREATE TABLE sal_price_items (id serial PRIMARY KEY,price_book_id int,product_code text,grade_code text,packaging_spec text,sku_code text,grade_code_std text,spec_code text,
        unit_price numeric(18,4),floor_price numeric(18,4),ceiling_price numeric(18,4),currency_code text,status text,min_qty numeric,max_qty numeric,created_at timestamptz DEFAULT now());
      CREATE TABLE wms_outbound (id serial PRIMARY KEY,outbound_no text,item text,material_code text,created_at timestamptz DEFAULT now());
      CREATE TABLE wms_inbound (id serial PRIMARY KEY,item text,created_at timestamptz DEFAULT now());
      CREATE TABLE pkg_packing_records (id serial PRIMARY KEY,code text,batches_json jsonb,created_at timestamptz DEFAULT now());
      CREATE TABLE wms_inbound_items (id serial PRIMARY KEY,product_code text,created_at timestamptz DEFAULT now());
      CREATE TABLE wms_outbound_items (id serial PRIMARY KEY,product_code text,created_at timestamptz DEFAULT now());
      CREATE TABLE prc2_request_items (id serial PRIMARY KEY,item_code text,created_at timestamptz DEFAULT now());
      CREATE TABLE prc2_order_items (id serial PRIMARY KEY,item_code text,created_at timestamptz DEFAULT now());
      CREATE TABLE prc2_receipt_items (id serial PRIMARY KEY,item_code text,created_at timestamptz DEFAULT now());
    `);
    await db.query(`ALTER TABLE wms_warehouses ADD COLUMN type text DEFAULT 'PURCHASE_RECV';
      ALTER TABLE wms_inbound ADD COLUMN task_no text, ADD COLUMN warehouse_code text,ADD COLUMN operator text,ADD COLUMN store_code text,
        ADD COLUMN status text,ADD COLUMN type text,ADD COLUMN date date,ADD COLUMN updated_at timestamptz;
      ALTER TABLE wms_inbound_items ADD COLUMN task_no text,ADD COLUMN batch_no text,ADD COLUMN qty numeric(18,3),ADD COLUMN actual_qty numeric(18,3),ADD COLUMN broken_qty numeric(18,3);
    `);
    await db.query(`ALTER TABLE wms_warehouses ADD COLUMN status text DEFAULT 'ACTIVE',ADD COLUMN owner_store_id int;
      CREATE TABLE store_warehouse_bindings (warehouse_code text,purpose text,status text,effective_to date);
      ALTER TABLE sal_sales_orders ADD COLUMN customer_id text,ADD COLUMN channel_code text,ADD COLUMN status text,
        ADD COLUMN warehouse_governance_pending boolean,ADD COLUMN price_book_id text,ADD COLUMN price_book_no text,
        ADD COLUMN subtotal numeric(18,2),ADD COLUMN discount numeric(18,2),ADD COLUMN total_amount numeric(18,2),
        ADD COLUMN need_price_approval boolean,ADD COLUMN need_credit_approval boolean,ADD COLUMN over_credit boolean,ADD COLUMN below_floor_price boolean,
        ADD COLUMN expected_delivery_date date,ADD COLUMN delivery_address text,ADD COLUMN remark text,ADD COLUMN created_by text,ADD COLUMN created_at timestamptz DEFAULT now(),ADD COLUMN updated_at timestamptz;
      ALTER TABLE sal_order_items ADD COLUMN resolved_unit_price numeric(18,2),ADD COLUMN floor_price numeric(18,2),ADD COLUMN ceiling_price numeric(18,2),
        ADD COLUMN price_book_id text,ADD COLUMN price_book_no text,ADD COLUMN below_floor_price boolean;
      ALTER TABLE mst_materials ADD COLUMN updated_at timestamptz;
      ALTER TABLE mst_materials ADD COLUMN spec text;
      ALTER TABLE mst_products ADD COLUMN specs text;
      ALTER TABLE product_skus ADD COLUMN sku_name text;
      CREATE TABLE store_master (id serial PRIMARY KEY,store_code text,status text);
      CREATE TABLE wms_transfer (id serial PRIMARY KEY,transfer_no text,from_warehouse text,to_warehouse text,from_zone text,to_zone text,from_location text,to_location text,
        batch_no text,qty numeric(14,3),reason text,attachment_url text,operator text,status text,operator_id int,created_at timestamptz,updated_at timestamptz,
        in_transit_qty numeric,received_qty numeric,dispatched_at timestamptz,dispatched_by text,received_at timestamptz,received_by text,completed_at timestamptz);
      CREATE TABLE wms_transfer_items (id serial PRIMARY KEY,transfer_no text,source_batch_no text,target_batch_no text,expected_qty numeric,received_qty numeric,difference_qty numeric,source_snapshot jsonb);

      CREATE TABLE mst_audit_trail (id serial PRIMARY KEY,object_type text,object_code text,action text,before_json jsonb,after_json jsonb,operator text,reason text);
    `);
    await migration.up(db.createQueryRunner());
    await migration.up(db.createQueryRunner());
    await db.query(`INSERT INTO mst_products (product_code,product_name,unit,unit_zh,status,variety_code) VALUES ('P','鸡蛋','个','枚','ACTIVE','EGG_RED');
      INSERT INTO sys_organizations VALUES ('C','C','COMPANY','ACTIVE'),('OTHER','OTHER','COMPANY','ACTIVE');
      INSERT INTO md_product_varieties VALUES ('EGG_RED','ACTIVE','2026-01-01',NULL);
      INSERT INTO mst_materials (material_code,material_name,material_type,unit,status) VALUES ('P','鸡蛋','PACKAGING','kg','ACTIVE');
      INSERT INTO packaging_specs VALUES ('T',30,'枚','托','ACTIVE'),('B',360,'枚','箱','ACTIVE');
      INSERT INTO product_grades VALUES ('G',1,'ACTIVE'),('H',2,'ACTIVE');
      INSERT INTO product_skus (sku_code,product_code,grade_code,spec_code,status,variety_code) VALUES ('TRAY','P','G','T','ACTIVE','EGG_RED'),('BOX','P','G','B','ACTIVE','EGG_RED');
      INSERT INTO md_sku_org_scope (sku_code,scope_type,scope_code,sale_enabled,stock_enabled,status)
        VALUES ('TRAY','COMPANY','C',true,true,'ACTIVE'),('BOX','COMPANY','C',true,true,'ACTIVE');
      INSERT INTO wms_warehouses VALUES ('W','C','OPERATIONAL');
      INSERT INTO wms_zones VALUES ('Q','W','QUARANTINE','ACTIVE');
      INSERT INTO wms_locations VALUES ('Q-L','W','Q','ACTIVE');`);
    inv = new EggInventoryService(db,cls as never); price=new PriceRuntimeService(db,cls as never);
    pos=new StorePosService(db,cls as never,{} as never,price);
    returns=new ReturnOrdersService(db,cls as never,{} as never,{} as never,inv,{ appendEvent: async () => undefined } as never);
    wms=new WmsService(db.manager,cls as never);
  });
  afterAll(async () => { if (db?.isInitialized) await db.destroy(); });
  beforeEach(async () => {
    await db.query(`TRUNCATE inv_ledger,inv_batches,sal_order_items,sal_sales_orders,sal_order_item_batch_allocations,sal_order_item_batch_allocation_actions,
      store_sale_allocations,sal_return_items,sal_return_orders,sal_price_items,sal_price_books,prc2_order_items RESTART IDENTITY;
      UPDATE product_skus SET status='ACTIVE'; UPDATE packaging_specs SET qty_per_unit=CASE WHEN spec_code='T' THEN 30 ELSE 360 END;
      UPDATE md_product_varieties SET status='ACTIVE'; UPDATE md_sku_org_scope SET status='ACTIVE',stock_enabled=true;`);
  });
  const batch = async (qty=360) => inv.createProductionBatch({ companyCode: 'C',warehouseCode: 'W',eggDate: '2026-11-10',skuCode: 'TRAY',productCode: 'P',varietyCode: 'EGG_RED',qty,shelfDays: 3000 });
  const order = async (q: QuantitySnapshot | null, qty=1) => {
    const [o]=await db.query(`INSERT INTO sal_sales_orders (order_no,company_code,currency_code,fulfillment_warehouse_code) VALUES ('SO','C','LAK','W') RETURNING id`);
    const [i]=await db.query(`INSERT INTO sal_order_items (sales_order_id,product_code,grade_code,sku_code,packaging_spec,qty,unit_price,actual_unit_price,amount,quantity_snapshot)
      VALUES ($1,'P','G','BOX','B',$2,3600,3600,3600,$3) RETURNING *`,[o.id,qty,q]); return { orderId: String(o.id),itemId: String(i.id) };
  };
  it('rejects direct variant production without explicit variety or with an unauthorized company before writing stock', async () => {
    await expect(inv.createProductionBatch({ companyCode:'C',warehouseCode:'W',eggDate:'2026-11-10',skuCode:'TRAY',productCode:'P',qty:30 }))
      .rejects.toThrow('显式提供');
    await expect(inv.createProductionBatch({ companyCode:'OTHER',warehouseCode:'W',eggDate:'2026-11-10',skuCode:'TRAY',productCode:'P',varietyCode:'EGG_RED',qty:30 }))
      .rejects.toThrow('不适用于公司 OTHER');
    expect((await db.query('SELECT count(*) AS n FROM inv_batches'))[0].n).toBe('0');
    expect((await db.query('SELECT count(*) AS n FROM inv_ledger'))[0].n).toBe('0');
  });
  it('requires company stock scope and ACTIVE variety for the real package source batch', async () => {
    await db.query("UPDATE md_sku_org_scope SET stock_enabled=false WHERE sku_code='TRAY'");
    await expect(batch()).rejects.toThrow('用途被禁用');
    await db.query("UPDATE md_sku_org_scope SET stock_enabled=true WHERE sku_code='TRAY'; UPDATE md_product_varieties SET status='DISABLED'");
    await expect(batch()).rejects.toThrow('品种 EGG_RED');
    expect((await db.query('SELECT count(*) AS n FROM inv_batches'))[0].n).toBe('0');
  });
  it('1 box is served from tray source batches; source SKU may be stopped without contaminating the physical identity', async () => {
    const b=await batch(); const q=await snapshot(); const o=await order(q);
    await db.query("UPDATE product_skus SET status='FROZEN' WHERE sku_code='TRAY'");
    await inv.reserveInventory(o.orderId,'SO','C',undefined,'W');
    await inv.confirmOutbound(o.orderId,'SO','C','D','1',360);
    const [balance]=await db.query('SELECT qty,qty_available,sku_code,base_quantity_version FROM inv_batches WHERE batch_no=$1',[b.batch_no]);
    expect(balance).toMatchObject({ qty:'0.000',qty_available:'0.000',sku_code:'TRAY',base_quantity_version:1 });
    expect((await db.query("SELECT sku_code,qty_change FROM inv_ledger WHERE change_type='FIFO_OUT'"))[0]).toEqual({ sku_code:'TRAY',qty_change:'-360.000' });
  });
  it('shared candidates isolate different product/grade/unit and reject unknown historical measurement', async () => {
    const b=await batch(30); const q=await snapshot('TRAY');
    await db.query(`INSERT INTO inv_batches (batch_no,product_code,grade_code_std,unit,base_quantity_version,qty,qty_available,company_code,warehouse_code,status)
      VALUES ('other-grade','P','H','枚',1,360,360,'C','W','AVAILABLE'),('unknown','P','G','枚',NULL,360,360,'C','W','AVAILABLE'),
        ('other-company','P','G','枚',1,360,360,'UNAUTH','W','AVAILABLE'),('other-warehouse','P','G','枚',1,360,360,'C','OTHER-WH','AVAILABLE'),
        ('other-unit','P','G','kg',1,360,360,'C','W','AVAILABLE'),('other-product','X','G','枚',1,360,360,'C','W','AVAILABLE')`);
    expect((await db.transaction(m=>sharedBatches(m,'C',['W'],q))).map((x:any)=>x.batch_no)).toEqual([b.batch_no]);
  });
  it('tray / box concurrent requests compete for the same pool; shortage rolls all writes back', async () => {
    await batch(360); const tq=await snapshot('TRAY'); const bq=await snapshot();
    const results=await Promise.allSettled([tq,bq].map(q=>db.transaction(m=>inv.allocateByFIFO({ productCode:'P',skuCode:q.skuCode,companyCode:'C',qty:q.baseQty,quantitySnapshot:q,fulfillmentWarehouseCode:'W',refNo:'race',note:'race' },m))));
    expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    const [r]=await db.query('SELECT qty_available FROM inv_batches'); expect(Number(r.qty_available)).toBeGreaterThanOrEqual(0);
    expect([0,330]).toContain(Number(r.qty_available));
  });
  it('partial delivery then cancellation releases only the remainder, and retries do not release twice', async () => {
    await batch(); const o=await order(await snapshot()); await inv.reserveInventory(o.orderId,'SO','C',undefined,'W');
    await inv.confirmOutbound(o.orderId,'SO','C','D','1',30);
    await db.transaction(m=>inv.releaseInventory(o.orderId,'SO','C',m)); await db.transaction(m=>inv.releaseInventory(o.orderId,'SO','C',m));
    expect((await db.query('SELECT qty,qty_available FROM inv_batches'))[0]).toEqual({ qty:'330.000',qty_available:'330.000' });
    expect((await db.query('SELECT reserved_qty,outbound_qty,released_qty FROM sal_order_item_batch_allocations'))[0]).toEqual({ reserved_qty:'360.00',outbound_qty:'30.00',released_qty:'330.00' });
  });
  it('POS decrements physical and available quantities, preserves source SKU, and competes with sales reservation', async () => {
    await batch(); const q=await snapshot(); const o=await order(q);
    const sale={ id:1,sale_no:'POS',store_code:'S',company_code:'C',warehouseCodes:['W'],items:[{ id:1,sku_code:'BOX',product_code:'P',qty:1,quantity_snapshot:q }] };
    const results=await Promise.allSettled([inv.reserveInventory(o.orderId,'SO','C',undefined,'W'),db.transaction(m=>(pos as any).fifoDeductItems(sale,m))]);
    expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    const [r]=await db.query('SELECT qty,qty_available FROM inv_batches'); expect(Number(r.qty_available)).toBe(0); expect([0,360]).toContain(Number(r.qty));
    const events=await db.query("SELECT sku_code FROM inv_ledger WHERE change_type='FIFO_OUT'"); if(events.length) expect(events[0].sku_code).toBe('TRAY');
  });
  it('POS saved conversion survives spec edits and refunds source identity into quarantine', async () => {
    await batch(); const q=await snapshot(); await db.query("UPDATE packaging_specs SET qty_per_unit=720 WHERE spec_code='B'");
    const sale={ id:1,sale_no:'POS',store_code:'S',company_code:'C',warehouseCodes:['W'],items:[{ id:1,sku_code:'BOX',product_code:'P',qty:1,quantity_snapshot:q }] };
    await db.transaction(m=>(pos as any).fifoDeductItems(sale,m));
    const allocations=await db.query('SELECT a.*,b.product_code,b.sku_code,b.quality_grade AS grade_code,b.packaging_spec,b.grade_code_std,b.spec_code,b.unit,b.base_quantity_version,b.egg_date,b.expire_date FROM store_sale_allocations a JOIN inv_batches b ON b.batch_no=a.batch_no');
    await db.transaction(m=>(pos as any).reverseInventory(m,sale,allocations,['W']));
    expect((await db.query("SELECT qty,qty_available,sku_code,spec_code,unit,base_quantity_version FROM inv_batches WHERE source_type='STORE_RETURN'"))[0]).toEqual({ qty:'360.000',qty_available:'0.000',sku_code:'TRAY',spec_code:'T',unit:'枚',base_quantity_version:1 });
  });
  it('350 accepted + 10 damaged refunds 350/360 original box price, locks cumulative original-line return allowance', async () => {
    await batch(); const o=await order(await snapshot()); await inv.reserveInventory(o.orderId,'SO','C',undefined,'W'); await inv.confirmOutbound(o.orderId,'SO','C','D','1',360);
    await db.query("UPDATE packaging_specs SET qty_per_unit=720 WHERE spec_code='B'");
    const body={ salesOrderId:o.orderId,companyCode:'C',returnType:'CUSTOMER_RETURN',items:[{ salesOrderItemId:o.itemId,productCode:'WRONG',returnedQty:1,quantityBasis:'PACKAGE' as const,unitPrice:999999 }] };
    const ret=await returns.create(body);
    expect(Number(ret.items[0].returned_qty)).toBe(360); expect(Number(ret.items[0].unit_price)).toBe(3600);
    await db.query("UPDATE sal_return_orders SET status='INSPECTING' WHERE id=$1",[ret.id]);
    jest.spyOn(returns,'findById').mockImplementation(async()=>({} as any));
    await returns.completeInspection(String(ret.id),[{ itemId:String(ret.items[0].id),acceptedQty:350,damagedQty:10 }]);
    expect(Number((await db.query('SELECT subtotal FROM sal_return_orders WHERE id=$1',[ret.id]))[0].subtotal)).toBe(3500);
    await expect(returns.create(body)).rejects.toThrow('累计退货');
  });
  it('explicit prices convert both unit price and quantity steps; ambiguous old prices are not enabled for package orders', async () => {
    const q=await snapshot('TRAY');
    await db.query("INSERT INTO sal_price_books (company_code,status,price_book_no) VALUES ('C','ACTIVE','PB')");
    await db.query(`INSERT INTO sal_price_items (price_book_id,product_code,sku_code,unit_price,floor_price,currency_code,status,min_qty,max_qty,quantity_snapshot)
      VALUES (1,'P','BOX',10,9,'LAK','ACTIVE',360,720,$1)`,[{...q,skuCode:'BOX',specCode:'B',basis:'BASE',factor:1,baseQty:1,tradeUnit:'枚'}]);
    const result=await price.resolvePrice({ companyCode:'C',productCode:'P',skuCode:'BOX',quantityBasis:'PACKAGE',qty:1 });
    expect(result.unitPrice).toBe(3600); expect(result.floorPrice).toBe(3240);
    await db.query('UPDATE sal_price_items SET quantity_snapshot=NULL');
    await expect(price.resolvePrice({companyCode:'C',productCode:'P',skuCode:'BOX',quantityBasis:'PACKAGE',qty:1})).rejects.toThrow('未找到价格');
  });
  it('legacy saved quantity remains base and no name collision auto-merges a material with a product', async () => {
    expect(savedQuantity({qty:1})).toBe(1);
    const rows=await db.query("SELECT (SELECT count(*) FROM mst_materials WHERE material_code='P') AS materials,(SELECT count(*) FROM mst_products WHERE product_code='P') AS products");
    expect(rows[0]).toEqual({materials:'1',products:'1'});
    await db.query("INSERT INTO prc2_order_items (item_code) VALUES ('P')");
    expect((await new MasterDataReferencesService(db.manager).compute('MATERIAL','P')).canArchive).toBe(false);
    await db.query('ALTER TABLE prc2_receipt_items RENAME TO fixture_missing_receipts');
    try { await expect(new MasterDataReferencesService(db.manager).compute('MATERIAL','unused')).rejects.toThrow(); }
    finally { await db.query('ALTER TABLE fixture_missing_receipts RENAME TO prc2_receipt_items'); }
  });
  it('WMS same-code ambiguity is rejected; explicit MATERIAL and SKU resolve separately', async () => {
    await db.query("INSERT INTO mst_materials (material_code,material_name,material_type,unit,status) VALUES ('BOX','鸡蛋耗材','PACKAGING','件','ACTIVE')");
    await expect(db.transaction(m=>(wms as any).resolveInventoryItem(m,'BOX',null))).rejects.toThrow('同码跨域');
    expect(await db.transaction(m=>(wms as any).resolveInventoryItem(m,'BOX','MATERIAL'))).toMatchObject({itemType:'MATERIAL',unit:'件'});
    expect(await db.transaction(m=>(wms as any).resolveInventoryItem(m,'BOX','SKU'))).toMatchObject({itemType:'SKU',unit:'枚'});
  });
  it('refund cents are allocated cumulatively and finish at the original amount even across 180 partial returns', async () => {
    await batch(); const o=await order(await snapshot());
    await db.query('UPDATE sal_order_items SET amount=1,unit_price=0,actual_unit_price=0 WHERE id=$1',[o.itemId]);
    await inv.reserveInventory(o.orderId,'SO','C',undefined,'W'); await inv.confirmOutbound(o.orderId,'SO','C','D','1',360);
    jest.spyOn(returns,'findById').mockImplementation(async()=>({} as any));
    let total=0;
    for (let i=0;i<180;i++) {
      const r=await returns.create({salesOrderId:o.orderId,companyCode:'C',returnType:'CUSTOMER_RETURN',items:[{salesOrderItemId:o.itemId,productCode:'P',returnedQty:2,unitPrice:999}]});
      await db.query("UPDATE sal_return_orders SET status='INSPECTING' WHERE id=$1",[r.id]);
      await returns.completeInspection(String(r.id),[{itemId:String(r.items[0].id),acceptedQty:2,damagedQty:0}]);
      total+=Number((await db.query('SELECT subtotal FROM sal_return_orders WHERE id=$1',[r.id]))[0].subtotal);
    }
    expect(Math.round(total*100)).toBe(100);
  });
  it('WMS competes with sales and preserves non-egg material base quantities', async () => {
    await batch(); const q=await snapshot(); const o=await order(q);
    const doc={company_code:'C',warehouse_code:'W',item_type:'SKU',quantity_snapshot:q,type:'SALE'};
    const results=await Promise.allSettled([inv.reserveInventory(o.orderId,'SO','C',undefined,'W'),db.transaction(m=>(wms as any).deductStandaloneOutboundByItem(m,'BOX',360,'WO',doc,{username:'fixture'}))]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    await db.query("INSERT INTO inv_batches (batch_no,material_code,item_type,unit,qty,qty_available,company_code,warehouse_code,status) VALUES ('M','P','MATERIAL','kg',2.5,2.5,'C','W','AVAILABLE')");
    await db.transaction(m=>(wms as any).deductStandaloneOutboundByItem(m,'P',1.25,'MO',{company_code:'C',warehouse_code:'W',item_type:'MATERIAL',type:'SALE'},{username:'fixture'}));
    expect(Number((await db.query("SELECT qty_available FROM inv_batches WHERE batch_no='M'"))[0].qty_available)).toBe(1.25);
  });
  it('WMS inbound uses the persisted line id to separate BASE/PACKAGE rows of the same SKU and records actual trade/base quantities', async () => {
    await db.query("INSERT INTO wms_inbound (task_no,warehouse_code,status,type,date) VALUES ('IN','W','PENDING','PURCHASE','2026-11-10')");
    const b=await snapshot(); const base=(await db.transaction(m=>resolveQuantity(m,{skuCode:'BOX',qty:10,quantityBasis:'BASE'})))!;
    const [first]=await db.query("INSERT INTO wms_inbound_items (task_no,product_code,qty,quantity_snapshot) VALUES ('IN','BOX',1,$1) RETURNING id",[b]);
    const [second]=await db.query("INSERT INTO wms_inbound_items (task_no,product_code,qty,quantity_snapshot) VALUES ('IN','BOX',10,$1) RETURNING id",[base]);
    await expect(wms.confirmInbound({task_no:'IN',items:[{product_code:'BOX',actual_qty:1}]},{username:'fixture'})).rejects.toThrow('不唯一');
    await wms.confirmInbound({task_no:'IN',items:[{id:first.id,product_code:'BOX',actual_qty:1},{id:second.id,product_code:'BOX',actual_qty:10}]},{username:'fixture'});
    const [sum]=await db.query("SELECT sum(qty) AS qty FROM inv_batches WHERE source_type IS NULL");
    expect(Number(sum.qty)).toBe(370);
    expect((await db.query("SELECT actual_qty FROM wms_inbound_items WHERE task_no='IN' ORDER BY id")).map((r:any)=>Number(r.actual_qty))).toEqual([1,10]);
    expect((await db.query("SELECT grade_code_std,unit,base_quantity_version FROM inv_batches WHERE source_type IS NULL"))).toEqual(expect.arrayContaining([{grade_code_std:'G',unit:'枚',base_quantity_version:1}]));
  });
  it('persists the real 18,2-price order via create/update and refunds the original 1.00 amount despite a rounded base unit price', async () => {
    await batch(); const q=await snapshot();
    await db.query("INSERT INTO sal_price_books (company_code,status,price_book_no) VALUES ('C','ACTIVE','PB')");
    await db.query("INSERT INTO sal_price_items (price_book_id,product_code,sku_code,unit_price,currency_code,status,quantity_snapshot) VALUES (1,'P','BOX',1,'LAK','ACTIVE',$1)",[q]);
    const sales=new SalesOrdersService(db,cls as never,{} as never,price,{} as never,{} as never,{} as never,inv,{appendEvent:async()=>undefined} as never,{} as never);
    const draft=await sales.createDraft({companyCode:'C',fulfillmentWarehouseCode:'W',items:[{skuCode:'BOX',productCode:'P',quantityBasis:'BASE',qty:360}]});
    expect(Number(draft.items[0].unit_price)).toBe(0);
    expect(draft.items[0].price_snapshot.actualUnitPrice).toBeCloseTo(1/360,12);
    expect(Number(draft.items[0].amount)).toBe(1);
    const edited=await sales.updateDraft(String(draft.id),{items:[{skuCode:'BOX',productCode:'P',quantityBasis:'BASE',qty:360}]});
    await inv.reserveInventory(String(draft.id),draft.order_no,'C',undefined,'W'); await inv.confirmOutbound(String(draft.id),draft.order_no,'C','D','1',360);
    const r=await returns.create({salesOrderId:String(draft.id),companyCode:'C',returnType:'CUSTOMER_RETURN',items:[{salesOrderItemId:String(edited.items[0].id),productCode:'P',returnedQty:360,unitPrice:0}]});
    await db.query("UPDATE sal_return_orders SET status='INSPECTING' WHERE id=$1",[r.id]);
    jest.spyOn(returns,'findById').mockImplementation(async()=>({} as any));
    await returns.completeInspection(String(r.id),[{itemId:String(r.items[0].id),acceptedQty:360,damagedQty:0}]);
    expect(Number((await db.query('SELECT subtotal FROM sal_return_orders WHERE id=$1',[r.id]))[0].subtotal)).toBe(1);
    await expect(price.resolvePrice({companyCode:'C',productCode:'P',qty:360})).rejects.toThrow('明确价格计量');
  });
  it('material archive rejects procurement and pending WMS references; a true unreferenced archive commits its audit', async () => {
    const refs=new MasterDataReferencesService(db.manager);
    const runtime=new MasterDataRuntimeService(db,{} as never,{} as never,{} as never,refs,cls as never,{} as never);
    jest.spyOn(runtime,'get').mockImplementation(async(_type,code)=>(await db.query('SELECT * FROM mst_materials WHERE material_code=$1',[code]))[0]);
    await db.query("INSERT INTO prc2_order_items (item_code) VALUES ('P')");
    await expect(runtime.transition('material','P','archive','fixture')).rejects.toThrow('归档被阻断');
    await db.query("INSERT INTO mst_materials (material_code,material_name,status) VALUES ('UNUSED','未引用','ACTIVE'),('PENDING','待入库','ACTIVE')");
    await db.query("INSERT INTO wms_inbound_items (product_code) VALUES ('PENDING')");
    await expect(runtime.transition('material','PENDING','archive','fixture')).rejects.toThrow('归档被阻断');
    expect(await runtime.transition('material','UNUSED','archive','fixture')).toEqual({status:'ARCHIVED'});
    expect((await db.query("SELECT action FROM mst_audit_trail WHERE object_code='UNUSED'"))[0]).toEqual({action:'ARCHIVE'});
    await db.query(`INSERT INTO pkg_packing_records (code,batches_json) VALUES ('PK','[{"productCode":"JSON-PRODUCT"}]')`);
    expect((await refs.compute('PRODUCT','JSON-PRODUCT')).canArchive).toBe(false);
  });
  it('WMS transfer preserves base measurement proof, source grade/spec and packaging/collection references', async () => {
    const b=await batch(); await db.query("UPDATE inv_batches SET packaging_batch_ref='PK',collection_batch_ref='COL' WHERE batch_no=$1",[b.batch_no]);
    await db.query("INSERT INTO wms_warehouses (warehouse_code,company_code) VALUES ('W2','C')");
    await wms.confirmTransfer({from_warehouse:'W',to_warehouse:'W2',items:[{batch_no:b.batch_no,qty:30}]},{username:'fixture'});
    const [target]=await db.query("SELECT sku_code,grade_code_std,spec_code,unit,base_quantity_version,packaging_batch_ref,collection_batch_ref,qty FROM inv_batches WHERE warehouse_code='W2'");
    expect(target).toEqual({sku_code:'TRAY',grade_code_std:'G',spec_code:'T',unit:'枚',base_quantity_version:1,packaging_batch_ref:'PK',collection_batch_ref:'COL',qty:'30.000'});
  });
  it('candidate audit SQL is read only and does not merge same-name product/material fixtures', async () => {
    const before=(await db.query('SELECT count(*) AS count FROM mst_materials'))[0].count;
    await db.query(readFileSync(resolve(__dirname,'../../../../../../scripts/audit-product-material-identity.sql'),'utf8'));
    expect((await db.query('SELECT count(*) AS count FROM mst_materials'))[0].count).toBe(before);
  });
  it('insufficient stock never leaves a partial deduction or reservation ledger behind', async () => {
    await batch(30); const q=await snapshot();
    await expect(inv.allocateByFIFO({productCode:'P',skuCode:'BOX',companyCode:'C',qty:360,quantitySnapshot:q,fulfillmentWarehouseCode:'W',refNo:'short',note:'short'})).rejects.toThrow('库存不足');
    expect(Number((await db.query('SELECT qty_available FROM inv_batches'))[0].qty_available)).toBe(30);
    expect(Number((await db.query("SELECT count(*) AS n FROM inv_ledger WHERE change_type='RESERVED'"))[0].n)).toBe(0);
  });
  it('simultaneous original-line returns cannot both consume the remaining returned-base allowance', async () => {
    await batch(); const o=await order(await snapshot()); await inv.reserveInventory(o.orderId,'SO','C',undefined,'W'); await inv.confirmOutbound(o.orderId,'SO','C','D','1',360);
    const body={salesOrderId:o.orderId,companyCode:'C',returnType:'CUSTOMER_RETURN',items:[{salesOrderItemId:o.itemId,productCode:'P',returnedQty:360,unitPrice:0}]};
    const results=await Promise.allSettled([returns.create(body),returns.create(body)]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(Number((await db.query('SELECT sum(returned_qty) AS qty FROM sal_return_items'))[0].qty)).toBe(360);
  });
  it('migration down / up is idempotent on an empty fixture without guessing historical quantities', async () => {
    await migration.down(db.createQueryRunner()); await migration.down(db.createQueryRunner()); await migration.up(db.createQueryRunner());
    expect((await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='inv_batches' AND column_name='base_quantity_version'"))).toHaveLength(1);
  });
  it('migrates historical installations without optional WMS detail tables but still requires core tables', async () => {
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query('ALTER TABLE wms_inbound_items RENAME TO fixture_saved_inbound_items');
      await migration.down(runner);
      await migration.up(runner);
      expect(await runner.hasColumn('wms_outbound_items', 'quantity_snapshot')).toBe(true);
      await runner.query('ALTER TABLE wms_outbound_items RENAME TO fixture_saved_outbound_items');
      await migration.down(runner);
      await migration.up(runner);
      expect(await runner.hasColumn('sal_order_items', 'quantity_snapshot')).toBe(true);
      expect(await runner.hasTable('wms_inbound_items')).toBe(false);
      expect(await runner.hasTable('wms_outbound_items')).toBe(false);
      await runner.query('ALTER TABLE sal_order_items RENAME TO fixture_saved_order_items');
      await expect(migration.up(runner)).rejects.toThrow(/sal_order_items/);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
