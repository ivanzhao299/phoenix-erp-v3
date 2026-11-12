import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { buildPlan, CONFIRM, explicitDbConfig, manifestSha256, parseArgs, readManifest, runActivation, validDate, validateManifest } from './sku-source-activation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const apiRequire = createRequire(path.join(root, 'apps/api/package.json'));

test('reviewed manifest defines STANDARD42, VARIANT84, eleven houses and no ALL/sales grants', () => {
  const p = buildPlan(readManifest(), '2026-11-10');
  assert.equal(p.desired.profiles.length, 11);
  assert.equal(p.desired.skus.length, 126);
  assert.equal(p.desired.scopes.filter(r => r.scope_code === 'COMP-LAO-AGRI').length, 42);
  assert.equal(p.desired.scopes.filter(r => r.scope_code === 'COMP-LAO-XINGCHI').length, 84);
  assert.ok(p.desired.scopes.every(r => r.scope_type === 'COMPANY' && r.stock_enabled));
  assert.equal(p.desired.scopes.filter(r=>r.sale_enabled).length,35);
  assert.ok(p.desired.scopes.filter(r=>r.sale_enabled).every(r=>r.scope_code==='COMP-LAO-AGRI'));
  assert.equal(p.desired.grade0.weight_range, null);
  assert.equal(p.desired.skus.filter(row=>row.org_context_required).length,91);
  assert.equal(p.desired.skus.filter(r => r.grade_code === 'GRADE_0' && r.variety_code === null).length, 7);
  assert.deepEqual(p.desired.profiles.filter(r => r.variety_code === 'EGG_PINK').map(r => r.house_code), ['HOUSE_DP_01','HOUSE_DP_03','HOUSE_DP_05']);
});
test('manifest cannot add debug/rooster houses or swap the human-approved red/pink assignment', () => {
  for (const mutate of [
    m => m.companies[0].houses.push('H-DEBUG-A01'),
    m => m.companies[1].houses.push('HOUSE_DP_06'),
    m => { m.companies[1].variety_code = 'EGG_RED'; },
    m => { m.companies[0].variety_code = 'EGG_RED'; },
    m => { m.scope.scope_type = 'ALL'; },
    m => { m.scope.sale_enabled = true; },
    m => { m.effective_date = '2026-11-12'; },
  ]) {
    const m = readManifest(); mutate(m);
    assert.throws(() => validateManifest(m, '2026-11-10'), /SKU_ACTIVATION_HOLD/);
  }
});
test('valid dates round-trip and the plan includes effective date, manifest and DB state', () => {
  for (const d of ['2026-02-30','0000-01-01','2026/11/11','2026-1-1','2026-11-11T00:00:00Z']) assert.equal(validDate(d), false);
  assert.equal(validDate('2028-02-29'), true);
  const a = buildPlan(readManifest(), '2026-11-10', { sku_status:'ACTIVE' });
  assert.notEqual(a.plan_sha256, buildPlan(readManifest(), '2026-11-10', { sku_status:'FROZEN' }).plan_sha256);
  assert.throws(() => buildPlan(readManifest(), '2026-11-12', { sku_status:'ACTIVE' }), /SOURCE_EFFECTIVE_DATE_NOT_REVIEWED/);
  assert.equal(a.manifest_sha256, manifestSha256());
});
test('CLI rejects unknown, duplicate and conflicting arguments before connecting', () => {
  for (const args of [[], ['--apply'], ['--mode','apply','--unknown','x'], ['--mode','inspect','--mode','apply'], ['--mode','inspect','--confirm',CONFIRM], ['--mode','--apply']]) {
    assert.throws(() => parseArgs(args), /SKU_ACTIVATION_HOLD/);
  }
  assert.deepEqual(parseArgs(['--mode','inspect','--effective-date','2026-11-10']), { mode:'inspect','effective-date':'2026-11-10' });
  assert.throws(() => explicitDbConfig({}), /EXPLICIT_DATABASE/);
  assert.throws(() => explicitDbConfig({ DB_HOST:'h',DB_PORT:'bad',DB_USER:'u',DB_PASSWORD:'p',DB_NAME:'d' }), /PORT/);
  assert.deepEqual(explicitDbConfig({DATABASE_URL:'postgres://explicit-test'}), {connectionString:'postgres://explicit-test'});
});
test('apply requires the explicit confirmation and hash before BEGIN', async () => {
  const client = { query: async () => assert.fail('must not query') };
  await assert.rejects(runActivation(client,{mode:'apply',effectiveDate:'2026-11-10'}), /EXPLICIT_APPLY/);
  await assert.rejects(runActivation(client,{mode:'apply',effectiveDate:'2026-11-10',confirm:CONFIRM,expectedPlanSha256:'x'}), /EXPLICIT_APPLY/);
});

