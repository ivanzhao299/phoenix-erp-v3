import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request = require('supertest');
import { DataSource } from 'typeorm';
import { EggSourceChanges1795564800000 } from '../../../database/migrations/1795564800000-EggSourceChanges';
import { OfficialRawCollectionReceipts1795005390930 } from '../../../database/migrations/1795005390930-OfficialRawCollectionReceipts';
import { MenuGuard } from '../../../common/guards/menu.guard';
import { DataScopeService } from '../../org/services/data-scope.service';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { installProductionInboundFixture } from '../../sales-v2/services/production-inbound.pg-fixture';
import { EggSourceChangeController } from '../controllers/egg-source-change.controller';
import { EggHistoryReviewService } from './egg-history-review.service';
import { EggSourceChangeService, type ChangeScope } from './egg-source-change.service';
import { SkuAvailabilityService } from './sku-availability.service';

const connection=process.env.OFFICIAL_INVENTORY_PG_URL;
const suite=connection ? describe : describe.skip;
const site='SITE-MENGSAI-LAYER';
const scope:ChangeScope={isGlobal:false,companyCodes:['COMP-A'],farmCodes:[],siteCodes:[],farmCode:null,siteCode:null,allowedWarehouses:['WH-SHARED']};
const globalScope:ChangeScope={...scope,isGlobal:true};

