import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { PackagingHistoryService } from './packaging-history.service';
import { PackagingWorkQueueService } from './packaging-work-queue.service';
import { packingHistoryFixture } from './packaging-history.fixture';

(process.env.PACKAGING_HISTORY_PG === '1' ? describe : describe.skip)('packaging work queue isolated PG18', () => {
  let ds: DataSource;
  let f: Awaited<ReturnType<typeof packingHistoryFixture>>;
  let queue: PackagingWorkQueueService;
  beforeAll(async () => {
    const url = process.env.PACKAGING_HISTORY_TEST_DATABASE_URL;
    const parsed = url ? new URL(url) : null;
    if (process.env.NODE_ENV !== 'test' || !parsed || !['127.0.0.1','localhost'].includes(parsed.hostname) || parsed.port !== '54329' || parsed.pathname !== '/packaging_history_test') throw Error('EXPLICIT_LOCAL_PG18_HISTORY_TEST_URL_REQUIRED');
    ds = new DataSource({type:'postgres',url,database:'packaging_history_test',entities:[],logging:false});
    await ds.initialize();
    if (Number((await ds.query('SHOW server_version_num'))[0].server_version_num) < 180000) throw Error('PG18_REQUIRED');
  });
  afterAll(async () => { await ds?.destroy(); });
  beforeEach(async () => {
    f = await packingHistoryFixture(ds);
    const history = new PackagingHistoryService(ds.manager, {resolve:async()=>f.scope} as any);
    queue = new PackagingWorkQueueService(history);
  });

  // These are read-routing fixtures, not cutover lifecycle tests. The enclosing
  // test suite has already asserted the exact database identity above; bypass
  // the guarded activation lifecycle only while installing isolated synthetic
  // rows, then commit before exercising the ordinary read path.
  async function seedSyntheticCutover(state: 'ACTIVE' | 'SUSPENDED', firstDate = '2025-01-01', houseCode = f.house) {
    const scopeId = randomUUID();
    await ds.transaction(async manager => {
      await manager.query("SET LOCAL session_replication_role='replica'");
      await manager.query(`INSERT INTO production_cutover_scopes
        (id,company_code,house_code,version,first_production_date,state,warehouse_code,flock_id,source_profile_code,manifest_sha256,evidence,confirmed_by,activated_at)
        VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,$9,'{}','synthetic-read-fixture',now())`,
        [scopeId,f.company,houseCode,firstDate,state,f.warehouse,`${f.prefix}-FLOCK`,`${f.prefix}-PROFILE`,'a'.repeat(64)]);
      await manager.query('INSERT INTO production_inventory_domains(scope_id,company_code,warehouse_code,product_code) VALUES($1,$2,$3,$4)',
        [scopeId,f.company,f.warehouse,f.prefix]);
    });
    return scopeId;
  }

  it('keeps ungraded source quantity separate and paginates same-day rows without skips', async () => {
    await ds.query("UPDATE pkg_work_shifts SET status='OPEN' WHERE id=$1", [f.shiftId]);
    await ds.query('UPDATE pkg_grading_records SET total_output=80 WHERE code=$1', [f.prefix]);
    const codes: string[] = [];
    for (let i=0;i<30;i++) {
      const code=`${f.prefix}-WAIT-${String(i).padStart(2,'0')}`; codes.push(code);
      await ds.query(`INSERT INTO pkg_source_batches(batch_code,house_code,shift_id,production_date,received_qty,batch_status)
        VALUES($1,$2,$3,'2026-01-02',7,'RECEIVED')`,[code,f.house,f.shiftId]);
    }
    const first = await queue.list({bucket:'CURRENT',siteCode:f.farm,shiftId:f.shiftId,pageSize:'25'},f.req);
    expect(first.nextCursor).toBeTruthy();
    const second = await queue.list({bucket:'CURRENT',siteCode:f.farm,shiftId:f.shiftId,pageSize:'25',cursor:first.nextCursor!},f.req);
    const all = [...first.items,...second.items];
    expect(all.filter(x=>codes.includes(x.code))).toHaveLength(30);
    expect(all.filter(x=>x.kind==='SOURCE').every(x=>x.quantity===7 && x.action==='GRADE')).toBe(true);
    expect(all.find(x=>x.kind==='GRADING')).toMatchObject({code:f.prefix,quantity:30,action:'PACK'});
    expect(first.counts.SOURCE).toBe(30);
    await expect(queue.list({bucket:'CURRENT',siteCode:f.farm,shiftId:f.shiftId,pageSize:'25',cursor:first.nextCursor!},
      {...f.req,user:{...f.req.user,userId:'another-user'}})).rejects.toThrow('INVALID_FILTER');
  });

  it('excludes originals with any missing grading reference from the carryover queue', async () => {
    await ds.query('UPDATE pkg_packing_records SET grading_codes_json=$2::jsonb WHERE id=$1',
      [f.packingId,JSON.stringify([f.prefix, f.prefix+'-MISSING'])]);
    const result=await queue.list({bucket:'CARRYOVER',siteCode:f.farm},f.req);
    expect(result.items).toEqual([]);
    expect(result.counts).toEqual({});
  });

  it('fails closed for a user whose complete menu scope has no authorized company or site', async () => {
    const deniedScope={...f.scope,allowedCompanyCodes:[],allowedFarmCodes:[],allowedWarehouseCodes:[]};
    const history=new PackagingHistoryService(ds.manager,{resolve:async()=>deniedScope} as any);
    const deniedQueue=new PackagingWorkQueueService(history);
    const result=await deniedQueue.list({bucket:'CURRENT',siteCode:f.farm,shiftId:f.shiftId},f.req);
    expect(result.items).toEqual([]);
    expect(result.counts).toEqual({});
  });

  it('does not fabricate an available remainder when one packing record references multiple grading sources', async () => {
    const [s1] = await ds.query(`INSERT INTO pkg_source_batches(batch_code,house_code,shift_id,production_date,received_qty,batch_status)
      VALUES($1,$2,$3,'2026-01-02',30,'RECEIVED') RETURNING id`,[`${f.prefix}-MULTI-SOURCE-1`,f.house,f.shiftId]);
    const [g] = await ds.query(`INSERT INTO pkg_grading_records(code,shift_id,production_date,idempotency_key,payload_hash,outputs_json,total_output)
      VALUES($1,$2,'2026-01-02',$1,$1,'{}',60) RETURNING id`,[`${f.prefix}-MULTI-GRADE`,f.shiftId]);
    const [s2] = await ds.query(`INSERT INTO pkg_source_batches(batch_code,house_code,shift_id,production_date,received_qty,batch_status)
      VALUES($1,$2,$3,'2026-01-02',60,'RECEIVED') RETURNING id`,[`${f.prefix}-MULTI-SOURCE`,f.house,f.shiftId]);
    await ds.query('INSERT INTO pkg_grading_source_links(grading_id,source_batch_id,input_qty) VALUES($1,$2,30),($1,$3,30)',[g.id,s1.id,s2.id]);
    await ds.query(`INSERT INTO pkg_packing_records(code,shift_id,production_date,grading_codes_json,total_eggs)
      VALUES($1,$2,'2026-01-02',$3,40)`,[`${f.prefix}-MULTI-PACK`,f.shiftId,JSON.stringify([`${f.prefix}-MULTI-GRADE`,f.prefix])]);
    const result=await queue.list({bucket:'REVIEW',siteCode:f.farm,shiftId:f.shiftId,pageSize:'100'},f.req);
    const row=result.items.find(x=>x.code===`${f.prefix}-MULTI-GRADE`);
    expect(row).toMatchObject({kind:'GRADING',quantity:null,action:'REVIEW',reason:'Existing packing allocation requires review'});
  });

  it('routes legacy TEMP work only with production view and mapped-site warehouse access', async () => {
    await ds.query("UPDATE pkg_work_shifts SET status='OPEN' WHERE id=$1",[f.shiftId]);
    await ds.query("UPDATE inv_source_mode SET mode='TEMP_PRODUCTION_INBOUND' WHERE scope_level='SITE' AND scope_code=$1",[f.farm]);
    await ds.query("UPDATE brd_farms SET mapped_site_code='SITE-MAPPED' WHERE farm_code=$1",[f.farm]);
    await ds.query("UPDATE wms_warehouses SET type='EGG_FARM',domain='OPERATIONAL',site_code='SITE-MAPPED' WHERE warehouse_code=$1",[f.warehouse]);
    await ds.query("INSERT INTO pkg_source_batches(batch_code,house_code,shift_id,production_date,received_qty,batch_status) VALUES($1,$2,$3,'2026-01-02',25,'RECEIVED')",
      [f.prefix+'-TEMP-SOURCE',f.house,f.shiftId]);
    const queue=new PackagingWorkQueueService(new PackagingHistoryService(ds.manager,{resolve:async()=>f.scope} as any));
    const req={...f.req,user:{...f.req.user,username:'p2-test',permissions:['MENU_PKG_OP:V','MENU_PROD_INBOUND:V']}};
    const result=await queue.list({bucket:'CURRENT',siteCode:f.farm,shiftId:f.shiftId},req);
    const item=result.items.find(x=>x.code===f.prefix+'-TEMP-SOURCE');
    expect(item).toMatchObject({action:'LEGACY_TEMP_INBOUND',routeCode:'LEGACY_TEMP_INBOUND'});
    const url=new URL(item!.href!,'http://local.test');
    expect(url.pathname).toBe('/breeding/daily-inbound');
    expect(Object.fromEntries(url.searchParams)).toEqual(expect.objectContaining({
      companyCode:f.company,siteCode:'SITE-MAPPED',houseCode:f.house,eggDate:'2026-01-02',queueAction:'LEGACY_TEMP_INBOUND',
    }));
    const noWarehouse={...f.scope,allowedWarehouseCodes:[]};
    const hidden=await new PackagingWorkQueueService(new PackagingHistoryService(ds.manager,{resolve:async()=>noWarehouse} as any))
      .list({bucket:'CURRENT',siteCode:f.farm,shiftId:f.shiftId},req);
    expect(hidden.items.find(x=>x.code===f.prefix+'-TEMP-SOURCE')).toMatchObject({href:null,action:'FORMAL_ROUTE_READ_ONLY'});
  });

  it('requires an ACTIVE cutover and accessible inventory domain for a formal RAW route', async () => {
    await ds.query("UPDATE pkg_work_shifts SET status='OPEN' WHERE id=$1",[f.shiftId]);
    await ds.query("UPDATE brd_farms SET mapped_site_code='SITE-MAPPED' WHERE farm_code=$1",[f.farm]);
    await ds.query("UPDATE wms_warehouses SET type='EGG_FARM',domain='OPERATIONAL',site_code='SITE-MAPPED' WHERE warehouse_code=$1",[f.warehouse]);
    await seedSyntheticCutover('ACTIVE');
    await ds.query("INSERT INTO pkg_source_batches(batch_code,house_code,shift_id,production_date,received_qty,batch_status) VALUES($1,$2,$3,'2026-01-02',25,'RECEIVED')",
      [f.prefix+'-RAW-SOURCE',f.house,f.shiftId]);
    const queue=new PackagingWorkQueueService(new PackagingHistoryService(ds.manager,{resolve:async()=>f.scope} as any));
    const req={...f.req,user:{...f.req.user,username:'p2-test',permissions:['MENU_PKG_OP:V','MENU_PROD_INBOUND:V']}};
    const result=await queue.list({bucket:'CURRENT',siteCode:f.farm,shiftId:f.shiftId},req);
    const item=result.items.find(x=>x.code===f.prefix+'-RAW-SOURCE');
    expect(item).toMatchObject({action:'FORMAL_RAW',routeCode:'FORMAL_RAW'});
    const url=new URL(item!.href!,'http://local.test');
    expect(url.pathname).toBe('/breeding/production-inbound');
    expect(Object.fromEntries(url.searchParams)).toEqual(expect.objectContaining({
      companyCode:f.company,siteCode:'SITE-MAPPED',houseCode:f.house,eggDate:'2026-01-02',
      queueAction:'FORMAL_RAW',sourceBatchCode:f.prefix+'-RAW-SOURCE',
    }));
    const noProductionWarehouse={...f.scope,allowedWarehouseCodes:[]};
    const scopedHistory=new PackagingHistoryService(ds.manager,{resolve:async(_id:string,_roles:string[],menu:string)=>
      menu==='MENU_PROD_INBOUND'?noProductionWarehouse:f.scope} as any);
    const hidden=await new PackagingWorkQueueService(scopedHistory).list({bucket:'CURRENT',siteCode:f.farm,shiftId:f.shiftId},req);
    expect(hidden.items.find(x=>x.code===f.prefix+'-RAW-SOURCE')).toMatchObject({href:null,action:'FORMAL_ROUTE_READ_ONLY'});
  });

  it('routes an ACTIVE non-packaging source as formal installments and keeps suspended or mode-less scopes read-only', async () => {
    await ds.query("UPDATE pkg_work_shifts SET status='OPEN' WHERE id=$1",[f.shiftId]);
    await ds.query("UPDATE brd_farms SET mapped_site_code='SITE-MAPPED' WHERE farm_code=$1",[f.farm]);
    await ds.query("UPDATE wms_warehouses SET type='EGG_FARM',domain='OPERATIONAL',site_code='SITE-MAPPED' WHERE warehouse_code=$1",[f.warehouse]);
    await ds.query("UPDATE inv_source_mode SET mode='TEMP_PRODUCTION_INBOUND' WHERE scope_level='SITE' AND scope_code=$1",[f.farm]);
    await seedSyntheticCutover('ACTIVE');
    const sourceCode=f.prefix+'-INSTALLMENT-SOURCE';
    await ds.query("INSERT INTO pkg_source_batches(batch_code,house_code,shift_id,production_date,received_qty,batch_status) VALUES($1,$2,$3,'2026-01-02',25,'RECEIVED')",
      [sourceCode,f.house,f.shiftId]);
    const req={...f.req,user:{...f.req.user,username:'p2-test',permissions:['MENU_PKG_OP:V','MENU_PROD_INBOUND:V']}};
    const queue=new PackagingWorkQueueService(new PackagingHistoryService(ds.manager,{resolve:async()=>f.scope} as any));
    const formal=await queue.list({bucket:'CURRENT',siteCode:f.farm,shiftId:f.shiftId},req);
    const installment=formal.items.find(x=>x.code===sourceCode);
    expect(installment).toMatchObject({action:'FORMAL_INSTALLMENTS',routeCode:'FORMAL_INSTALLMENTS'});
    const href=new URL(installment!.href!,'http://local.test');
    expect(href.pathname).toBe('/breeding/production-inbound');
    expect(Object.fromEntries(href.searchParams)).toEqual(expect.objectContaining({
      companyCode:f.company,siteCode:'SITE-MAPPED',houseCode:f.house,eggDate:'2026-01-02',queueAction:'FORMAL_INSTALLMENTS',
    }));

    // No explicit mode for an ACTIVE scope must not inherit the legacy TEMP route.
    const modeRows=await ds.query(`SELECT scope_level,scope_code,mode FROM inv_source_mode
      WHERE (scope_level='SITE' AND scope_code=$1) OR (scope_level='COMPANY' AND scope_code=$2)
        OR (scope_level='GROUP' AND scope_code='ALL')`,[f.farm,f.company]);
    try {
      await ds.query(`DELETE FROM inv_source_mode WHERE (scope_level='SITE' AND scope_code=$1)
        OR (scope_level='COMPANY' AND scope_code=$2) OR (scope_level='GROUP' AND scope_code='ALL')`,[f.farm,f.company]);
      const noMode=await queue.list({bucket:'REVIEW',siteCode:f.farm,shiftId:f.shiftId},req);
      expect(noMode.items.find(x=>x.code===sourceCode)).toMatchObject({action:'CUTOVER_REVIEW',href:null});
    } finally {
      for (const row of modeRows) await ds.query('INSERT INTO inv_source_mode(scope_level,scope_code,mode) VALUES($1,$2,$3) ON CONFLICT(scope_level,scope_code) DO UPDATE SET mode=EXCLUDED.mode',
        [row.scope_level,row.scope_code,row.mode]);
    }
    // A separate synthetic SUSPENDED house avoids mutating the frozen ACTIVE read fixture.
    const pausedHouse=`${f.prefix}-SUSPENDED-HOUSE`,pausedCode=f.prefix+'-SUSPENDED-SOURCE';
    await ds.query("INSERT INTO brd_houses(house_code,farm_code,status) VALUES($1,$2,'ACTIVE')",[pausedHouse,f.farm]);
    await seedSyntheticCutover('SUSPENDED','2025-01-01',pausedHouse);
    await ds.query("INSERT INTO pkg_source_batches(batch_code,house_code,shift_id,production_date,received_qty,batch_status) VALUES($1,$2,$3,'2026-01-02',25,'RECEIVED')",
      [pausedCode,pausedHouse,f.shiftId]);
    const paused=await queue.list({bucket:'REVIEW',siteCode:f.farm,shiftId:f.shiftId},req);
    expect(paused.items.find(x=>x.code===pausedCode)).toMatchObject({action:'CUTOVER_REVIEW',href:null});
  });

  it('places partial handover in REVIEW and hides it without warehouse scope', async () => {
    await ds.query("INSERT INTO pkg_handover_records(code,packing_code,box_count,location,production_date) VALUES($1,$1,1,$2,'2026-01-02')",
      [f.prefix,f.location]);
    const result=await queue.list({bucket:'REVIEW',siteCode:f.farm},f.req);
    expect(result.items).toEqual([expect.objectContaining({kind:'PACKING',code:f.prefix,action:'PARTIAL_HANDOVER',routeCode:'PARTIAL_HANDOVER'})]);
    const noWarehouse={...f.scope,allowedWarehouseCodes:[]};
    const hidden=await new PackagingWorkQueueService(new PackagingHistoryService(ds.manager,{resolve:async()=>noWarehouse} as any))
      .list({bucket:'REVIEW',siteCode:f.farm},f.req);
    expect(hidden.items).toEqual([]);
    expect(hidden.counts).toEqual({});
  });

  it('does not combine site access from one menu with receipt warehouse access from another', async () => {
    await ds.query("INSERT INTO pkg_handover_records(code,packing_code,box_count,location,production_date) VALUES($1,$1,1,$2,'2026-01-02')",
      [f.prefix,f.location]);
    const req={user:{...f.req.user,permissions:['MENU_PKG_OP:V','MENU_PKG_MGR:V']}};
    const operationScope={...f.scope,allowedWarehouseCodes:[]};
    const incompleteManagementScope={...f.scope,allowedFarmCodes:[]};
    const split = new PackagingHistoryService(ds.manager,{
      resolve:async(_uid:string,_roles:string[],menu:string)=>menu==='MENU_PKG_OP'?operationScope:incompleteManagementScope,
    } as never);
    const query={bucket:'REVIEW',siteCode:f.farm};
    await expect(new PackagingWorkQueueService(split).list(query,req)).resolves.toMatchObject({items:[],counts:{}});
    const full = new PackagingHistoryService(ds.manager,{
      resolve:async(_uid:string,_roles:string[],menu:string)=>menu==='MENU_PKG_OP'?operationScope:f.scope,
    } as never);
    const allowed=await new PackagingWorkQueueService(full).list(query,req);
    expect(allowed.counts).toMatchObject({PACKING:1});
    expect(allowed.items).toContainEqual(expect.objectContaining({code:f.prefix,action:'PARTIAL_HANDOVER'}));
  });

  it('separates two same-day shifts and never adds a voided original to carryover', async () => {
    await ds.query("UPDATE pkg_work_shifts SET status='OPEN' WHERE id=$1",[f.shiftId]);
    const [other]=await ds.query("INSERT INTO pkg_work_shifts(shift_code,production_date,site_id,status) VALUES($1,'2026-01-02',$2,'CLOSED') RETURNING id::text",
      [f.prefix+'-SECOND',f.farm]);
    const source=f.prefix+'-SECOND-SOURCE';
    await ds.query("INSERT INTO pkg_source_batches(batch_code,house_code,shift_id,production_date,received_qty,batch_status) VALUES($1,$2,$3,'2026-01-02',25,'RECEIVED')",
      [source,f.house,other.id]);
    const voided=f.prefix+'-VOID';
    await ds.query("INSERT INTO pkg_packing_records(code,shift_id,production_date,grading_codes_json,total_eggs,total_boxes,status) VALUES($1,$2,'2026-01-02',$3,25,1,'VOID')",
      [voided,other.id,JSON.stringify([f.prefix])]);
    const current=await queue.list({bucket:'CURRENT',siteCode:f.farm,shiftId:f.shiftId},f.req);
    const carryover=await queue.list({bucket:'CARRYOVER',siteCode:f.farm},f.req);
    expect(current.items.every(item=>item.shiftId===f.shiftId)).toBe(true);
    expect(carryover.items).toEqual([expect.objectContaining({code:source,kind:'SOURCE',quantity:25,shiftId:other.id,href:null})]);
  });
});