// Opt-in, owned disposable database only. Never load application .env or production credentials.
const url = process.env.SKU_SOURCE_ACTIVATION_TEST_URL;
test('real PG18 inspect, CAS, dry-run, activation, idempotence and refusal contracts', { skip: !url }, async t => {
  const parsed = new URL(url);
  assert.equal(parsed.hostname,'127.0.0.1'); assert.equal(parsed.port,'54329'); assert.equal(parsed.pathname,'/sku_activation_fixture');
  assert.ok(process.env.SKU_SOURCE_ACTIVATION_TEST_OWNER);
  const { Client } = apiRequire('pg');
  const c = new Client({ connectionString:url }); await c.connect();
  const schema = `sku_activation_${randomUUID().replaceAll('-','')}`;
  let createdSchema = false;
  const sqlCalls = [];
  const query = c.query.bind(c);
  c.query = (...args) => { sqlCalls.push(args[0]); return query(...args); };
  try {
    assert.ok(Number((await c.query('SHOW server_version_num')).rows[0].server_version_num) >= 180000);
    const marker = await c.query('SELECT owner_key FROM public.sku_activation_fixture_owner');
    assert.deepEqual(marker.rows,[{owner_key:process.env.SKU_SOURCE_ACTIVATION_TEST_OWNER}]);
    assert.match(schema,/^sku_activation_[a-f0-9]{32}$/);
    await c.query(`CREATE SCHEMA ${schema}`);
    createdSchema = true;
    await c.query(`SET search_path TO ${schema}`);
    await c.query(`
      CREATE TABLE sys_organizations(id serial PRIMARY KEY,org_code text UNIQUE,company_code text,org_type text,status text,parent_id int);
      CREATE TABLE brd_farms(farm_code text PRIMARY KEY,company_code text,mapped_site_code text,status text);
      CREATE TABLE brd_houses(house_code text PRIMARY KEY,farm_code text,house_type text,status text);
      CREATE TABLE product_grades(grade_code text PRIMARY KEY,grade_name text,weight_range text,sort_order int,is_saleable boolean,is_storable boolean,status text);
      CREATE TABLE packaging_specs(spec_code text PRIMARY KEY,qty_per_unit numeric,base_unit text,display_unit text,status text);
      CREATE TABLE md_product_varieties(variety_code text PRIMARY KEY,variety_name text,shell_color text,status text,effective_date date,expire_date date);
      CREATE TABLE mst_products(product_code text PRIMARY KEY,product_name text,product_name_zh text,unit_zh text,category_code text,has_grade boolean,has_spec boolean,variety_code text,status text);
      CREATE TABLE product_skus(sku_code text PRIMARY KEY,product_code text,grade_code text,spec_code text,variety_code text,product_name text,sku_name text,status text,effective_date date,expire_date date,UNIQUE(product_code,grade_code,spec_code));
      CREATE TABLE md_sku_org_scope(sku_code text,scope_type text,scope_code text,sale_enabled boolean,stock_enabled boolean,status text,effective_date date,expire_date date,UNIQUE(sku_code,scope_type,scope_code));
      CREATE TABLE inv_batches(id serial PRIMARY KEY);
    `);
    // Execute the reviewed migration itself, as the existing isolated bootstrap contract does.
    const ts = apiRequire('typescript');
    const filename = path.join(root,'apps/api/src/database/migrations/1794400001000-EggSourceProfiles.ts');
    const compiled = ts.transpileModule(fs.readFileSync(filename,'utf8'), {
      compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
    }).outputText;
    const loaded = new Module(filename); loaded.filename = filename;
    loaded.paths = Module._nodeModulePaths(path.dirname(filename)); loaded._compile(compiled,filename);
    const { EggSourceProfiles1794400001000 } = loaded.exports;
    const migration = new EggSourceProfiles1794400001000();
    await migration.up({query:async (sql,params)=>(await c.query(sql,params)).rows});
    await migration.up({query:async (sql,params)=>(await c.query(sql,params)).rows}); // schema idempotence
    const today = (await c.query('SELECT CURRENT_DATE::text AS today')).rows[0].today;
    const sourceDate = readManifest().source_effective_date;
    assert.ok(sourceDate <= today);
    async function reset() {
      await c.query(`TRUNCATE md_egg_source_profiles,md_sku_org_scope,product_skus,mst_products,md_product_varieties,packaging_specs,product_grades,brd_houses,brd_farms,sys_organizations RESTART IDENTITY`);
      const d = buildPlan(readManifest(),sourceDate).desired;
      for (const company of ['COMP-LAO-AGRI','COMP-LAO-XINGCHI']) await c.query("INSERT INTO sys_organizations(org_code,company_code,org_type,status) VALUES ($1,$1,'COMPANY','ACTIVE')",[company]);
      for (const row of [readManifest().companies[0],readManifest().companies[1]]) {
        const company = (await c.query('SELECT id FROM sys_organizations WHERE org_code=$1',[row.company_code])).rows[0];
        // Match the real baseline: SITE.company_code may be NULL; parent_id is authoritative.
        await c.query("INSERT INTO sys_organizations(org_code,org_type,status,parent_id) VALUES ($1,'SITE','ACTIVE',$2)",[row.site_code,company.id]);
        await c.query("INSERT INTO brd_farms VALUES ($1,$2,$3,'ACTIVE')",[row.farm_code,row.company_code,row.site_code]);
      }
      for (const profile of d.profiles) await c.query("INSERT INTO brd_houses VALUES ($1,$2,'LAYER','ACTIVE')",[profile.house_code,profile.farm_code]);
      for (const grade of ['GRADE_1','GRADE_2','GRADE_3','GRADE_4','GRADE_5']) await c.query("INSERT INTO product_grades VALUES ($1,$1,NULL,10,true,true,'ACTIVE')",[grade]);
      for (const [spec,factor] of [['LOOSE',1],['TRAY30',30],['TRAY36',36],['BOX360',360],['BOX720',720],['GIFT12',12],['GIFT24',24]]) {
        await c.query("INSERT INTO packaging_specs VALUES ($1,$2,'枚','包','ACTIVE')",[spec,factor]);
      }
      for (const product of d.products.filter(r=>r.variety_code===null)) await c.query(
        "INSERT INTO mst_products(product_code,product_name,unit_zh,variety_code,status) VALUES ($1,$2,'枚',NULL,'ACTIVE')",[product.product_code,'已存在名称不得改写']);
      for (const sku of d.skus.filter(r=>r.variety_code===null&&r.grade_code!=='GRADE_0')) await c.query(
        "INSERT INTO product_skus(sku_code,product_code,grade_code,spec_code,variety_code,status) VALUES ($1,$2,$3,$4,NULL,'ACTIVE')",[sku.sku_code,sku.product_code,sku.grade_code,sku.spec_code]);
      await c.query("INSERT INTO product_skus(sku_code,product_code,grade_code,spec_code,variety_code,status) VALUES ('SKU-OLD-G0','PRD-EGG-0','GRD-001','LOOSE',NULL,'ACTIVE')");
    }
    const inspect = () => runActivation(c,{mode:'inspect',effectiveDate:sourceDate});
    const apply = plan => runActivation(c,{mode:'apply',effectiveDate:sourceDate,confirm:CONFIRM,expectedPlanSha256:plan.plan_sha256});
    const count = async table => Number((await c.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n);
    await t.test('unit_zh-only production-shaped schema inspects read-only and dry-run rolls every new row back',async()=>{
      await reset();
      assert.deepEqual((await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='mst_products' AND column_name IN ('unit','unit_zh') ORDER BY column_name")).rows,
        [{column_name:'unit_zh'}]);
      // Reproduce the old projection's concrete failure on the owned fixture,
      // without exposing PostgreSQL's raw SQL/value-bearing error text.
      await assert.rejects(c.query("SELECT COALESCE(NULLIF(unit_zh,''),unit) FROM mst_products"), error => error.code === '42703');
      sqlCalls.length=0;
      const plan=await inspect(); assert.equal(sqlCalls[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      assert.equal(await count('md_egg_source_profiles'),0);
      const dry=await runActivation(c,{mode:'dry-run',effectiveDate:sourceDate});
      assert.equal(dry.plan_sha256,plan.plan_sha256);
      assert.equal(dry.rows.inserted.skus,91); assert.equal(dry.rows.inserted.varieties,2); assert.equal(dry.rows.inserted.profiles,11);
      assert.equal(await count('md_egg_source_profiles'),0); assert.equal(await count('product_skus'),36); assert.equal(await count('md_product_varieties'),0);
      assert.equal(await count('md_sku_org_scope'),0);
      assert.equal((await c.query("SELECT count(*)::int AS n FROM product_grades WHERE grade_code='GRADE_0'")).rows[0].n,0);
    });
    await t.test('absent or blank canonical unit never guesses a semantic unit when legacy column is absent',async()=>{
      for (const unit of [null,'','公斤']) {
        await reset();
        await c.query("UPDATE mst_products SET unit_zh=$1 WHERE product_code='PRD-EGG-1'",[unit]);
        await assert.rejects(inspect(),/PRODUCT_CONFLICT:PRD-EGG-1/);
        assert.equal(await count('md_egg_source_profiles'),0);
      }
    });
    await t.test('canonical unit_zh takes precedence and optional legacy unit is read only when canonical is blank',async()=>{
      await reset();
      await c.query('ALTER TABLE mst_products ADD COLUMN unit text');
      try {
        await c.query("UPDATE mst_products SET unit='公斤'");
        await inspect(); // Canonical 枚 wins over the conflicting legacy value.
        await c.query("UPDATE mst_products SET unit_zh='',unit='枚' WHERE product_code='PRD-EGG-1'");
        await inspect(); // Explicit old-row evidence, not an inferred default.
        await c.query("UPDATE mst_products SET unit_zh='',unit=NULL WHERE product_code='PRD-EGG-1'");
        await assert.rejects(inspect(),/PRODUCT_CONFLICT:PRD-EGG-1/);
      } finally { await c.query('ALTER TABLE mst_products DROP COLUMN unit'); }
    });
    await t.test('apply creates every required master, seven STANDARD grade0 SKUs and exact company assignments',async()=>{
      await reset(); const plan=await inspect(); const result=await apply(plan);
      assert.deepEqual(result.rows.inserted,{grades:1,varieties:2,products:2,skus:91,scopes:126,profiles:11});
      assert.equal(await count('md_egg_source_profiles'),11); assert.equal(await count('md_sku_org_scope'),126);
      assert.equal((await c.query('SELECT count(*)::int AS n FROM product_skus WHERE org_context_required')).rows[0].n,91);
      assert.equal((await c.query("SELECT org_context_required FROM product_skus WHERE sku_code='SKU-1-LOOSE'")).rows[0].org_context_required,false);
      assert.equal((await c.query("SELECT count(*)::int AS n FROM md_sku_org_scope WHERE NOT stock_enabled OR scope_type<>'COMPANY'")).rows[0].n,0);
      assert.equal((await c.query('SELECT count(*)::int AS n FROM md_sku_org_scope WHERE sale_enabled')).rows[0].n,35);
      assert.equal((await c.query('SELECT count(*)::int AS n FROM md_sku_org_scope WHERE NOT sale_enabled AND stock_enabled')).rows[0].n,91);
      assert.equal((await c.query('SELECT count(*)::int AS n FROM md_egg_source_profiles WHERE effective_date::text=$1',[sourceDate])).rows[0].n,11);
      assert.equal((await c.query('SELECT count(*)::int AS n FROM md_sku_org_scope o JOIN product_skus s USING(sku_code) WHERE o.sale_enabled AND s.org_context_required')).rows[0].n,0);
      assert.equal((await c.query("SELECT weight_range FROM product_grades WHERE grade_code='GRADE_0'")).rows[0].weight_range,null);
      assert.equal((await c.query("SELECT grade_code FROM product_skus WHERE sku_code='SKU-OLD-G0'")).rows[0].grade_code,'GRD-001');
      assert.equal((await c.query("SELECT product_name FROM mst_products WHERE product_code='PRD-EGG-0'")).rows[0].product_name,'已存在名称不得改写');
      const again=await apply(await inspect()); assert.ok(Object.values(again.rows.inserted).every(n=>n===0)); assert.equal(again.rows.activatedDrafts,0);
      await assert.rejects(apply(plan),/PLAN_OR_DATABASE_STATE_MOVED/);
    });
    await t.test('prepared DRAFT SKU activation derives its parent label and upgrades organization governance, not legacy SKU policy',async()=>{
      await reset();
      await c.query("INSERT INTO md_product_varieties(variety_code,variety_name,shell_color,status) VALUES ('EGG_RED','红壳蛋','RED','DRAFT')");
      await c.query("INSERT INTO mst_products(product_code,product_name,unit_zh,variety_code,status) VALUES ('PRD-EGG-RED','红壳蛋','枚','EGG_RED','DRAFT')");
      await c.query("INSERT INTO product_skus(sku_code,product_code,grade_code,spec_code,variety_code,sku_name,status) VALUES ('SKU-R-0-LOOSE','PRD-EGG-RED','GRADE_0','LOOSE','EGG_RED','已审核红蛋0号','DRAFT')");
      const result=await apply(await inspect()); assert.equal(result.rows.policyUpgrades,1);
      const [saved]=(await c.query("SELECT status,org_context_required,product_name FROM product_skus WHERE sku_code='SKU-R-0-LOOSE'")).rows;
      assert.deepEqual(saved,{status:'ACTIVE',org_context_required:true,product_name:'红壳蛋'});
      assert.equal((await c.query("SELECT org_context_required FROM product_skus WHERE sku_code='SKU-1-LOOSE'")).rows[0].org_context_required,false);
    });
    await t.test('real CAS detects changed dependency after inspect before any write',async()=>{
      await reset(); const plan=await inspect(); await c.query("UPDATE packaging_specs SET qty_per_unit=31 WHERE spec_code='TRAY30'");
      await assert.rejects(apply(plan),/PLAN_OR_DATABASE_STATE_MOVED/); assert.equal(await count('md_egg_source_profiles'),0);
    });
    await t.test('schema changes are part of CAS and stop activation before any catalog write',async()=>{
      await reset(); const plan=await inspect();
      await c.query('ALTER TABLE product_skus ADD COLUMN fixture_schema_drift text');
      try {
        await assert.rejects(apply(plan),/PLAN_OR_DATABASE_STATE_MOVED/);
        assert.equal(await count('md_egg_source_profiles'),0);
      } finally { await c.query('ALTER TABLE product_skus DROP COLUMN fixture_schema_drift'); }
    });
    await t.test('a late profile insertion failure rolls back grades, catalog and company scopes together',async()=>{
      await reset();
      await c.query(`CREATE FUNCTION fixture_fail_profile() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture late failure'; END $$;
        CREATE TRIGGER fixture_fail_profile BEFORE INSERT ON md_egg_source_profiles FOR EACH ROW EXECUTE FUNCTION fixture_fail_profile()`);
      try {
        const plan=await inspect(); await assert.rejects(apply(plan),/fixture late failure/);
        assert.equal(await count('product_skus'),36); assert.equal(await count('md_product_varieties'),0);
        assert.equal(await count('md_sku_org_scope'),0); assert.equal(await count('md_egg_source_profiles'),0);
        assert.equal((await c.query("SELECT count(*)::int AS n FROM product_grades WHERE grade_code='GRADE_0'")).rows[0].n,0);
      } finally { await c.query('DROP TRIGGER fixture_fail_profile ON md_egg_source_profiles; DROP FUNCTION fixture_fail_profile()'); }
    });
    await t.test('another company-assigned egg SKU cannot make the reviewed source catalogue ambiguous',async()=>{
      await reset();
      await c.query("INSERT INTO product_skus(sku_code,product_code,grade_code,spec_code,variety_code,status) VALUES ('UNREVIEWED','PRD-EGG-1','GRADE_2','LOOSE',NULL,'ACTIVE')");
      await c.query(`INSERT INTO md_sku_org_scope VALUES ('UNREVIEWED','COMPANY','COMP-LAO-AGRI',false,true,'ACTIVE','${sourceDate}',NULL)`);
      await assert.rejects(inspect(),/UNREVIEWED_COMPANY_CATALOG/);
    });
    for (const [label,sql,reason] of [
      ['house company spoof',"UPDATE brd_farms SET company_code='OTHER' WHERE farm_code='FARM-DP'",/SOURCE_ORGANIZATION/],
      ['rooster substitution',"UPDATE brd_houses SET house_type='ROOSTER' WHERE house_code='HOUSE_DP_01'",/SOURCE_ORGANIZATION/],
      ['inactive organization',"UPDATE sys_organizations SET status='INACTIVE' WHERE org_code='COMP-LAO-AGRI'",/MASTER_INACTIVE/],
      ['missing spec',"DELETE FROM packaging_specs WHERE spec_code='BOX720'",/UNIQUE_MASTER_REQUIRED/],
      ['wrong base unit',"UPDATE packaging_specs SET base_unit='公斤' WHERE spec_code='LOOSE'",/SPEC_UNIT/],
      ['frozen grade',"UPDATE product_grades SET status='FROZEN' WHERE grade_code='GRADE_1'",/GRADE_STATUS/],
      ['SKU identity collision',"UPDATE product_skus SET product_code='PRD-EGG-2' WHERE sku_code='SKU-1-LOOSE'",/SKU_IDENTITY_OR_STATUS/],
      ['frozen SKU',"UPDATE product_skus SET status='FROZEN' WHERE sku_code='SKU-1-LOOSE'",/SKU_IDENTITY_OR_STATUS/],
      ['company stock veto',`INSERT INTO md_sku_org_scope VALUES ('SKU-1-LOOSE','COMPANY','COMP-LAO-AGRI',true,false,'ACTIVE','${sourceDate}',NULL)`,/COMPANY_SCOPE_CONFLICT/],
      ['global grant',"INSERT INTO md_sku_org_scope VALUES ('SKU-1-LOOSE','ALL','',true,true,'ACTIVE',NULL,NULL)",/NONCOMPANY_SCOPE_REQUIRES_REVIEW/],
      ['overlapping profile',`INSERT INTO md_egg_source_profiles(profile_code,company_code,farm_code,site_code,house_code,product_mode,effective_date) VALUES ('OLD','COMP-LAO-AGRI','LPH_MENGSAI','SITE-MENGSAI-LAYER','HOUSE_MS_01','STANDARD','2000-01-01')`,/SOURCE_PERIOD_OVERLAP/],
    ]) await t.test(`reject ${label} without changing catalog identity`,async()=>{
      await reset(); await c.query(sql); const before=await count('product_skus');
      await assert.rejects(inspect(),reason); assert.equal(await count('product_skus'),before);
      assert.equal((await c.query("SELECT status FROM product_grades WHERE grade_code='GRADE_1'")).rowCount,1);
    });
    await t.test('existing confirmed grade0 weight is preserved and DRAFT activation never edits its boundary',async()=>{
      await reset(); await c.query("INSERT INTO product_grades VALUES ('GRADE_0','0号','BUSINESS_CONFIRMED',5,false,false,'DRAFT')");
      await apply(await inspect()); const [grade]=(await c.query("SELECT * FROM product_grades WHERE grade_code='GRADE_0'")).rows;
      assert.equal(grade.weight_range,'BUSINESS_CONFIRMED'); assert.equal(grade.status,'ACTIVE'); assert.equal(grade.is_storable,true);
    });
    await t.test('missing schema aborts and rolls back, never catches missing-table then continues',async()=>{
      await reset(); await c.query('ALTER TABLE md_product_varieties RENAME TO temporarily_missing');
      try { await assert.rejects(inspect(),error=>error.code==='42P01'); assert.equal((await c.query('SELECT 1 AS ok')).rows[0].ok,1); }
      finally { await c.query('ALTER TABLE temporarily_missing RENAME TO md_product_varieties'); }
    });
  } finally {
    try {
      await c.query('ROLLBACK');
      // Drop only a schema this invocation actually created after the owner
      // guard passed, never an existing schema or the database's public data.
      if (createdSchema) {
        assert.match(schema,/^sku_activation_[a-f0-9]{32}$/);
        await c.query(`SET search_path TO public; DROP SCHEMA ${schema} CASCADE`);
      }
    } finally { await c.end(); }
  }
});