suite('egg source change workspace on PostgreSQL',()=>{
  const schema='egg_ux_'+randomUUID().replaceAll('-','');
  const base='/api/product-master/egg-sources';
  let db:DataSource;
  let app:INestApplication;
  let changes:EggSourceChangeService;
  let future:string;
  const input=()=>({ houseCode:'HOUSE-A2',targetClass:'RED',effectiveDate:future,reason:'Future profile',
    warehouseCode:'WH-SHARED',requirements:[{gradeCode:'GRADE_1',specCode:'LOOSE'}] });

  beforeAll(async()=>{
    const url=new URL(connection!);
    if (!['127.0.0.1','localhost'].includes(url.hostname) || !/fixture/.test(url.pathname)) {
      throw new Error('An isolated loopback fixture database is required');
    }
    db=new DataSource({type:'postgres',url:connection,extra:{options:`-c search_path=${schema},public`}});
    await db.initialize();
    await db.query(`CREATE SCHEMA "${schema}"`);
    await installProductionInboundFixture(db,['GRADE_1','GRADE_2','GRADE_3','GRADE_4']);
    const runner=db.createQueryRunner();
    try {
      await new OfficialRawCollectionReceipts1795005390930().up(runner);
      await new EggSourceChanges1795564800000().up(runner);
    } finally { await runner.release(); }
    await db.query(`ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS house_name text, ADD COLUMN IF NOT EXISTS house_type text;
      ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS farm_name text;
      ALTER TABLE sys_organizations ADD COLUMN IF NOT EXISTS org_name text;
      CREATE TABLE sys_user(user_id bigint PRIMARY KEY,real_name text);
      ALTER TABLE wms_warehouses ADD COLUMN IF NOT EXISTS warehouse_name text, ADD COLUMN IF NOT EXISTS warehouse_name_zh text,
        ADD COLUMN IF NOT EXISTS warehouse_name_en text, ADD COLUMN IF NOT EXISTS warehouse_name_lo text;
      ALTER TABLE product_grades ADD COLUMN IF NOT EXISTS stock_managed boolean,ADD COLUMN IF NOT EXISTS grade_name text,
        ADD COLUMN IF NOT EXISTS grade_name_lo text;
      ALTER TABLE packaging_specs ADD COLUMN IF NOT EXISTS spec_name text,ADD COLUMN IF NOT EXISTS spec_name_lo text,
        ADD COLUMN IF NOT EXISTS sort_order int;
      ALTER TABLE pkg_source_batches ADD COLUMN IF NOT EXISTS batch_status text;
      UPDATE brd_farms SET farm_name=farm_code,mapped_site_code='${site}' WHERE farm_code='FARM-A';
      UPDATE brd_houses SET house_name=house_code,house_type='LAYER';
      UPDATE md_egg_source_profiles SET site_code='${site}' WHERE company_code='COMP-A';
      UPDATE wms_warehouses SET warehouse_name=warehouse_code;
      UPDATE wms_warehouses SET site_code='${site}' WHERE warehouse_code='WH-A2';
      INSERT INTO wms_warehouses(warehouse_code,company_code,site_code,status,domain,warehouse_name)
      VALUES ('WH-SHARED','COMP-A',NULL,'ACTIVE','OPERATIONAL','Shared'),
        ('WH-INACTIVE','COMP-A',NULL,'INACTIVE','OPERATIONAL','Inactive');
      UPDATE product_grades SET grade_name=grade_code;
      UPDATE packaging_specs SET spec_name=spec_code;
      DELETE FROM md_sku_org_scope WHERE scope_code='COMP-A' AND sku_code='SKU-GRADE_2';
      INSERT INTO md_sku_org_scope(sku_code,scope_type,scope_code)
        VALUES ('SKU-GRADE_2','FARM','FARM-A');
      INSERT INTO md_sku_org_scope(sku_code,scope_type,scope_code,stock_enabled)
        VALUES ('SKU-GRADE_4','SITE','${site}',false);
      UPDATE md_sku_org_scope SET effective_date=current_date+15 WHERE sku_code='SKU-GRADE_3' AND scope_code='COMP-A';
    `);
    [{future}]=await db.query("SELECT ((now() AT TIME ZONE 'Asia/Vientiane')::date+2)::text AS future");
    changes=new EggSourceChangeService(db,new SkuAvailabilityService(db));
    const module=await Test.createTestingModule({ controllers:[EggSourceChangeController],
      providers:[{provide:EggSourceChangeService,useValue:changes},{provide:EggHistoryReviewService,useValue:{}},
        {provide:DataScopeService,useValue:{resolve:async (actor:string)=>({isGlobal:false,
          allowedFarmCodes:[actor==='source-authorized'?'FARM-SOURCE':'FARM-A']})}}] })
      .overrideGuard(MenuGuard).useValue({canActivate: (context:ExecutionContext)=>{
        const req=context.switchToHttp().getRequest();
        req.user={userId:req.headers['x-test-user']||'author',permissions:['MENU_MD_PRODUCT:V,E,A','MENU_FARM_DATA:V']};
        return true;
      }})
      .overrideGuard(DataScopeGuard).useValue({canActivate: (context:ExecutionContext)=>{
        context.switchToHttp().getRequest().dataScope={isGlobal:false,allowedCompanyCodes:['COMP-A'],allowedWarehouseCodes:['WH-SHARED']};
        return true;
      }}).compile();
    app=module.createNestApplication();
    await app.init();
  },60000);

  afterAll(async()=>{
    if (app) await app.close();
    if (db?.isInitialized) {
      await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await db.destroy();
    }
  });

  it('returns a shared operational warehouse only within the caller scope and verifies real grade/spec options',async()=>{
    const http=request(app.getHttpServer());
    const warehouses=await http.get(base+'/candidates/warehouses').query({houseCode:'HOUSE-A2'}).expect(200);
    expect(warehouses.body.data.map((row:{code:string})=>row.code)).toEqual(['WH-SHARED']);
    const options=await http.get(base+'/candidates/options').expect(200);
    expect(options.body.data.grades).toContainEqual(expect.objectContaining({code:'GRADE_1'}));
    expect(options.body.data.specs).toContainEqual(expect.objectContaining({code:'LOOSE'}));
    const candidates=await changes.candidateWarehouses('HOUSE-A2',globalScope);
    expect(candidates.map((row:{code:string})=>row.code)).toEqual(['WH-SHARED','WH-A2']);
  });

  it('reports passed, missing company, future authorization and site inventory veto in one HTTP 200',async()=>{
    const http=request(app.getHttpServer());
    const payload={ ...input(),requirements:[1,2,3,4].map(n=>({gradeCode:'GRADE_'+n,specCode:'LOOSE'})) };
    const result=await http.post(base+'/precheck').send(payload).expect(200);
    expect(result.body.data).toMatchObject({ status:'BLOCKED',houseCode:'HOUSE-A2',warehouseCode:'WH-SHARED',targetClass:'RED',
      rows:[
        {status:'PASSED',skuCode:'SKU-GRADE_1',issues:[]},
        {status:'BLOCKED',issues:[{layer:'COMPANY',code:'AUTH_MISSING'}]},
        {status:'BLOCKED',issues:[{layer:'COMPANY',code:'AUTH_NOT_YET_EFFECTIVE'}]},
        {status:'BLOCKED',issues:[{layer:'SITE',code:'STOCK_DISABLED'}]},
      ] });
    await http.post(base+'/precheck').send({...payload,warehouseCode:'WH-B'}).expect(403);
    await http.post(base+'/precheck').send({...payload,planDocument:false}).expect(400);
    const blocked=await http.post(base+'/precheck').send({...payload,effectiveDate:'2026-01-01'}).expect(200);
    expect(blocked.body.data.rows.every((row:{status:string})=>row.status==='NOT_CHECKED')).toBe(true);
    await http.post(base+'/preview').send(input()).expect(201);
  });

  it('finds older authorized requests behind denied rows and preserves sub-millisecond keyset positions',async()=>{
    await db.query(`INSERT INTO md_egg_source_changes(id,request_key,company_code,farm_code,site_code,house_code,effective_date,
      target_class,state,created_by,last_editor,payload,created_at)
      SELECT gen_random_uuid(),gen_random_uuid(),'COMP-A','FARM-A',$1,'HOUSE-A2',$2,'RED',
        CASE WHEN n=1 THEN 'SUBMITTED' ELSE 'CANCELLED' END,'author','author',
        jsonb_build_object('warehouseCode',CASE WHEN n>30 THEN 'WH-A' ELSE 'WH-SHARED' END,'reason','list','requirements','[]'::jsonb),
        '2026-01-01T01:00:00Z'::timestamptz+n*interval '1 microsecond'
      FROM generate_series(1,140) n`,[site,future]);
    const http=request(app.getHttpServer());
    const first=await http.get(base+'/changes').query({houseCode:'HOUSE-A2'}).expect(200);
    expect(first.body.data.items).toHaveLength(25);
    const second=await http.get(base+'/changes').query({houseCode:'HOUSE-A2',cursor:first.body.data.nextCursor}).expect(200);
    expect(second.body.data.items).toHaveLength(5);
    const all=[...first.body.data.items,...second.body.data.items];
    expect(new Set(all.map(row=>row.id)).size).toBe(30);
    expect(all.every(row=>row.warehouseCode==='WH-SHARED')).toBe(true);
    await http.get(base+'/changes').query({houseCode:'HOUSE-A2',state:'SUBMITTED',cursor:first.body.data.nextCursor}).expect(400);
    const workspace=await http.get(base+'/workspace').query({houseCode:'HOUSE-A2'}).expect(200);
    expect(workspace.body.data.pending.submitted).toBe(1);
    const denied=await db.query("SELECT id FROM md_egg_source_changes WHERE payload->>'warehouseCode'='WH-A' LIMIT 1");
    await http.get(base+'/changes/'+denied[0].id).expect(404);
  });

  it('applies originating chicken-house permission to both current and compatibility reads',async()=>{
    const plan=randomUUID();
    await db.query(`INSERT INTO brd_farms(farm_code,company_code,mapped_site_code,status) VALUES ('FARM-SOURCE','COMP-A','SITE-DONGPENG-LAYER','ACTIVE');
      INSERT INTO brd_houses(house_code,farm_code,status,house_type) VALUES ('HOUSE-SOURCE','FARM-SOURCE','ACTIVE','LAYER')`);
    await db.query(`INSERT INTO brd_flock_documents(id,source_key,content_hash,kind,company_code,farm_code,site_code,house_code,
      flock_no,business_date,payload,status,version,created_by)
      VALUES ($1,$1,'fixture','TRANSFER','COMP-A','FARM-SOURCE','SITE-DONGPENG-LAYER','HOUSE-SOURCE',
        'FLOCK-SOURCE',$2,'{"targetHouseCode":"HOUSE-A2"}','DRAFT',1,'fixture')`,[plan,future]);
    const http=request(app.getHttpServer());
    const created=await http.post(base+'/changes').send({...input(),planDocument:plan,actionKey:randomUUID()}).expect(201);
    const id=created.body.data.id;
    expect(created.body.data.payload.planDocument).toBeNull();
    const url=base+'/changes/'+id;
    const preview=await http.post(base+'/preview').send({...input(),planDocument:plan}).expect(201);
    expect(preview.body.data.verified.planned).toBeNull();
    const submitted=await http.post(url+'/actions/submit').send({actionKey:randomUUID(),version:1}).expect(201);
    expect(submitted.body.data.change.approval.snapshot.planned).toBeNull();
    await db.query("UPDATE brd_flock_documents SET status='SUBMITTED',version=2 WHERE id=$1",[plan]);
    const restricted=await http.get(url).expect(200);
    expect(restricted.body.data).toMatchObject({linkedPlan:true,plan:null});
    expect(JSON.stringify(restricted.body)).not.toContain(plan);
    const authorized=await http.get(url).set('x-test-user','source-authorized').expect(200);
    expect(authorized.body.data.plan).toMatchObject({id:plan,version:2,frozenVersion:1});
    const legacy=await http.get(base).query({houseCode:'HOUSE-A2'}).expect(200);
    expect(JSON.stringify(legacy.body)).not.toContain(plan);
  });

  it('prechecks a stored draft, confirms independent approval and returns the original action receipt after later transitions',async()=>{
    const http=request(app.getHttpServer());
    const key=randomUUID();
    const draft=await http.post(base+'/changes').send({...input(),actionKey:key}).expect(201);
    const id=draft.body.data.id;
    const url=base+'/changes/'+id;
    await http.get(base+'/change-requests/'+key).query({houseCode:'HOUSE-A2'}).expect(200);
    await http.get(base+'/change-requests/'+key).set('x-test-user','reviewer').query({houseCode:'HOUSE-A2'}).expect(404);
    await http.post(url+'/precheck').set('x-test-user','reviewer').expect(404);
    const checked=await http.post(url+'/precheck').send({targetClass:'PINK'}).expect(200);
    expect(checked.body.data.targetClass).toBe('RED');
    const submitted=await http.post(url+'/actions/submit').send({actionKey:randomUUID(),version:1}).expect(201);
    const digest=submitted.body.data.change.approval.planDigest;
    const reviewed={actionKey:randomUUID(),version:2,planDigest:digest};
    await http.post(url+'/reviews/approve').send(reviewed).expect(403);
    await http.post(url+'/reviews/approve').set('x-test-user','reviewer').send(reviewed).expect(201);
    await http.post(url+'/reviews/approve').set('x-test-user','reviewer').send(reviewed).expect(201);
    await http.post(url+'/actions/request-revoke').send({actionKey:randomUUID(),version:3,reason:'Changed plan'}).expect(201);
    const detail=await http.get(url).set('x-test-user','reviewer').expect(200);
    expect(detail.body.data.state).toBe('REVOKE_REQUESTED');
    expect(detail.body.data.originalApproval.previousProfileCode).toBe('PROFILE-A2');
    expect(detail.body.data.events.map((row:{version:number})=>row.version)).toEqual([2,3,4]);
    expect(detail.body.data).not.toHaveProperty('request_key');
    const receipt=await http.get(url+'/action-requests/'+reviewed.actionKey).set('x-test-user','reviewer').expect(200);
    expect(receipt.body.data).toMatchObject({id,state:'APPROVED',version:3,action:'approve'});
    await http.get(url+'/action-requests/'+reviewed.actionKey).expect(404);
  });
});
