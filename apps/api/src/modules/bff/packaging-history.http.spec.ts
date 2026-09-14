import {Test} from '@nestjs/testing';
import {TypeOrmModule} from '@nestjs/typeorm';
import {ConfigModule} from '@nestjs/config';
import {ThrottlerModule} from '@nestjs/throttler';
import {ClsModule} from 'nestjs-cls';
import {DataSource} from 'typeorm';
import {randomBytes,randomUUID} from 'crypto';
import * as bcrypt from 'bcrypt';
import {OrgModule} from '../org/org.module';
import {PackagingHistoryController} from './packaging-history.controller';
import {PackagingHistoryService} from './packaging-history.service';
import {PackagingHandoverService} from './packaging-handover.service';
import {PackagingBoxService} from './packaging-box.service';
import {PackagingWorkflowPolicy} from './packaging-workflow-policy';
import {PackagingInventoryIntegrationService} from '../sales-v2/services/packaging-inventory-integration.service';
import {packingHistoryFixture} from './packaging-history.fixture';
import {hydrateMenuRegistry} from '../../common/guards/menu-registry.service';
import {resolve} from 'path';

(process.env.PACKAGING_HISTORY_PG==='1'?describe:describe.skip)('real HTTP JWT/MenuGuard/DataScope PG18 ordinary accounts',()=>{
 let app:any,ds:DataSource,base:string,f:any,hidden:any;const accounts=new Map<string,{token:string;id:string}>();
 beforeAll(async()=>{
 process.env.JWT_SECRET=randomBytes(32).toString('hex');process.env.ENABLE_DEV_LOGIN='false';
 const {AuthModule}=await import('../../auth/auth.module');
 const module=await Test.createTestingModule({imports:[ConfigModule.forRoot({isGlobal:true,ignoreEnvFile:true}),ClsModule.forRoot({global:true,middleware:{mount:true}}),
 TypeOrmModule.forRoot({type:'postgres',host:'127.0.0.1',port:55432,username:'postgres',database:'packaging_history_test',entities:[resolve(__dirname,'../../**/*.entity.ts')],autoLoadEntities:true,synchronize:false,logging:false}),
 ThrottlerModule.forRoot([{name:'login',ttl:900000,limit:100}]),AuthModule,OrgModule],controllers:[PackagingHistoryController],
 providers:[PackagingHistoryService,PackagingHandoverService,PackagingBoxService,PackagingWorkflowPolicy,
 {provide:PackagingInventoryIntegrationService,useValue:{}}]}).compile();
 app=module.createNestApplication({logger:false});await app.init();ds=app.get(DataSource);await hydrateMenuRegistry(ds.manager);
 f=await packingHistoryFixture(ds);hidden=await packingHistoryFixture(ds);
 const [org]=await ds.query(`INSERT INTO sys_organizations(org_code,org_name,org_type,company_code) VALUES($1,$1,'COMPANY',$1) RETURNING id`,[f.company]);
 for(const [name,menu,perms,scope] of [['OP_V','MENU_PKG_OP','V',true],['OP_E','MENU_PKG_OP','V,E',true],['MGR_V','MENU_PKG_MGR','V',true],['MGR_E','MENU_PKG_MGR','E',true],['NO_SCOPE','MENU_PKG_OP','V',false]]){
  const username='TEST-'+name+'-'+randomUUID().slice(0,6),password=randomBytes(18).toString('hex');
  const [u]=await ds.query(`INSERT INTO sys_user(username,real_name,password_hash,status) VALUES($1,$1,$2,1) RETURNING user_id::text`,[username,await bcrypt.hash(password,4)]);
  const [role]=await ds.query(`INSERT INTO sys_role(role_code,role_name_zh,role_type) VALUES($1,$1,'BUSINESS') RETURNING role_id`,[username]);
  await ds.query('INSERT INTO sys_user_role(user_id,role_id,is_primary) VALUES($1,$2,true)',[u.user_id,role.role_id]);
  await ds.query(`INSERT INTO sys_role_menu_permission(role_id,menu_id,perm_codes) SELECT $1,menu_id,$2 FROM sys_menu WHERE menu_code=$3`,[role.role_id,perms,menu]);
  if(scope){await ds.query('INSERT INTO sys_user_orgs(user_id,org_id) VALUES($1,$2)',[u.user_id,org.id]);await ds.query('INSERT INTO sys_user_farm_scopes(user_id,farm_code) VALUES($1,$2)',[u.user_id,f.farm]);}
  if(!base){await app.listen(0,'127.0.0.1');base=await app.getUrl();}
  const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
  const result:any=await response.json();if(!result.token)throw Error('ISOLATED_LOGIN_FAILED:'+response.status+':'+String(result.msg||result.message));
  accounts.set(String(name),{token:result.token,id:u.user_id});
 }
 },60000);
 afterAll(async()=>{await app?.close();delete process.env.JWT_SECRET;});
 async function get(path:string,account='OP_V'){const response=await fetch(base+'/api/packaging/terminal/'+path,{headers:accounts.has(account)?{Authorization:'Bearer '+accounts.get(account)!.token}:{}});return {status:response.status,body:await response.json() as any};}
 it('rejects unauthenticated HTTP',async()=>{expect((await get('history','NONE')).status).toBe(401);});
 it.each(['OP_V','OP_E','MGR_V'])('%s sees only its original and exact count',async account=>{const r=await get('history',account);expect(r.status).toBe(200);expect(r.body.data.totalMatching).toBe(1);expect(r.body.data.items[0].record.code).toBe(f.prefix);expect((await get('history/'+hidden.prefix,account)).status).toBe(404);});
 it('MGR:E alone has no read permission; empty scope does not become global',async()=>{expect((await get('history','MGR_E')).status).toBe(403);const r=await get('history','NO_SCOPE');expect(r.status).toBe(200);expect(r.body.data.totalMatching).toBe(0);});
 it('absent and inaccessible originals return identical nonleaking bodies',async()=>{const a=await get('history/'+hidden.prefix),b=await get('history/TEST-NOT-EXIST');expect(a.status).toBe(404);expect(a.body).toEqual(b.body);});
 it('V cannot bypass UI to register and E remains blocked by production-default flags',async()=>{for(const account of ['OP_V','OP_E']){const response=await fetch(base+'/api/packaging/terminal/history/'+f.prefix+'/box-registration',{method:'POST',headers:{Authorization:'Bearer '+accounts.get(account)!.token,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({})});expect(response.status).toBe(account==='OP_V'?403:409);}});
 it('candidate warehouses follow the original company',async()=>{const r=await get('history/'+f.prefix+'/candidates?kind=WAREHOUSE');expect(r.status).toBe(200);expect(r.body.data.map((x:any)=>x.code)).toEqual([f.warehouse]);});
 it('all detail sections and operations reject other-company original URLs',async()=>{
   for(const suffix of ['','/outputs','/sources','/boxes','/evidence','/candidates?kind=WAREHOUSE'])expect((await get('history/'+hidden.prefix+suffix)).status).toBe(404);
   expect((await get(`operations/${randomUUID()}?action=CONFIRM&packingCode=${hidden.prefix}`)).status).toBe(404);
 });
 it('foreign warehouse candidates never leak locations or receivers',async()=>{
   for(const kind of ['LOCATION','RECEIVER']){const r=await get(`history/${f.prefix}/candidates?kind=${kind}&warehouseCode=${hidden.warehouse}`);expect(r.status).toBe(200);expect(r.body.data).toEqual([]);}
 });
 it('source company drift hides the entire original and its count without partial rows',async()=>{
   await ds.query('UPDATE brd_houses SET farm_code=$2 WHERE house_code=$1',[f.house,hidden.farm]);
   try{expect((await get('history/'+f.prefix)).status).toBe(404);expect((await get('history')).body.data.totalMatching).toBe(0);}finally{await ds.query('UPDATE brd_houses SET farm_code=$2 WHERE house_code=$1',[f.house,f.farm]);}
 });
 it('unknown and foreign label lookups have identical nonleaking failures',async()=>{
   const a=await get(`boxes/resolve?packingCode=${f.prefix}&labelCode=TEST-UNKNOWN`),b=await get(`boxes/resolve?packingCode=${f.prefix}&labelCode=${hidden.prefix}`);expect(a.status).toBe(409);expect(a.body).toEqual(b.body);
 });
 it('real HTTP malformed dates and cursor get 400, not 500',async()=>{
   for(const q of ['dateFrom=2026-02-30','cursor=garbage','shiftStatus=bogus','packingCode=%20'])expect((await get('history?'+q)).status).toBe(400);
 });
 it('permission version revocation invalidates existing authentication',async()=>{await ds.query('UPDATE sys_user SET perms_version=perms_version+1 WHERE user_id=$1',[accounts.get('OP_V')!.id]);expect((await get('history')).status).toBe(401);});
});
