import 'reflect-metadata';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { DataSource,EntityManager,QueryRunner } from 'typeorm';
import { ProductionCutoverExecutionAdmissions1795029621917 } from '../../database/migrations/1795029621917-ProductionCutoverExecutionAdmissions';
import { ProductionCutoverEvidenceBarriers1795025712607 } from '../../database/migrations/1795025712607-ProductionCutoverEvidenceBarriers';
import { installProductionConversionFixture } from '../sales-v2/services/production-conversion.pg-fixture';
import { installEmptyCutoverClosureFixture } from '../sales-v2/services/production-cutover-closure.pg-fixture';
import { CutoverCountLine,ProductionCutoverService } from './production-cutover.service';
import { DataScopeService } from '../org/services/data-scope.service';
import { singaporeBusinessDate } from './temp-production-reversal';
import { WmsService } from './wms.service';

const url=process.env.OFFICIAL_INVENTORY_PG_URL;
(url?describe:describe.skip)('trusted cutover admission — isolated roles and actual PostgreSQL 18 connections',()=>{
  let db:DataSource,apiDb:DataSource,issuerDb:DataSource,executorDb:DataSource;const connections:DataSource[]=[],createdRoles:string[]=[];
  const schema=`cutover_admission_${process.pid}`,prefix=`cutover_${process.pid}_`;
  const roles={owner:prefix+'owner',api:prefix+'api',issuer:prefix+'issuer',executor:prefix+'executor'};
  const migration=new ProductionCutoverExecutionAdmissions1795029621917();
  const identifier=(name:string)=>{if(!/^[a-z_][a-z_0-9]*$/.test(name))throw Error('Owned role/schema identifier required');return '"'+name+'"';};
  const run=async(action:'up'|'down')=>{const q=db.createQueryRunner();await q.connect();try{await migration[action](q);}finally{await q.release();}};
  beforeAll(async()=>{
    const parsed=new URL(url!);if(parsed.hostname!=='127.0.0.1'||parsed.port!=='44889'
      ||!['/phoenix_temp_reversal_fixture','/installments_fixture'].includes(parsed.pathname))throw Error('Owned loopback fixture required');
    const label=execFileSync('docker',['inspect','--format','{{index .Config.Labels "phoenix.fixture"}}','phoenix-temp-reversal-20261118'],{encoding:'utf8'}).trim();
    if(label!=='temp-reversal')throw Error('Owned disposable PostgreSQL container required before creating test roles');
    db=await new DataSource({type:'postgres',url,entities:[],synchronize:false,migrationsRun:false,installExtensions:false,
      extra:{options:`-c search_path=${schema}`,max:8}}).initialize();
    if(!(await db.query('SHOW server_version'))[0].server_version.startsWith('18.'))throw Error('PostgreSQL 18 required');
    await db.query(`CREATE SCHEMA ${identifier(schema)}`);await installProductionConversionFixture(db);
    // Existing native WMS/return contracts stay intact; only missing empty downstream tables are supplied.
    await installEmptyCutoverClosureFixture({query:(sql:string)=>db.query(sql.replace(/CREATE TABLE /g,'CREATE TABLE IF NOT EXISTS '))} as DataSource);
    await db.query(`INSERT INTO sys_dict(dict_type,dict_code,dict_value,status) VALUES('INV_STOCK_STATUS','QUARANTINE','QUARANTINE','ACTIVE') ON CONFLICT DO NOTHING`);
    await db.query("ALTER TABLE mst_products ADD COLUMN IF NOT EXISTS category_code text;UPDATE mst_products SET category_code='EGG'");
    // Match the frozen baseline: ledger.batch_no has no FK; the namespace guard must close that real race itself.
    for(const row of await db.query("SELECT conname FROM pg_constraint WHERE conrelid='inv_ledger'::regclass AND confrelid='inv_batches'::regclass AND contype='f'"))
      await db.query(`ALTER TABLE inv_ledger DROP CONSTRAINT ${identifier(row.conname)}`);
    const q=db.createQueryRunner();await q.connect();try{await new ProductionCutoverEvidenceBarriers1795025712607().up(q);await migration.up(q);}finally{await q.release();}
  });
  afterAll(async()=>{
    for(const connection of connections)if(connection.isInitialized)await connection.destroy();
    if(db?.isInitialized){
      await db.query(`DROP SCHEMA ${identifier(schema)} CASCADE`);
      for(const role of createdRoles.reverse()){
        await db.query(`DROP OWNED BY ${identifier(role)}`);await db.query(`DROP ROLE ${identifier(role)}`);
      }
      await db.destroy();
    }
  });
  it('installs default-deny without roles, bindings, admissions, openings or activation and reverses empty state',async()=>{
    for(const table of ['production_cutover_control_environments','production_cutover_apply_admissions','production_cutover_apply_results','production_cutover_scopes','production_opening_receipts'])
      expect((await db.query(`SELECT count(*)::int AS n FROM ${table}`))[0].n).toBe(0);
    expect((await db.query(`SELECT count(*)::int AS n FROM pg_proc f CROSS JOIN LATERAL aclexplode(COALESCE(f.proacl,acldefault('f',f.proowner))) permission
      WHERE f.pronamespace=current_schema()::regnamespace AND f.proname IN('consume_production_cutover_admission','record_production_cutover_apply_result')
        AND permission.grantee=0 AND permission.privilege_type='EXECUTE'`))[0].n).toBe(0);
    await run('down');await run('up');
  });
  it('rejects a direct non-DRAFT scope insert and a first FENCE without an actual consumed admission',async()=>{
    const id=randomUUID(),values=[id,'COMP-A','HOUSE-A','WH-A','FLOCK-A','PROFILE-A'];
    const insert=`INSERT INTO production_cutover_scopes(id,company_code,house_code,version,first_production_date,state,warehouse_code,flock_id,source_profile_code,manifest_sha256,evidence,confirmed_by)
      VALUES($1,$2,$3,1,'2026-11-20',$7,$4,$5,$6,repeat('b',64),'{}','fixture')`;
    await expect(db.query(insert,[...values,'SUSPENDED'])).rejects.toThrow('CUTOVER_SCOPE_INITIAL_DRAFT_REQUIRED');
    await db.query(insert,[...values,'DRAFT']);
    await expect(db.query("UPDATE production_cutover_scopes SET state='FENCED' WHERE id=$1",[id])).rejects.toThrow('CUTOVER_ADMISSION_CONTEXT_REQUIRED');
    expect((await db.query('SELECT state FROM production_cutover_scopes WHERE id=$1',[id]))[0].state).toBe('DRAFT');
    await db.query('DELETE FROM production_cutover_scopes WHERE id=$1',[id]);
  });
  async function connect(role:string){
    const parsed=new URL(url!);parsed.username=role;parsed.password='';
    const connection=await new DataSource({type:'postgres',url:parsed.toString(),entities:[],synchronize:false,migrationsRun:false,installExtensions:false,
      extra:{options:`-c search_path=${schema}`,max:3}}).initialize();connections.push(connection);return connection;
  }
  async function bootstrap(){
    for(const [kind,role] of Object.entries(roles)){
      await db.query(`CREATE ROLE ${identifier(role)} ${kind==='owner'?'NOLOGIN':'LOGIN'} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);createdRoles.push(role);
    }
    await db.query(`GRANT USAGE,CREATE ON SCHEMA ${identifier(schema)} TO ${identifier(roles.owner)};
      GRANT USAGE ON SCHEMA ${identifier(schema)} TO ${identifier(roles.api)},${identifier(roles.issuer)},${identifier(roles.executor)};
      GRANT SELECT ON ALL TABLES IN SCHEMA ${identifier(schema)} TO ${identifier(roles.owner)};
      GRANT UPDATE(state) ON production_cutover_manifests TO ${identifier(roles.owner)};
      GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO ${identifier(roles.owner)};
      GRANT pg_read_all_stats TO ${identifier(roles.owner)};
      GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${identifier(schema)} TO ${identifier(roles.api)};
      GRANT SELECT ON ALL TABLES IN SCHEMA ${identifier(schema)} TO ${identifier(roles.executor)};
      GRANT USAGE ON ALL SEQUENCES IN SCHEMA ${identifier(schema)} TO ${identifier(roles.api)},${identifier(roles.executor)};`);
    const inserts=(migration as unknown as{executorInserts:string[]}).executorInserts;
    const updates=(migration as unknown as{executorUpdates:string[]}).executorUpdates;
    for(const table of inserts)await db.query(`GRANT INSERT ON ${table} TO ${identifier(roles.executor)}`);
    for(const table of updates)await db.query(`GRANT UPDATE ON ${table} TO ${identifier(roles.executor)}`);
    for(const table of ['production_cutover_control_environments','production_cutover_apply_admissions','production_cutover_apply_results']){
      await db.query(`ALTER TABLE ${table} OWNER TO ${identifier(roles.owner)};
        REVOKE ALL ON ${table} FROM ${identifier(roles.api)},${identifier(roles.executor)};
        GRANT SELECT ON ${table} TO ${identifier(roles.issuer)},${identifier(roles.executor)}`);
    }
    const names=['assert_cutover_control_environment','guard_cutover_control_environment','guard_cutover_apply_admission','consume_production_cutover_admission',
      'current_production_cutover_admission','guard_cutover_runtime_admission','guard_cutover_apply_result','record_production_cutover_apply_result','check_cutover_apply_completion','guard_cutover_result_seal','guard_trusted_opening_namespace','guard_cutover_counted_history','guard_cutover_executor_write'];
    for(const row of await db.query('SELECT oid::regprocedure::text AS signature FROM pg_proc WHERE pronamespace=current_schema()::regnamespace AND proname=ANY($1::text[])',[names]))
      await db.query(`ALTER FUNCTION ${row.signature} OWNER TO ${identifier(roles.owner)}`);
    await db.query(`GRANT INSERT ON production_cutover_apply_admissions TO ${identifier(roles.issuer)};
      GRANT EXECUTE ON FUNCTION consume_production_cutover_admission(uuid,text),record_production_cutover_apply_result(uuid) TO ${identifier(roles.executor)}`);
    const roleOids=new Map((await db.query('SELECT rolname,oid FROM pg_roles WHERE rolname=ANY($1::text[])',[Object.values(roles)])).map((r:{rolname:string;oid:number})=>[r.rolname,r.oid]));
    const register=`INSERT INTO production_cutover_control_environments(environment_id,generation,control_owner,control_owner_oid,issuer_role,issuer_role_oid,executor_role,executor_role_oid,
      api_roles,api_role_oids,database_name,database_oid,schema_oid,cluster_identifier,deployment_evidence_sha256)
      VALUES('OWNED-CUTOVER',1,$1,$2,$3,$4,$5,$6,$7::name[],$8::oid[],current_database(),(SELECT oid FROM pg_database WHERE datname=current_database()),current_schema()::regnamespace,
        (SELECT system_identifier::text FROM pg_control_system()),repeat('f',64))`;
    const values=[roles.owner,roleOids.get(roles.owner),roles.issuer,roleOids.get(roles.issuer),roles.executor,roleOids.get(roles.executor),[roles.api],[roleOids.get(roles.api)]];
    const writer=db.createQueryRunner(),challenger=db.createQueryRunner();await writer.connect();await challenger.connect();
    try{
      await writer.startTransaction('READ COMMITTED');await writer.query(register,values);
      await expect(challenger.query(register.replace("'OWNED-CUTOVER'","'OWNED-OTHER-ENVIRONMENT'"),values)).rejects.toThrow('CUTOVER_CONTROL_CONFIGURATION_BUSY');
      await writer.commitTransaction();
    }finally{if(writer.isTransactionActive)await writer.rollbackTransaction();await writer.release();await challenger.release();}
  }
  it('accepts only an independently registered NOLOGIN control owner and closes registry/issuer/consumer privileges',async()=>{
    await bootstrap();apiDb=await connect(roles.api);issuerDb=await connect(roles.issuer);executorDb=await connect(roles.executor);
    expect((await executorDb.query('SELECT session_user AS actor'))[0].actor).toBe(roles.executor);
    for(const connection of [apiDb,executorDb])await expect(connection.query('INSERT INTO production_cutover_apply_admissions(id) VALUES($1)',[randomUUID()])).rejects.toThrow('permission denied');
    await expect(issuerDb.query('SELECT consume_production_cutover_admission($1,$2)',[randomUUID(),'a'.repeat(64)])).rejects.toThrow('permission denied');
    for(const connection of [apiDb,issuerDb,executorDb])await expect(connection.query('TRUNCATE production_cutover_apply_admissions')).rejects.toThrow('permission denied');
    await expect(run('down')).rejects.toThrow('CUTOVER_EXECUTION_ADMISSION_DOWN_HOLD');
  });
  let actor={userId:3,username:'receiver',permissions:['MENU_PROD_INBOUND:V,C,E,A','MENU_FIN2_AR_LEDGER:E']};
  const scope={isGlobal:true},cls={get:(key:string)=>key==='dataScope'?scope:actor};
  async function approvedCount(house='HOUSE-A',options:{company?:string;warehouse?:string;openingLines?:CutoverCountLine[];carry?:boolean}={}){
    const company=options.company??'COMP-A',warehouse=options.warehouse??'WH-A',lines=options.openingLines??[];
    const proof={count:'ADMIT-COUNT-'+warehouse,business:'ADMIT-BUSINESS-'+warehouse,finance:'ADMIT-FINANCE-'+warehouse};
    for(const [file,name] of [[proof.count,'receiver'],[proof.business,'maker'],[proof.finance,'reviewer']])await apiDb.query(`
      INSERT INTO file_metadata(file_id,status,visibility,mime_type,module_code,owner_type,owner_id,company_code,uploaded_by,checksum)
      VALUES($1,'ACTIVE','PROTECTED','application/pdf','PRODUCTION_CUTOVER','WAREHOUSE',$3,$4,$2,repeat('b',64)) ON CONFLICT DO NOTHING`,[file,name,warehouse,company]);
    actor={...actor,userId:3,username:'receiver'};
    const cutovers=new ProductionCutoverService(apiDb,cls as never,undefined,{resolve:async()=>scope} as unknown as DataScopeService);
    const tomorrow=new Date(singaporeBusinessDate()+'T00:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
    const boundary={companyCode:company,warehouseCode:warehouse,productCodes:['PRD-EGG-RAW'],houses:[{houseCode:house,firstProductionDate:tomorrow.toISOString().slice(0,10)}]};
    const inspected=await cutovers.inspect(boundary);expect(inspected.snapshot.missingTables).toEqual([]);expect(inspected.snapshot.warnings).toEqual([]);
    const draft=await cutovers.create({boundary,intentKey:randomUUID(),postingDate:singaporeBusinessDate(),evidenceFileIds:[proof.count],
      physicalTotals:[{productCode:'PRD-EGG-RAW',quantity:lines.reduce((sum,line)=>sum+line.quantity,0)+(options.carry?inspected.snapshot.batches.filter(batch=>batch.warehouse_code===warehouse).reduce((sum,batch)=>sum+Number(batch.qty),0):0)}],openingLines:lines,rawCounts:[],decisions:inspected.snapshot.batches.map(batch=>({
        batchNo:String(batch.batch_no),disposition:options.carry?'CARRY_FORWARD' as const:'ARCHIVED_TEST' as const,evidenceFileId:proof.count,reason:options.carry?'Owned actual qualified purchase/opening stock':'Owned synthetic historical test row, no real counted stock'})),referenceDecisions:[]});
    const frozen=await cutovers.freeze(draft.id,0);
    actor={...actor,userId:1,username:'maker'};await cutovers.sign(draft.id,{role:'BUSINESS',contentHash:frozen.content_hash,snapshotSha256:frozen.snapshot_sha256,evidenceFileId:proof.business,reason:'Owned synthetic physical count'});
    actor={...actor,userId:2,username:'reviewer'};await cutovers.sign(draft.id,{role:'FINANCE',contentHash:frozen.content_hash,snapshotSha256:frozen.snapshot_sha256,evidenceFileId:proof.finance,reason:'Owned synthetic independent finance count'});
    actor={...actor,userId:1,username:'maker'};return {document:await cutovers.get(draft.id),cutovers};
  }
  async function holdExecutor(){
    const q=executorDb.createQueryRunner();await q.connect();
    await q.query('SELECT pg_advisory_lock(17455,1)');await q.query('SELECT pg_advisory_lock(17455,2)');return q;
  }
  async function releaseExecutor(q:QueryRunner){
    if(q.isTransactionActive)await q.rollbackTransaction();
    await q.query('SELECT pg_advisory_unlock(17455,2)');await q.query('SELECT pg_advisory_unlock(17455,1)');await q.release();
  }
  async function issue(q:QueryRunner,document:Record<string,any>,mode='INIT'){
    const [backend]=await q.query(`SELECT pg_backend_pid() AS pid,backend_start::text AS backend_start,pg_postmaster_start_time()::text AS postmaster_start
      FROM pg_stat_activity WHERE pid=pg_backend_pid()`);
    return(await issuerDb.query(`INSERT INTO production_cutover_apply_admissions(id,environment_id,environment_generation,manifest_id,manifest_version,
      content_hash,snapshot_sha256,mode,source_sha,fence_owner,fence_generation,authority_sha256,operator_id,backend_pid,backend_start,postmaster_start,expires_at)
      VALUES($1,'OWNED-CUTOVER',1,$2,$3,$4,$5,$9,repeat('a',40),'OWNED-NO-HOST-ADMISSION',1,repeat('c',64),'1',$6,$7,$8,clock_timestamp()+interval '5 minutes') RETURNING id,admission_digest`,
      [randomUUID(),document.id,document.version,document.content_hash,document.snapshot_sha256,backend.pid,backend.backend_start,backend.postmaster_start,mode]))[0];
  }
  it('rolls back a consumed permit without a complete cutover result, preserving the original permit for its same backend',async()=>{
    const {document}=await approvedCount(),q=await holdExecutor();
    try{
      const admission=await issue(q,document);await q.startTransaction('READ COMMITTED');
      await q.query('SELECT consume_production_cutover_admission($1,$2)',[admission.id,admission.admission_digest]);
      await expect(q.commitTransaction()).rejects.toThrow('CUTOVER_APPLY_COMPLETION_REQUIRED');
      if(q.isTransactionActive)await q.rollbackTransaction();
      expect((await issuerDb.query('SELECT consumed_xid FROM production_cutover_apply_admissions WHERE id=$1',[admission.id]))[0].consumed_xid).toBeNull();
      expect((await apiDb.query('SELECT state FROM production_cutover_manifests WHERE id=$1',[document.id]))[0].state).toBe('APPROVED');
    }finally{await releaseExecutor(q);}
  });
  it('rejects direct column UPDATE and SET-only helper privileges that would bypass the digest consumer',async()=>{
    const helper=prefix+'column_writer';await db.query(`CREATE ROLE ${identifier(helper)} NOLOGIN`);createdRoles.push(helper);
    await db.query(`GRANT USAGE ON SCHEMA ${identifier(schema)} TO ${identifier(helper)};
      GRANT SELECT ON production_cutover_apply_admissions TO ${identifier(helper)}`);
    const {document}=await approvedCount(),q=await holdExecutor();
    try{
      const admission=await issue(q,document);
      for(const role of [roles.executor,helper]){
        await db.query(`GRANT UPDATE(consumed_at,consumed_xid) ON production_cutover_apply_admissions TO ${identifier(role)}`);
        if(role===helper)await db.query(`GRANT ${identifier(helper)} TO ${identifier(roles.executor)} WITH INHERIT FALSE`);
        try{
          await q.startTransaction('READ COMMITTED');if(role===helper)await q.query(`SET LOCAL ROLE ${identifier(helper)}`);
          await expect(q.query('UPDATE production_cutover_apply_admissions SET consumed_at=clock_timestamp(),consumed_xid=pg_current_xact_id() WHERE id=$1',[admission.id]))
            .rejects.toThrow('CUTOVER_CONTROL_REGISTRY_ACL_HOLD');
        }finally{
          if(q.isTransactionActive)await q.rollbackTransaction();
          if(role===helper)await db.query(`REVOKE ${identifier(helper)} FROM ${identifier(roles.executor)}`);
          await db.query(`REVOKE UPDATE(consumed_at,consumed_xid) ON production_cutover_apply_admissions FROM ${identifier(role)}`);
        }
      }
      expect((await issuerDb.query('SELECT consumed_xid FROM production_cutover_apply_admissions WHERE id=$1',[admission.id]))[0].consumed_xid).toBeNull();
    }finally{await releaseExecutor(q);}
  });
  it('rejects reachable server-file/program roles and PUBLIC consumer execution before issuing a permit',async()=>{
    const {document}=await approvedCount(),q=await holdExecutor();
    try{
      for(const dangerous of ['pg_read_server_files','pg_write_server_files','pg_execute_server_program']){
        await db.query(`GRANT ${identifier(dangerous)} TO ${identifier(roles.executor)} WITH INHERIT FALSE`);
        try{await expect(issue(q,document)).rejects.toThrow('CUTOVER_CONTROL_ROLE_PRIVILEGES_HOLD');}
        finally{await db.query(`REVOKE ${identifier(dangerous)} FROM ${identifier(roles.executor)}`);}
      }
      await db.query('GRANT EXECUTE ON FUNCTION consume_production_cutover_admission(uuid,text) TO PUBLIC');
      try{await expect(issue(q,document)).rejects.toThrow('CUTOVER_CONTROL_CONSUMER_ACL_HOLD');}
      finally{await db.query('REVOKE ALL ON FUNCTION consume_production_cutover_admission(uuid,text) FROM PUBLIC');}
    }finally{await releaseExecutor(q);}
  });
  it('rejects an unregistered LOGIN that can SET ROLE to the dedicated executor',async()=>{
    const helper=prefix+'external_login';await db.query(`CREATE ROLE ${identifier(helper)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE`);createdRoles.push(helper);
    await db.query(`GRANT ${identifier(roles.executor)} TO ${identifier(helper)} WITH INHERIT FALSE`);
    const connection=await connect(helper),foreign=connection.createQueryRunner();await foreign.connect();
    const {document}=await approvedCount(),q=await holdExecutor();
    try{
      await expect(issue(q,document)).rejects.toThrow('CUTOVER_CONTROL_EXTERNAL_LOGIN_MEMBERSHIP_HOLD');
      await foreign.query(`SET ROLE ${identifier(roles.executor)}`);
      await expect(foreign.query("UPDATE mst_products SET status='INACTIVE' WHERE product_code='PRD-EGG-RAW'")).rejects.toThrow('CUTOVER_EXECUTOR_RETIRED_OR_INHERITED_HOLD');
    }finally{await foreign.query('RESET ROLE');await foreign.release();await releaseExecutor(q);await db.query(`REVOKE ${identifier(roles.executor)} FROM ${identifier(helper)}`);}
  });
  it('refuses a non-egg authoritative category even when the product code has an egg prefix',async()=>{
    await apiDb.query("UPDATE mst_products SET category_code='MATERIAL' WHERE product_code='PRD-EGG-RAW'");
    let q:QueryRunner|undefined;
    try{
      const {document}=await approvedCount();q=await holdExecutor();const admission=await issue(q,document);
      await q.startTransaction('READ COMMITTED');await q.query('SELECT consume_production_cutover_admission($1,$2)',[admission.id,admission.admission_digest]);
      await expect(initializeZero(q,document)).rejects.toThrow('CUTOVER_SCOPE_REQUIRES_ACTIVE_EGG_PRODUCT');
      await q.rollbackTransaction();expect((await db.query('SELECT count(*)::int AS n FROM production_cutover_scopes'))[0].n).toBe(0);
    }finally{if(q)await releaseExecutor(q);await apiDb.query("UPDATE mst_products SET category_code='EGG' WHERE product_code='PRD-EGG-RAW'");}
  });
  async function initializeZero(q:QueryRunner,document:Record<string,any>,receiptTransform?:(value:Record<string,unknown>)=>Record<string,unknown>,options:{extraMembership?:boolean;archiveScope?:string}={}){
    const scopeId=randomUUID(),domainId=randomUUID(),openingId=randomUUID();
    const company=document.company_code,warehouse=document.warehouse_code,house=document.boundary.houses[0].houseCode;
    const flock=document.snapshot.flocks.find((flock:Record<string,any>)=>flock.house_code===house),profile=document.snapshot.masters.profiles.find((profile:Record<string,any>)=>profile.house_code===house);
    if(!flock||!profile)throw Error('Owned actual flock and profile required');
    await q.query(`INSERT INTO production_cutover_scopes(id,company_code,house_code,version,first_production_date,state,warehouse_code,
      flock_id,source_profile_code,manifest_sha256,evidence,confirmed_by) VALUES($1,$5,$6,1,$2,'DRAFT',$7,$8,$9,$3,$4,'1')`,
      [scopeId,document.boundary.houses[0].firstProductionDate,document.content_hash,JSON.stringify({manifestId:document.id,synthetic:true}),company,house,warehouse,flock.flock_no,profile.profile_code]);
    await q.query(`INSERT INTO production_inventory_domain_states(id,company_code,warehouse_code,product_code,created_by)
      VALUES($1,$2,$3,'PRD-EGG-RAW','1')`,[domainId,company,warehouse]);
    await q.query("INSERT INTO production_inventory_domains(scope_id,company_code,warehouse_code,product_code,inventory_domain_id) VALUES($1,$3,$4,'PRD-EGG-RAW',$2)",[scopeId,domainId,company,warehouse]);
    for(const decision of document.payload.decisions){
      const existing=document.snapshot.qualification.find((qualification:Record<string,any>)=>qualification.batch_no===decision.batchNo);
      if(existing)continue;
      const batch=document.snapshot.batches.find((batch:Record<string,any>)=>batch.batch_no===decision.batchNo);
      await q.query(`INSERT INTO production_batch_qualifications(batch_no,scope_id,company_code,product_code,sku_code,disposition,origin_kind,
        origin_ref,source_type,source_no,evidence_sha256,created_by) VALUES($1,$2,$9,$3,$4,'ARCHIVED_TEST','EXISTING_VERIFIED',$5,$6,$7,$8,'1')`,
        [batch.batch_no,options.archiveScope??scopeId,batch.product_code,batch.sku_code,document.document_no+':'+batch.batch_no,batch.source_type??'',batch.source_no??'',document.content_hash,company]);
    }
    if(options.extraMembership){
      const extra=randomUUID();await q.query(`INSERT INTO production_inventory_domain_states(id,company_code,warehouse_code,product_code,created_by)
        VALUES($1,$2,$3,'PRD-STD','1')`,[extra,company,warehouse]);
      await q.query(`INSERT INTO production_inventory_domains(scope_id,company_code,warehouse_code,product_code,inventory_domain_id)
        VALUES($1,$2,$3,'PRD-STD',$4)`,[scopeId,company,warehouse,extra]);
    }
    await q.query("UPDATE production_cutover_scopes SET state='FENCED' WHERE id=$1",[scopeId]);
    for(const [state,version] of [['FENCED',1],['ACTIVE',2]]){
      const event=randomUUID();await q.query(`INSERT INTO production_inventory_domain_events(id,domain_id,state,version,manifest_id,intent_key,content_hash,reason,signed_by,evidence_file_id,evidence_checksum)
        VALUES($1,$2,$3,$4,$5,$6,$7,'Owned controlled opening','1',$8,repeat('b',64))`,[event,domainId,state,version,document.id,event,document.content_hash,'ADMIT-BUSINESS-'+warehouse]);
      await q.query('UPDATE production_inventory_domain_states SET state=$2,version=$3 WHERE id=$1',[domainId,state,version]);
      if(state==='FENCED')await q.query(`INSERT INTO production_opening_domain_claims(domain_id,manifest_id,opening_receipt_id,scope_id,content_hash,claimed_by)
        VALUES($1,$2,$3,$4,$5,'1')`,[domainId,document.id,openingId,scopeId,document.content_hash]);
    }
    await q.query("UPDATE production_cutover_scopes SET state='ACTIVE',activated_at=clock_timestamp() WHERE id=$1",[scopeId]);
    const actual=await new WmsService(executorDb.manager,cls as never).postApprovedOpening(q.manager,document.id),result=receiptTransform?receiptTransform(actual):actual;
    await q.query(`INSERT INTO production_opening_receipts(id,handover_ref,company_code,warehouse_code,scope_id,evidence_sha256,manifest,created_by,receipt,cutover_manifest_id)
      VALUES($1,$2,$8,$9,$3,$4,$5,'1',$6,$7)`,[openingId,document.document_no,scopeId,document.content_hash,JSON.stringify(document.payload),JSON.stringify(result),document.id,company,warehouse]);
    await q.query("UPDATE production_cutover_manifests SET state='APPLIED',version=version+1,applied_at=clock_timestamp(),receipt=$2 WHERE id=$1",[document.id,JSON.stringify(result)]);
    return {scopeId,domainId,openingId,result};
  }
  it('records one actual zero opening through the internal WMS writer and keeps its original result after commit',async()=>{
    await apiDb.query(`INSERT INTO inv_batches(batch_no,company_code,warehouse_code,product_code,sku_code,grade_code_std,spec_code,unit,qty,qty_available,status,source_type,source_no,unit_cost)
      VALUES('ADMIT-LEGACY-TEST','COMP-A','WH-A','PRD-EGG-RAW','SKU-GRADE_1','GRADE_1','LOOSE','枚',7,7,'AVAILABLE','TEMP_PRODUCTION','ADMIT-LEGACY-TEST',100000000000.000021);
      INSERT INTO inv_ledger(batch_no,company_code,warehouse_code,sku_code,quality_grade,qty_change,change_type,ref_no,cost_change)
        VALUES('ADMIT-LEGACY-TEST','COMP-A','WH-A','SKU-GRADE_1','GRADE_1',7,'FARM_IN','ADMIT-LEGACY-TEST',700000000000.000147);`);
    const {document,cutovers}=await approvedCount(),q=await holdExecutor();let admission:Record<string,any>,applied:Awaited<ReturnType<typeof initializeZero>>;
    const foreignDraft=randomUUID();await apiDb.query(`INSERT INTO production_cutover_scopes(id,company_code,house_code,version,first_production_date,state,warehouse_code,
      flock_id,source_profile_code,manifest_sha256,evidence,confirmed_by) VALUES($1,'COMP-B','HOUSE-B',99,$2,'DRAFT','WH-B','FLOCK-B','PROFILE-B',repeat('d',64),'{}','1')`,[foreignDraft,document.boundary.houses[0].firstProductionDate]);
    try{
      admission=await issue(q,document);
      for(const fault of ['extra-membership','wrong-archive-anchor']){
        const wrong=randomUUID();
        if(fault==='wrong-archive-anchor')await apiDb.query(`INSERT INTO production_cutover_scopes(id,company_code,house_code,version,first_production_date,state,warehouse_code,
          flock_id,source_profile_code,manifest_sha256,evidence,confirmed_by) VALUES($1,'COMP-A','HOUSE-A2',1,$2,'DRAFT','WH-A','FLOCK-A2','PROFILE-A2',$3,'{}','1')`,[wrong,document.boundary.houses[0].firstProductionDate,document.content_hash]);
        await q.startTransaction('READ COMMITTED');await q.query('SELECT consume_production_cutover_admission($1,$2)',[admission.id,admission.admission_digest]);
        await expect(initializeZero(q,document,undefined,fault==='extra-membership'?{extraMembership:true}:{archiveScope:wrong}))
          .rejects.toThrow(fault==='extra-membership'?'CUTOVER_EXECUTOR_WRITE_BOUNDARY_HOLD':'CUTOVER_ARCHIVE_ADMISSION_BOUNDARY_HOLD');
        await q.rollbackTransaction();if(fault==='wrong-archive-anchor')await apiDb.query('DELETE FROM production_cutover_scopes WHERE id=$1',[wrong]);
        expect((await db.query('SELECT count(*)::int AS n FROM production_cutover_scopes WHERE id<>$1',[foreignDraft]))[0].n).toBe(0);
      }
      await q.startTransaction('READ COMMITTED');await q.query('SELECT consume_production_cutover_admission($1,$2)',[admission.id,admission.admission_digest]);
      await initializeZero(q,document);
      await q.query(`INSERT INTO production_cutover_scopes(id,company_code,house_code,version,first_production_date,state,warehouse_code,
        flock_id,source_profile_code,manifest_sha256,evidence,confirmed_by) VALUES($1,'COMP-A','HOUSE-A',2,$2,'DRAFT','WH-A','FLOCK-A','PROFILE-A',$3,'{}','1')`,
        [randomUUID(),document.boundary.houses[0].firstProductionDate,document.content_hash]);
      await q.query('SELECT record_production_cutover_apply_result($1)',[admission.id]);
      await expect(q.commitTransaction()).rejects.toThrow('CUTOVER_APPLY_UNSELECTED_SCOPE_HOLD');if(q.isTransactionActive)await q.rollbackTransaction();
      await q.startTransaction('READ COMMITTED');
      await q.query('SELECT consume_production_cutover_admission($1,$2)',[admission.id,admission.admission_digest]);
      await expect(apiDb.query("UPDATE inv_batches SET qty=qty WHERE batch_no='ADMIT-LEGACY-TEST'")).rejects.toThrow('OFFICIAL_INVENTORY_CUTOVER_EVIDENCE_BUSY');
      await(cutovers as unknown as{verifyCurrentEvidence:(manager:EntityManager,...args:unknown[])=>Promise<unknown>})
        .verifyCurrentEvidence(q.manager,document.boundary,document.snapshot,document.snapshot_sha256);
      expect(document.snapshot.batches.find((batch:Record<string,unknown>)=>batch.batch_no==='ADMIT-LEGACY-TEST').unit_cost).toBe('100000000000.000021');
      for(const table of ['inv_batches','inv_ledger']){
        await q.query('SAVEPOINT preserve_original');
        await expect(q.query(`UPDATE ${table} SET batch_no=batch_no WHERE batch_no='ADMIT-LEGACY-TEST'`)).rejects.toThrow('CUTOVER_COUNTED_HISTORY_READ_ONLY');
        await q.query('ROLLBACK TO SAVEPOINT preserve_original');
      }
      await expect(apiDb.query(`INSERT INTO inv_ledger(batch_no,change_type,qty_change,operator,ref_no,cost_change)
        VALUES('ADMIT-LEGACY-TEST','TRANSFER_OUT',-1,'maker','OWNED-EXTRA-OLD-ROW',-100000000000.000021)`)).rejects.toThrow('OFFICIAL_INVENTORY_CUTOVER_EVIDENCE_BUSY');
      for(const query of [
        "INSERT INTO inv_batches(batch_no,company_code,warehouse_code,product_code,sku_code,qty,qty_available,status) VALUES('EXTRA-UNSIGNED-STOCK','COMP-B','WH-B','PRD-EGG-RAW','SKU-GRADE_1',8,8,'AVAILABLE')",
        "UPDATE production_cutover_manifests SET state='CANCELLED',version=version+1 WHERE id<>(SELECT manifest_id FROM production_cutover_apply_admissions WHERE id='"+admission.id+"') AND state='APPROVED'",
        "UPDATE mst_products SET status='INACTIVE' WHERE product_code='PRD-EGG-RAW'",
      ]){
        await q.query('SAVEPOINT unlisted_write');await expect(q.query(query)).rejects.toThrow('CUTOVER_EXECUTOR_WRITE_BOUNDARY_HOLD');
        await q.query('ROLLBACK TO SAVEPOINT unlisted_write');
      }
      await q.query('SAVEPOINT foreign_draft');
      await expect(q.query(`UPDATE production_cutover_scopes SET company_code='COMP-A',house_code='HOUSE-A',warehouse_code='WH-A',flock_id='FLOCK-A',
        source_profile_code='PROFILE-A',manifest_sha256=$2 WHERE id=$1`,[foreignDraft,document.content_hash])).rejects.toThrow('CUTOVER_EXECUTOR_WRITE_BOUNDARY_HOLD');
      await q.query('ROLLBACK TO SAVEPOINT foreign_draft');
      applied=await initializeZero(q,document);
      await q.query('SAVEPOINT null_manifest');
      await expect(q.query(`INSERT INTO production_batch_qualifications(batch_no,scope_id,company_code,product_code,sku_code,disposition,origin_kind,
        origin_ref,evidence_sha256,created_by,opening_manifest_id) VALUES('UNBOUND-OPENING-QUALIFICATION',$1,'COMP-A','PRD-EGG-RAW','SKU-GRADE_1','QUALIFIED',
          'OPENING','OWNED-UNBOUND',repeat('a',64),'1',NULL)`,[applied.scopeId])).rejects.toThrow('CUTOVER_EXECUTOR_WRITE_BOUNDARY_HOLD');
      await q.query('ROLLBACK TO SAVEPOINT null_manifest');
      expect((await q.query('SELECT record_production_cutover_apply_result($1) AS result',[admission.id]))[0].result).toEqual(applied.result);
      await q.query('SET CONSTRAINTS ALL IMMEDIATE');await q.query('SAVEPOINT after_seal');
      await expect(q.query("UPDATE production_cutover_scopes SET state='SUSPENDED' WHERE id=$1",[applied.scopeId])).rejects.toThrow('CUTOVER_APPLY_RESULT_ALREADY_SEALED');
      await q.query('ROLLBACK TO SAVEPOINT after_seal');
      await q.commitTransaction();
      expect((await issuerDb.query('SELECT count(*)::int AS n FROM production_cutover_apply_results WHERE admission_id=$1',[admission.id]))[0].n).toBe(1);
      expect((await apiDb.query('SELECT state,receipt FROM production_cutover_manifests WHERE id=$1',[document.id]))[0]).toEqual({state:'APPLIED',receipt:applied.result});
      expect((await db.query('SELECT qty FROM inv_batches WHERE batch_no=\'ADMIT-LEGACY-TEST\''))[0].qty).toBe('7');
      expect((await db.query("SELECT official_inventory_allows(batch_no,company_code,warehouse_code,product_code,sku_code,material_code) AS allowed FROM inv_batches WHERE batch_no='ADMIT-LEGACY-TEST'"))[0].allowed).toBe(false);
      expect((await db.query("SELECT count(*)::int AS n FROM inv_ledger WHERE change_type='OPENING_INBOUND'"))[0].n).toBe(0);
      expect((await db.query("SELECT cost_change::text AS amount FROM inv_ledger WHERE batch_no='ADMIT-LEGACY-TEST'"))[0].amount).toBe('700000000000.000147');
      await apiDb.query("UPDATE production_cutover_scopes SET state='SUSPENDED' WHERE id=$1",[applied.scopeId]);
      await apiDb.query("UPDATE production_cutover_scopes SET state='ACTIVE' WHERE id=$1",[applied.scopeId]);
      expect((await db.query('SELECT count(*)::int AS n FROM production_opening_receipts'))[0].n).toBe(1);
      await expect(q.query("UPDATE mst_products SET status='INACTIVE' WHERE product_code='PRD-EGG-RAW'")).rejects.toThrow('CUTOVER_ADMISSION_CONTEXT_REQUIRED');
    }finally{await releaseExecutor(q);await apiDb.query('DELETE FROM production_cutover_scopes WHERE id=$1',[foreignDraft]);}
  });
  it('attaches another real house to the already opened shared domain without rewriting old archive evidence or creating another opening',async()=>{
    await apiDb.query(`UPDATE md_egg_source_profiles SET product_mode='VARIANT',variety_code='EGG_RED' WHERE profile_code='PROFILE-A2';
      INSERT INTO brd_flocks(flock_no,house_code,farm_code,breed_code,status,placement_date,start_date,company_code,site_code)
        VALUES('FLOCK-A2','HOUSE-A2','FARM-A','TEST_RED','LAYING','2026-01-01','2026-01-01','COMP-A','SITE-A')`);
    const {document,cutovers}=await approvedCount('HOUSE-A2'),q=await holdExecutor();
    const [original]=await issuerDb.query("SELECT * FROM production_cutover_apply_results WHERE mode='INIT'");
    try{
      const admission=await issue(q,document,'ATTACH');await q.startTransaction('READ COMMITTED');
      await q.query('SELECT consume_production_cutover_admission($1,$2)',[admission.id,admission.admission_digest]);
      await(cutovers as unknown as{verifyCurrentEvidence:(manager:EntityManager,...args:unknown[])=>Promise<unknown>})
        .verifyCurrentEvidence(q.manager,document.boundary,document.snapshot,document.snapshot_sha256);
      await q.query("SET LOCAL TIME ZONE 'Asia/Singapore'");
      const scopeId=randomUUID();await q.query(`INSERT INTO production_cutover_scopes(id,company_code,house_code,version,first_production_date,state,warehouse_code,
        flock_id,source_profile_code,manifest_sha256,evidence,confirmed_by) VALUES($1,'COMP-A','HOUSE-A2',1,$2,'DRAFT','WH-A','FLOCK-A2','PROFILE-A2',$3,'{}','1')`,
        [scopeId,document.boundary.houses[0].firstProductionDate,document.content_hash]);
      await q.query('SAVEPOINT unrelated_scope');
      await expect(q.query("UPDATE production_cutover_scopes SET state='SUSPENDED' WHERE id=$1",[original.scope_ids[0]])).rejects.toThrow('CUTOVER_EXECUTOR_WRITE_BOUNDARY_HOLD');
      await q.query('ROLLBACK TO SAVEPOINT unrelated_scope');
      const domainId=original.domain_ids[0];await q.query(`INSERT INTO production_inventory_domains(scope_id,company_code,warehouse_code,product_code,inventory_domain_id)
        VALUES($1,'COMP-A','WH-A','PRD-EGG-RAW',$2)`,[scopeId,domainId]);
      await q.query("UPDATE production_cutover_scopes SET state='FENCED' WHERE id=$1",[scopeId]);
      await q.query("UPDATE production_cutover_scopes SET state='ACTIVE',activated_at=clock_timestamp() WHERE id=$1",[scopeId]);
      const result={manifestId:document.id,documentNo:document.document_no,contentHash:document.content_hash,postingDate:document.payload.postingDate,
        mode:'ATTACH',totalOpening:0,batches:[],domains:[{domainId,productCode:'PRD-EGG-RAW',openingReceiptId:original.opening_receipt_id}]};
      await q.query("UPDATE production_cutover_manifests SET state='APPLIED',version=version+1,applied_at=clock_timestamp(),receipt=$2 WHERE id=$1",[document.id,JSON.stringify(result)]);
      await q.query('SELECT record_production_cutover_apply_result($1)',[admission.id]);await q.commitTransaction();
      expect((await db.query('SELECT count(*)::int AS n FROM production_opening_receipts'))[0].n).toBe(1);
      expect((await db.query('SELECT count(*)::int AS n FROM production_opening_domain_claims'))[0].n).toBe(1);
      expect((await db.query("SELECT count(*)::int AS n FROM inv_ledger WHERE change_type='OPENING_INBOUND'"))[0].n).toBe(0);
      expect((await db.query('SELECT evidence_sha256 FROM production_batch_qualifications WHERE batch_no=\'ADMIT-LEGACY-TEST\''))[0].evidence_sha256).not.toBe(document.content_hash);
    }finally{await releaseExecutor(q);}
  });
  it('rolls back a wrong receipt and wrong actual inbound date, then posts known, unknown and confirmed-zero opening costs once',async()=>{
    const line=(grade:string,quantity:number,costStatus:'CONFIRMED'|'UNKNOWN',unitCost:number|string|null):CutoverCountLine=>({
      skuCode:'SKU-'+grade,productCode:'PRD-EGG-RAW',gradeCode:grade,specCode:'LOOSE',locationCode:'LOC-B',quantity,
      stockStatus:'QUARANTINE',productionDate:null,expireDate:null,costStatus,unitCost,qualityConfirmed:false});
    await apiDb.query("UPDATE wms_locations SET status='NORMAL' WHERE location_code='LOC-B'");
    const {document,cutovers}=await approvedCount('HOUSE-B',{company:'COMP-B',warehouse:'WH-B',openingLines:[
      line('GRADE_1',20,'CONFIRMED',2.5),line('GRADE_2',3,'UNKNOWN',null),line('GRADE_3',2,'CONFIRMED',0),line('GRADE_4',4,'CONFIRMED','100000000000.000020')]}),q=await holdExecutor();
    try{
      const admission=await issue(q,document);
      for(const fault of ['receipt','inbound-date','batch-grade','batch-spec','ledger-company','extra-negative-ledger']){
        await q.startTransaction('READ COMMITTED');await q.query('SELECT consume_production_cutover_admission($1,$2)',[admission.id,admission.admission_digest]);
        await(cutovers as unknown as{verifyCurrentEvidence:(manager:EntityManager,...args:unknown[])=>Promise<unknown>})
          .verifyCurrentEvidence(q.manager,document.boundary,document.snapshot,document.snapshot_sha256);
        const original=q.manager.query.bind(q.manager);let injected=false;
        if(['inbound-date','batch-grade','batch-spec','ledger-company'].includes(fault))q.manager.query=(async(sql:string,args?:unknown[])=>{
          if(!injected&&fault==='inbound-date'&&sql.includes('INSERT INTO inv_batches')){injected=true;const values=[...(args??[])];values[15]='2000-01-01';return original(sql,values);}
          if(!injected&&['batch-grade','batch-spec'].includes(fault)&&sql.includes('INSERT INTO inv_batches')){
            injected=true;const values=[...(args??[])];values[fault==='batch-grade'?10:11]=fault==='batch-grade'?'BROKEN':'OWNED-WRONG-SPEC';return original(sql,values);
          }
          if(!injected&&fault==='ledger-company'&&sql.includes('INSERT INTO inv_ledger')){
            const match=sql.match(/INSERT INTO inv_ledger\s*\(([^)]+)\)/i);if(!match)throw Error('Actual ledger columns not found');
            const index=match[1].split(',').map(column=>column.trim()).indexOf('company_code');if(index<0)throw Error('Actual ledger company missing');
            injected=true;const values=[...(args??[])];values[index]='COMP-A';return original(sql,values);
          }return original(sql,args);
        }) as typeof q.manager.query;
        let attempted:Awaited<ReturnType<typeof initializeZero>>;
        try{
          attempted=await initializeZero(q,document,fault==='receipt'?value=>({...value,batches:(value.batches as Record<string,unknown>[]).map((batch,index)=>index===0?{...batch,inventoryLedgerId:999999}:batch)}):undefined);
        }finally{q.manager.query=original;}
        if(['inbound-date','batch-grade','batch-spec','ledger-company'].includes(fault))expect(injected).toBe(true);
        if(fault==='extra-negative-ledger')await q.query(`INSERT INTO inv_ledger(batch_no,change_type,qty_change,operator,ref_no,company_code,warehouse_code,
          location_code,sku_code,unit,quality_grade,log_date,cost_change,business_type) VALUES($1,'TRANSFER_OUT',-1,'maker','OWNED-EXTRA-NEGATIVE',
            'COMP-B','WH-B','LOC-B','SKU-GRADE_1','枚','GRADE_1',$2,-2.5,'TRANSFER')`,[(attempted.result.batches as Record<string,unknown>[])[0].batchNo,document.payload.postingDate]);
        await q.query('SELECT record_production_cutover_apply_result($1)',[admission.id]);
        await expect(q.commitTransaction()).rejects.toThrow(fault==='receipt'?'CUTOVER_APPLY_ORIGINAL_RECEIPT_HOLD':'CUTOVER_APPLY_OPENING_PHYSICAL_HOLD');
        if(q.isTransactionActive)await q.rollbackTransaction();
        expect(await db.query("SELECT 1 FROM inv_batches WHERE company_code='COMP-B'")).toHaveLength(0);
        expect((await issuerDb.query('SELECT consumed_xid FROM production_cutover_apply_admissions WHERE id=$1',[admission.id]))[0].consumed_xid).toBeNull();
      }
      await q.startTransaction('READ COMMITTED');await q.query('SELECT consume_production_cutover_admission($1,$2)',[admission.id,admission.admission_digest]);
      const applied=await initializeZero(q,document);
      const batch=(applied.result.batches as Record<string,unknown>[])[0];
      await expect(apiDb.query(`INSERT INTO inv_ledger(batch_no,change_type,qty_change,operator,ref_no,company_code,warehouse_code,
        location_code,sku_code,unit,quality_grade,log_date,cost_change,business_type) VALUES($1,'TRANSFER_OUT',-1,'maker','OWNED-OTHER-CONNECTION',
          'COMP-B','WH-B','LOC-B','SKU-GRADE_1','枚','GRADE_1',$2,-2.5,'TRANSFER')`,[batch.batchNo,document.payload.postingDate])).rejects.toThrow('CUTOVER_OPENING_NAMESPACE_HOLD');
      await q.query('SELECT record_production_cutover_apply_result($1)',[admission.id]);await q.commitTransaction();
      expect(applied.result.totalOpening).toBe(29);expect((applied.result.batches as unknown[])).toHaveLength(4);
      const rows=await db.query(`SELECT batch.qty,batch.qty_available,batch.unit_cost,qualification.cost_status,ledger.cost_change
        FROM inv_batches batch JOIN production_batch_qualifications qualification ON qualification.batch_no=batch.batch_no
        JOIN inv_ledger ledger ON ledger.batch_no=batch.batch_no AND ledger.change_type='OPENING_INBOUND'
        WHERE batch.company_code='COMP-B' ORDER BY batch.grade_code_std`);
      expect(rows).toEqual([{qty:'20',qty_available:'0',unit_cost:'2.500000',cost_status:'CONFIRMED',cost_change:'50.000000'},
        {qty:'3',qty_available:'0',unit_cost:'0.000000',cost_status:'UNKNOWN',cost_change:null},
        {qty:'2',qty_available:'0',unit_cost:'0.000000',cost_status:'CONFIRMED',cost_change:'0.000000'},
        {qty:'4',qty_available:'0',unit_cost:'100000000000.000020',cost_status:'CONFIRMED',cost_change:'400000000000.000080'}]);
      await expect(q.query('SELECT consume_production_cutover_admission($1,$2)',[admission.id,admission.admission_digest])).rejects.toThrow('CUTOVER_ADMISSION_CAS_HOLD');
    }finally{await releaseExecutor(q);}
  });
  it('carries an actual native purchase and prior opening into another house without changing either physical ledger',async()=>{
    await apiDb.query(`INSERT INTO brd_houses VALUES('HOUSE-B2','FARM-B','ACTIVE');
      INSERT INTO brd_flocks(flock_no,house_code,farm_code,breed_code,status,placement_date,start_date,company_code,site_code)
        VALUES('FLOCK-B2','HOUSE-B2','FARM-B','TEST_RED','LAYING','2026-01-01','2026-01-01','COMP-B','SITE-B');
      INSERT INTO md_egg_source_profiles(profile_code,company_code,farm_code,site_code,house_code,product_mode,variety_code,effective_date)
        VALUES('PROFILE-B2','COMP-B','FARM-B','SITE-B','HOUSE-B2','VARIANT','EGG_RED','2026-01-01');
      UPDATE wms_warehouses SET type='PURCHASE_RECV' WHERE warehouse_code='WH-B';
      INSERT INTO prc2_purchase_orders VALUES(10,'COMP-B','USD');
      INSERT INTO prc2_receipts VALUES(10,'OWNED-ACTUAL-CARRY-PURCHASE','COMP-B','WH-B','CONFIRMED',10);
      INSERT INTO prc2_receipt_items VALUES(10,10,'SKU-GRADE_1',11,'枚',2.5);`);
    const bought=await apiDb.transaction(manager=>new WmsService(apiDb.manager,cls as never).inboundFromReceipt(manager,{
      refNo:'OWNED-ACTUAL-CARRY-PURCHASE',warehouseCode:'WH-B',operator:'maker',inboundDate:singaporeBusinessDate(),
      items:[{receiptItemId:'10',skuCode:'SKU-GRADE_1',itemCode:'SKU-GRADE_1',unit:'枚',qty:11,unitCost:2.5,locationCode:'LOC-B'}]}));
    expect((await apiDb.query('SELECT origin_kind,disposition FROM production_batch_qualifications WHERE batch_no=$1',[bought.batchNos[0]]))[0])
      .toMatchObject({origin_kind:'PURCHASE',disposition:'QUALIFIED'});
    const {document,cutovers}=await approvedCount('HOUSE-B2',{company:'COMP-B',warehouse:'WH-B',carry:true});
    expect(document.payload.physicalTotals[0].quantity).toBe(40);
    expect(document.payload.decisions.every((decision:Record<string,unknown>)=>decision.disposition==='CARRY_FORWARD')).toBe(true);
    const [original]=await executorDb.query("SELECT * FROM production_cutover_apply_results WHERE mode='INIT' AND manifest_id IN(SELECT id FROM production_cutover_manifests WHERE company_code='COMP-B')");
    const q=await holdExecutor();
    try{
      const admission=await issue(q,document,'ATTACH');await q.startTransaction('READ COMMITTED');
      await q.query('SELECT consume_production_cutover_admission($1,$2)',[admission.id,admission.admission_digest]);
      await expect(apiDb.query('UPDATE inv_batches SET qty=qty WHERE batch_no=$1',[bought.batchNos[0]])).rejects.toThrow('OFFICIAL_INVENTORY_CUTOVER_EVIDENCE_BUSY');
      await q.query('SAVEPOINT carry_original');
      await expect(q.query('UPDATE inv_ledger SET note=note WHERE batch_no=$1',[bought.batchNos[0]])).rejects.toThrow('CUTOVER_COUNTED_HISTORY_READ_ONLY');
      await q.query('ROLLBACK TO SAVEPOINT carry_original');
      await(cutovers as unknown as{verifyCurrentEvidence:(manager:EntityManager,...args:unknown[])=>Promise<unknown>})
        .verifyCurrentEvidence(q.manager,document.boundary,document.snapshot,document.snapshot_sha256);
      const scopeId=randomUUID(),domainId=original.domain_ids[0];
      await q.query(`INSERT INTO production_cutover_scopes(id,company_code,house_code,version,first_production_date,state,warehouse_code,
        flock_id,source_profile_code,manifest_sha256,evidence,confirmed_by) VALUES($1,'COMP-B','HOUSE-B2',1,$2,'DRAFT','WH-B','FLOCK-B2','PROFILE-B2',$3,'{}','1')`,
        [scopeId,document.boundary.houses[0].firstProductionDate,document.content_hash]);
      await q.query(`INSERT INTO production_inventory_domains(scope_id,company_code,warehouse_code,product_code,inventory_domain_id)
        VALUES($1,'COMP-B','WH-B','PRD-EGG-RAW',$2)`,[scopeId,domainId]);
      await q.query("UPDATE production_cutover_scopes SET state='FENCED' WHERE id=$1",[scopeId]);
      await q.query("UPDATE production_cutover_scopes SET state='ACTIVE',activated_at=clock_timestamp() WHERE id=$1",[scopeId]);
      const result={manifestId:document.id,documentNo:document.document_no,contentHash:document.content_hash,postingDate:document.payload.postingDate,
        mode:'ATTACH',totalOpening:0,batches:[],domains:[{domainId,productCode:'PRD-EGG-RAW',openingReceiptId:original.opening_receipt_id}]};
      await q.query("UPDATE production_cutover_manifests SET state='APPLIED',version=version+1,applied_at=clock_timestamp(),receipt=$2 WHERE id=$1",[document.id,JSON.stringify(result)]);
      await q.query('SELECT record_production_cutover_apply_result($1)',[admission.id]);await q.commitTransaction();
      expect((await db.query("SELECT count(*)::int AS n FROM production_opening_receipts WHERE company_code='COMP-B'"))[0].n).toBe(1);
      expect((await db.query('SELECT qty FROM inv_batches WHERE batch_no=$1',[bought.batchNos[0]]))[0].qty).toBe('11');
    }finally{await releaseExecutor(q);}
  });

  it('keeps a retired executor from falling through to ordinary writes after a new environment generation',async()=>{
    const replacement=prefix+'replacement';await db.query(`CREATE ROLE ${identifier(replacement)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);createdRoles.push(replacement);
    await db.query(`GRANT USAGE ON SCHEMA ${identifier(schema)} TO ${identifier(replacement)}`);
    await db.query(`GRANT SELECT ON production_cutover_control_environments,mst_products TO ${identifier(replacement)};
      GRANT UPDATE ON mst_products TO ${identifier(replacement)}`);
    const newConnection=await connect(replacement),stale=newConnection.createQueryRunner();await stale.connect();await stale.startTransaction('REPEATABLE READ');
    expect((await stale.query('SELECT count(*)::int AS n FROM production_cutover_control_environments'))[0].n).toBe(1);
    // Deliberately retain old executor grants in this counterexample: history-aware row guards must still deny its writes.
    await db.query(`INSERT INTO production_cutover_control_environments(environment_id,generation,control_owner,control_owner_oid,issuer_role,issuer_role_oid,executor_role,executor_role_oid,
      api_roles,api_role_oids,database_name,database_oid,schema_oid,cluster_identifier,deployment_evidence_sha256)
      SELECT environment_id,generation+1,control_owner,control_owner_oid,issuer_role,issuer_role_oid,$1::name,(SELECT oid FROM pg_roles WHERE rolname=$1),
        api_roles,api_role_oids,database_name,database_oid,schema_oid,cluster_identifier,repeat('e',64) FROM production_cutover_control_environments WHERE generation=1`,[replacement]);
    try{
      expect((await stale.query('SELECT count(*)::int AS n FROM production_cutover_control_environments'))[0].n).toBe(1);
      await expect(stale.query("UPDATE mst_products SET status='INACTIVE' WHERE product_code='PRD-EGG-RAW'")).rejects.toThrow('CUTOVER_CONTROL_WRITE_ISOLATION_HOLD');
    }finally{await stale.rollbackTransaction();await stale.release();}
    await expect(newConnection.query("UPDATE mst_products SET status='INACTIVE' WHERE product_code='PRD-EGG-RAW'")).rejects.toThrow('CUTOVER_ADMISSION_CONTEXT_REQUIRED');
    await expect(executorDb.query("UPDATE mst_products SET status='INACTIVE' WHERE product_code='PRD-EGG-RAW'")).rejects.toThrow('CUTOVER_EXECUTOR_RETIRED_OR_INHERITED_HOLD');
    expect((await apiDb.query("SELECT status FROM mst_products WHERE product_code='PRD-EGG-RAW'"))[0].status).toBe('ACTIVE');
  });

});
