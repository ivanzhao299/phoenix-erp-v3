import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
/** Isolated fixture only: no existing/production authentication artifacts. */
export async function packingHistoryFixture(ds:DataSource){
  if(process.env.NODE_ENV!=='test'||ds.options.database!=='packaging_history_test')throw Error('ISOLATED_TEST_DATABASE_REQUIRED');
  const prefix=`TEST-${randomUUID().slice(0,6)}`,company=`${prefix}-C`,farm=`${prefix}-F`,house=`${prefix}-H`,warehouse=`${prefix}-W`,location=`${prefix}-L`;
  const variety=`${prefix}-VAR`,breed=`${prefix}-BREED`;
  await ds.query(`INSERT INTO sys_organizations(org_code,org_name,org_type,company_code,status) VALUES($1,$1,'COMPANY',$1,'ACTIVE')`,[company]);
  await ds.query(`INSERT INTO md_product_varieties(variety_code,variety_name,status) VALUES($1,$1,'ACTIVE')`,[variety]);
  await ds.query(`INSERT INTO sys_dict(dict_type,dict_code,status) VALUES('BRD_BREED',$1,'ACTIVE')`,[breed]);
  await ds.query(`INSERT INTO md_variety_breeds(variety_code,breed_code,status) VALUES($1,$2,'ACTIVE')`,[variety,breed]);
  await ds.query(`INSERT INTO brd_farms(farm_code,company_code,status) VALUES($1,$2,'ACTIVE');`,[farm,company]);
  await ds.query(`INSERT INTO brd_houses(house_code,farm_code,status) VALUES($1,$2,'ACTIVE')`,[house,farm]);
  await ds.query(`INSERT INTO brd_flocks(flock_no,house_code,farm_code,breed_code,status,placement_date,start_date) VALUES($1,$2,$3,$4,'LAYING','2025-01-01','2025-01-01')`,[`${prefix}-FLOCK`,house,farm,breed]);
  await ds.query(`INSERT INTO wms_warehouses(warehouse_code,warehouse_name,company_code,status) VALUES($1,$1,$2,'ACTIVE')`,[warehouse,company]);
  await ds.query(`INSERT INTO wms_locations(location_code,location_name,warehouse_code,status) VALUES($1,$1,$2,'NORMAL')`,[location,warehouse]);
  await ds.query(`INSERT INTO inv_source_mode(scope_level,scope_code,mode) VALUES('SITE',$1,'PACKAGING_INBOUND')`,[farm]);
  const [user]=await ds.query(`INSERT INTO sys_user(username,real_name,password_hash,status) VALUES($1,$1,'TEST-NON-LOGIN',1) RETURNING user_id::text`,[prefix]);
  const [shift]=await ds.query(`INSERT INTO pkg_work_shifts(shift_code,production_date,site_id,status) VALUES($1,'2026-01-02',$2,'CLOSED') RETURNING id::text`,[prefix,farm]);
  const [source]=await ds.query(`INSERT INTO pkg_source_batches(batch_code,house_code,shift_id,production_date,received_qty,batch_status) VALUES($1,$2,$3,'2026-01-02',50,'RECEIVED') RETURNING id`,[prefix,house,shift.id]);
  const [grading]=await ds.query(`INSERT INTO pkg_grading_records(code,shift_id,production_date,idempotency_key,payload_hash,outputs_json,total_output) VALUES($1,$2,'2026-01-02',$1,$1,'{}',50) RETURNING id`,[prefix,shift.id]);
  await ds.query('INSERT INTO pkg_grading_source_links(grading_id,source_batch_id,input_qty) VALUES($1,$2,50)',[grading.id,source.id]);
  await ds.query(`INSERT INTO mst_products(product_code,status,variety_code,unit,unit_zh) VALUES($1,'ACTIVE',$2,'枚','枚')`,[prefix,variety]);
  const outputs:any[]=[];
  for(const qty of [30,20]){
    const grade=`${prefix}-G${qty}`,spec=`${prefix}-S${qty}`,sku=`${prefix}-SKU${qty}`;
    await ds.query(`INSERT INTO product_grades(grade_code,grade_name,status,is_saleable,is_storable) VALUES($1,$1,'ACTIVE',true,true)`,[grade]);
    await ds.query(`INSERT INTO packaging_specs(spec_code,spec_name,qty_per_unit,base_unit,display_unit) VALUES($1,$1,$2,'枚','箱')`,[spec,qty]);
    await ds.query(`INSERT INTO product_skus(sku_code,product_code,grade_code,spec_code,variety_code,status) VALUES($1,$2,$3,$4,$5,'ACTIVE')`,[sku,prefix,grade,spec,variety]);
    await ds.query(`INSERT INTO md_sku_org_scope(sku_code,scope_type,scope_code,status,sale_enabled,stock_enabled) VALUES($1,'COMPANY',$2,'ACTIVE',true,true)`,[sku,company]);
    // Historical output JSON predates variety snapshots; registration must derive and persist it from provenance.
    outputs.push({grade,specId:spec,spec,skuCode:sku,productCode:prefix,eggs:qty,boxes:1});
  }
  const [packing]=await ds.query(`INSERT INTO pkg_packing_records(code,shift_id,production_date,batches_json,grading_codes_json,total_eggs,total_boxes)
    VALUES($1,$2,'2026-01-02',$3,$4,50,2) RETURNING id::text`,[prefix,shift.id,JSON.stringify(outputs),JSON.stringify([prefix])]);
  const scope={isGlobal:false,scopeLevel:'SELF' as const,userId:user.user_id,allowedCompanyCodes:[company],allowedFarmCodes:[farm],allowedWarehouseCodes:[warehouse],allowedProjectCodes:[],allowedSiteCodes:[]};
  return {prefix,company,farm,house,warehouse,location,actor:user.user_id,shiftId:shift.id,packingId:packing.id,outputs,scope,
    req:{user:{userId:user.user_id,roles:['TEST_OPERATOR'],permissions:['MENU_PKG_OP:V,E'],perms_version:1}}};
}
