import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { containerProgram, sanitizeCatalogSnapshot } from './sku-source-activation-transport.mjs';
import { buildPlan, CONFIRM, explicitDbConfig, manifestSha256, parseArgs, readManifest, runActivation, validDate, validateManifest } from './sku-source-activation.mjs';

const legacyCode=(n,spec='LOOSE')=>`LEGACY-ACTUAL-${n}-${spec}`;
function mixedState() {
  const specs=['LOOSE','TRAY30','TRAY36','BOX360','BOX720','GIFT12','GIFT24'];
  const products=Array.from({length:5},(_,i)=>({product_code:i<2?`PRD-EGG-GRADE_${i+1}`:`PRD-EGG-${i+1}`,
    product_name:`原始产品${i+1}`,product_name_zh:null,base_unit:'枚',variety_code:null,status:'ACTIVE',category_code:'EGG'}));
  return {database:{today:'2026-11-12'},products,skus:products.flatMap((p,i)=>specs.map(spec=>({
    sku_code:legacyCode(i+1,spec),product_code:p.product_code,grade_code:`GRADE_${i+1}`,spec_code:spec,
    variety_code:null,status:'ACTIVE',org_context_required:false,sku_name:`原始SKU ${i+1} ${spec}`,
    product_name:p.product_name,effective_date:null,expire_date:null}))) };
}
const purePlan=(state=mixedState())=>buildPlan(readManifest(),'2026-11-10',state);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const apiRequire = createRequire(path.join(root, 'apps/api/package.json'));

test('reviewed manifest defines STANDARD42, VARIANT84, eleven houses and no ALL/sales grants', () => {
  const p = purePlan();
  assert.equal(p.desired.profiles.length, 11);
  assert.equal(p.desired.skus.length, 91);
  assert.equal(p.desired.legacySkus.length,35);
  assert.equal(p.legacy_identity_map.length,35);
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
    m => { m.legacy_standard_selection.expected_count=34; },
    m => { m.approved_parent_restorations[0].unit_zh='公斤'; },
    m => { m.approved_parent_restorations[0].product_name='未经批准名称'; },
    m => { m.approved_parent_restorations[0].has_spec=false; },
    m => { m.approved_parent_restorations[0].product_code='UNAPPROVED'; },
    m => { m.approved_parent_restorations.push({...m.approved_parent_restorations[0],product_code:'PRD-EGG-6'}); },
    m => { m.variant_products[0]='INVENTED'; },
    m => { m.effective_date = '2026-11-12'; },
  ]) {
    const m = readManifest(); mutate(m);
    assert.throws(() => validateManifest(m, '2026-11-10'), /SKU_ACTIVATION_HOLD/);
  }
});
test('valid dates round-trip and the plan includes effective date, manifest and DB state', () => {
  for (const d of ['2026-02-30','0000-01-01','2026/11/11','2026-1-1','2026-11-11T00:00:00Z']) assert.equal(validDate(d), false);
  assert.equal(validDate('2028-02-29'), true);
  const a = purePlan();
  assert.notEqual(a.plan_sha256, purePlan({...mixedState(),probe:'moved'}).plan_sha256);
  assert.throws(() => buildPlan(readManifest(), '2026-11-12', mixedState()), /SOURCE_EFFECTIVE_DATE_NOT_REVIEWED/);
  assert.equal(a.manifest_sha256, manifestSha256());
});
test('pure plans require complete actual state and never infer legacy naming or choose a first row',()=>{
  assert.throws(()=>buildPlan(readManifest(),'2026-11-10'),/LEGACY_CATALOG_STATE_REQUIRED/);
  const a=mixedState(); a.skus[0].sku_code='ARBITRARY-HISTORIC-IDENTITY';
  assert.equal(purePlan(a).legacy_identity_map.some(r=>r.sku_code==='ARBITRARY-HISTORIC-IDENTITY'),true);
  for (const [change,reason] of [
    [s=>s.skus.shift(),/LEGACY_STANDARD_TUPLE_MISSING/],
    [s=>s.skus.push({...s.skus[0],sku_code:'SECOND-IDENTITY'}),/LEGACY_STANDARD_TUPLE_AMBIGUOUS/],
    [s=>s.products.shift(),/LEGACY_PARENT_REQUIRED/],
    [s=>s.skus[0].variety_code='EGG_RED',/LEGACY_VARIETY_MISMATCH/],
    [s=>s.products[0].variety_code='EGG_RED',/LEGACY_VARIETY_MISMATCH/],
    [s=>s.skus[0].org_context_required=true,/LEGACY_SKU_POLICY_CHANGED/],
    [s=>s.skus[0].effective_date='2099-01-01',/MASTER_DATE/],
    [s=>s.products[0].expire_date='2000-01-01',/MASTER_DATE/],
  ]) {const state=mixedState();change(state);assert.throws(()=>purePlan(state),reason);}
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
    assert.ok(Number((await c.query('SHOW server_version_num')).rows[0].server_version_num) >= 160000);
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
      const d = buildPlan(readManifest(),sourceDate,mixedState()).desired;
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
      for (const product of [...mixedState().products,...d.products.filter(r=>r.variety_code===null)]) await c.query(
        "INSERT INTO mst_products(product_code,product_name,unit_zh,variety_code,status,category_code) VALUES ($1,$2,'枚',NULL,'ACTIVE','EGG')",[product.product_code,'已存在名称不得改写']);
      for (const sku of mixedState().skus) await c.query(
        "INSERT INTO product_skus(sku_code,product_code,grade_code,spec_code,variety_code,status,sku_name,product_name,effective_date) VALUES ($1,$2,$3,$4,NULL,'ACTIVE',$5,$6,'2020-01-02')",
        [sku.sku_code,sku.product_code,sku.grade_code,sku.spec_code,sku.sku_name,'原始冗余名']);
      await c.query("INSERT INTO product_skus(sku_code,product_code,grade_code,spec_code,variety_code,status) VALUES ('SKU-OLD-G0','PRD-EGG-0','GRD-001','LOOSE',NULL,'ACTIVE')");
    }
    const inspectRaw = () => runActivation(c,{mode:'inspect',effectiveDate:sourceDate});
    const inspect = async () => {
      const result=await inspectRaw();
      if (!result.plan_ready) throw new Error(`SKU_ACTIVATION_HOLD=${result.catalog_report.reason}`);
      return result;
    };
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
        await c.query("UPDATE mst_products SET unit_zh=$1 WHERE product_code='PRD-EGG-GRADE_1'",[unit]);
        await assert.rejects(inspect(),/LEGACY_PARENT_POLICY/);
        assert.equal(await count('md_egg_source_profiles'),0);
      }
    });
    await t.test('canonical unit_zh takes precedence and optional legacy unit is read only when canonical is blank',async()=>{
      await reset();
      await c.query('ALTER TABLE mst_products ADD COLUMN unit text');
      try {
        await c.query("UPDATE mst_products SET unit='公斤'");
        await inspect(); // Canonical 枚 wins over the conflicting legacy value.
        await c.query("UPDATE mst_products SET unit_zh='',unit='枚' WHERE product_code='PRD-EGG-GRADE_1'");
        await inspect(); // Explicit old-row evidence, not an inferred default.
        await c.query("UPDATE mst_products SET unit_zh='',unit=NULL WHERE product_code='PRD-EGG-GRADE_1'");
        await assert.rejects(inspect(),/LEGACY_PARENT_POLICY/);
      } finally { await c.query('ALTER TABLE mst_products DROP COLUMN unit'); }
    });
    await t.test('apply creates every required master, seven STANDARD grade0 SKUs and exact company assignments',async()=>{
      await reset(); const plan=await inspect();
      const beforeLegacy=(await c.query("SELECT to_jsonb(s) AS row FROM product_skus s WHERE grade_code IN ('GRADE_1','GRADE_2','GRADE_3','GRADE_4','GRADE_5') ORDER BY sku_code")).rows;
      const beforeProducts=(await c.query("SELECT to_jsonb(p) AS row FROM mst_products p WHERE product_code<>'PRD-EGG-0' ORDER BY product_code")).rows;
      const result=await apply(plan);
      assert.deepEqual((await c.query("SELECT to_jsonb(s) AS row FROM product_skus s WHERE sku_code LIKE 'LEGACY-ACTUAL-%' ORDER BY sku_code")).rows,beforeLegacy);
      assert.deepEqual((await c.query("SELECT to_jsonb(p) AS row FROM mst_products p WHERE product_code IN ('PRD-EGG-GRADE_1','PRD-EGG-GRADE_2','PRD-EGG-3','PRD-EGG-4','PRD-EGG-5') ORDER BY product_code")).rows,beforeProducts);
      assert.equal(result.legacy_identity_map.length,35);assert.equal(result.plan_ready,true);
      assert.deepEqual(result.rows.inserted,{grades:1,varieties:2,products:2,skus:91,scopes:126,profiles:11});
      assert.equal(await count('md_egg_source_profiles'),11); assert.equal(await count('md_sku_org_scope'),126);
      assert.equal((await c.query('SELECT count(*)::int AS n FROM product_skus WHERE org_context_required')).rows[0].n,91);
      assert.equal((await c.query("SELECT org_context_required FROM product_skus WHERE sku_code='LEGACY-ACTUAL-1-LOOSE'")).rows[0].org_context_required,false);
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
      assert.equal((await c.query("SELECT org_context_required FROM product_skus WHERE sku_code='LEGACY-ACTUAL-1-LOOSE'")).rows[0].org_context_required,false);
    });
    await t.test('real CAS detects changed dependency after inspect before any write',async()=>{
      await reset(); const plan=await inspect(); await c.query("UPDATE packaging_specs SET qty_per_unit=31 WHERE spec_code='TRAY30'");
      await assert.rejects(apply(plan),/PLAN_OR_DATABASE_STATE_MOVED/); assert.equal(await count('md_egg_source_profiles'),0);
    });
    await t.test('inspect failures emit bounded nonfinancial inventory without an executable plan hash',async()=>{
      await reset();await c.query("DELETE FROM product_skus WHERE sku_code='LEGACY-ACTUAL-1-LOOSE'");
      const result=await inspectRaw();assert.equal(result.plan_ready,false);
      assert.equal(result.catalog_report.reason,'LEGACY_STANDARD_TUPLE_MISSING');
      assert.equal(Object.hasOwn(result,'plan_sha256'),false);
      assert.equal(result.catalog_report.candidates.length,34);
      assert.ok(!JSON.stringify(result).includes('原始SKU'));assert.ok(!JSON.stringify(result).includes('已存在名称'));
      await assert.rejects(apply(result),/EXPLICIT_APPLY/);
      assert.equal(await count('md_egg_source_profiles'),0);
    });
    for (const [name,sql,reason] of [
      ['cross-product ambiguity',"INSERT INTO mst_products(product_code,unit_zh,variety_code,status,category_code) VALUES ('OTHER-LEGACY','枚',NULL,'ACTIVE','EGG'); INSERT INTO product_skus(sku_code,product_code,grade_code,spec_code,variety_code,status) VALUES ('SECOND-LEGACY','OTHER-LEGACY','GRADE_1','LOOSE',NULL,'ACTIVE')",/LEGACY_STANDARD_TUPLE_AMBIGUOUS/],
      ['missing parent',"DELETE FROM mst_products WHERE product_code='PRD-EGG-GRADE_1'",/LEGACY_PARENT_REQUIRED/],
      ['NULL SKU with colored parent',"UPDATE mst_products SET variety_code='EGG_RED' WHERE product_code='PRD-EGG-GRADE_1'",/LEGACY_VARIETY_MISMATCH/],
      ['colored SKU with NULL parent',"UPDATE product_skus SET variety_code='EGG_RED' WHERE sku_code='LEGACY-ACTUAL-1-LOOSE'",/LEGACY_VARIETY_MISMATCH/],
      ['inactive parent',"UPDATE mst_products SET status='INACTIVE' WHERE product_code='PRD-EGG-GRADE_1'",/LEGACY_PARENT_POLICY/],
      ['wrong category',"UPDATE mst_products SET category_code='OTHER' WHERE product_code='PRD-EGG-GRADE_1'",/LEGACY_PARENT_POLICY/],
      ['NULL authoritative category',"UPDATE mst_products SET category_code=NULL WHERE product_code='PRD-EGG-GRADE_1'",/LEGACY_PARENT_POLICY/],
      ['future SKU',"UPDATE product_skus SET effective_date='2099-01-01' WHERE sku_code='LEGACY-ACTUAL-1-LOOSE'",/MASTER_DATE/],
      ['expired SKU',"UPDATE product_skus SET expire_date='2000-01-01' WHERE sku_code='LEGACY-ACTUAL-1-LOOSE'",/MASTER_DATE/],
      ['legacy org policy changed',"UPDATE product_skus SET org_context_required=true WHERE sku_code='LEGACY-ACTUAL-1-LOOSE'",/LEGACY_SKU_POLICY_CHANGED/],
    ]) await t.test(`actual catalog refuses ${name}`,async()=>{
      await reset();await c.query(sql);await assert.rejects(inspect(),reason);
      assert.equal((await inspectRaw()).plan_ready,false);
      assert.equal(await count('md_egg_source_profiles'),0);assert.equal(await count('md_sku_org_scope'),0);
    });
    await t.test('HOLD report exposes actual coded category and four validity dates without relaxing selection',async()=>{
      await reset();await c.query('ALTER TABLE mst_products ADD COLUMN effective_date date, ADD COLUMN expire_date date');
      try {
        await c.query("UPDATE mst_products SET category_code='OLD-EGG-CATEGORY',effective_date='2020-02-29',expire_date='2026-11-01' WHERE product_code='PRD-EGG-GRADE_1'");
        await c.query("UPDATE product_skus SET effective_date='2099-01-01',expire_date='2099-12-31' WHERE sku_code='LEGACY-ACTUAL-1-LOOSE'");
        const report=await inspectRaw();assert.equal(report.plan_ready,false);assert.equal(Object.hasOwn(report,'plan_sha256'),false);
        const row=report.catalog_report.candidates.find(r=>r.sku_code==='LEGACY-ACTUAL-1-LOOSE');
        assert.equal(row.category_code,'OLD-EGG-CATEGORY');assert.equal(row.effective_date,'2099-01-01');
        assert.equal(row.expire_date,'2099-12-31');assert.equal(row.parent_effective_date,'2020-02-29');
        assert.equal(row.parent_expire_date,'2026-11-01');assert.equal(Object.keys(row).length,15);
        assert.equal(sanitizeCatalogSnapshot(report).plan_ready,false);
        await assert.rejects(apply(report),/EXPLICIT_APPLY/);
        assert.equal(await count('md_egg_source_profiles'),0);assert.equal(await count('md_sku_org_scope'),0);
      } finally {await c.query('ALTER TABLE mst_products DROP COLUMN effective_date, DROP COLUMN expire_date');}
    });
    await t.test('absence of an optional category column never guesses a category or alters existing rows',async()=>{
      await reset();await c.query('ALTER TABLE mst_products DROP COLUMN category_code');
      try {assert.equal((await inspect()).plan_ready,true);} finally {await c.query('ALTER TABLE mst_products ADD COLUMN category_code text');}
    });
    for (const [name,sql] of [
      ['actual legacy parent name',"UPDATE mst_products SET product_name='并发修改名称' WHERE product_code='PRD-EGG-GRADE_1'"],
      ['actual SKU label',"UPDATE product_skus SET sku_name='并发修改名称' WHERE sku_code='LEGACY-ACTUAL-1-LOOSE'"],
      ['nonselected candidate status',"UPDATE product_skus SET status='FROZEN' WHERE sku_code='UNSCOPED-COLORED'"],
      ['nonselected candidate parent',"UPDATE mst_products SET product_name='并发修改名称' WHERE product_code='UNSCOPED-PARENT'"],
      ['known company catalog',"INSERT INTO md_sku_org_scope VALUES ('OUTSIDE-MATRIX','COMPANY','COMP-LAO-AGRI',false,false,'INACTIVE',NULL,NULL)"],
    ]) await t.test(`CAS includes ${name}`,async()=>{
      await reset();
      await c.query("INSERT INTO mst_products(product_code,unit_zh,variety_code,status,category_code) VALUES ('UNSCOPED-PARENT','枚','EGG_PINK','ACTIVE','EGG')");
      await c.query("INSERT INTO product_skus(sku_code,product_code,grade_code,spec_code,variety_code,status) VALUES ('UNSCOPED-COLORED','UNSCOPED-PARENT','GRADE_1','LOOSE','EGG_PINK','ACTIVE')");
      const plan=await inspect();await c.query(sql);
      await assert.rejects(apply(plan),/PLAN_OR_DATABASE_STATE_MOVED/);
      assert.equal(await count('md_egg_source_profiles'),0);
    });
    await t.test('a newly committed arbitrary-parent candidate between inspect/apply is rejected before writes',async()=>{
      await reset();const plan=await inspect();
      const other=new Client({connectionString:url});await other.connect();
      try {
        await other.query(`SET search_path TO ${schema}`);
        await other.query("INSERT INTO mst_products(product_code,unit_zh,variety_code,status,category_code) VALUES ('LATE-PARENT','枚',NULL,'ACTIVE','EGG')");
        await other.query("INSERT INTO product_skus(sku_code,product_code,grade_code,spec_code,variety_code,status) VALUES ('LATE-SKU','LATE-PARENT','GRADE_1','LOOSE',NULL,'ACTIVE')");
        await assert.rejects(apply(plan),/LEGACY_STANDARD_TUPLE_AMBIGUOUS/);
        assert.equal(await count('md_egg_source_profiles'),0);
      } finally {await other.end();}
    });
    await t.test('write fence precedes every snapshot and blocks noncooperating SKU/parent/scope writers',async()=>{
      await reset();const plan=await inspect();
      const other=new Client({connectionString:url});await other.connect();
      const prior=c.query;let probed=false;
      try {
        await other.query(`SET search_path TO ${schema}`);await other.query("SET lock_timeout='100ms'");
        c.query=async(sql,...args)=>{
          if (!probed && sql.startsWith('SELECT table_name,column_name')) {
            probed=true;
            for (const statement of [
              "INSERT INTO product_skus(sku_code,product_code,grade_code,spec_code,variety_code,status) VALUES ('CONCURRENT-SKU','PRD-EGG-GRADE_1','GRADE_2','LOOSE',NULL,'ACTIVE')",
              "UPDATE mst_products SET product_name='concurrent' WHERE product_code='PRD-EGG-GRADE_1'",
              "INSERT INTO md_sku_org_scope VALUES ('LEGACY-ACTUAL-1-LOOSE','COMPANY','COMP-LAO-AGRI',true,true,'ACTIVE',NULL,NULL)",
            ]) await assert.rejects(other.query(statement),e=>e.code==='55P03');
          }
          return prior(sql,...args);
        };
        sqlCalls.length=0;await apply(plan);assert.equal(probed,true);
        const fence=sqlCalls.findIndex(s=>s.startsWith('LOCK TABLE mst_products, product_skus, md_sku_org_scope'));
        const firstSelect=sqlCalls.findIndex(s=>s.startsWith('SELECT'));
        assert.ok(fence>0 && fence<firstSelect);assert.ok(sqlCalls.includes("SET LOCAL lock_timeout='5s'"));
        assert.equal((await c.query("SELECT count(*)::int AS n FROM product_skus WHERE sku_code='CONCURRENT-SKU'")).rows[0].n,0);
      } finally {c.query=prior;await other.end();}
    });
    await t.test('exact stdin transport performs real read-only PG18 queries for ready35 and non-executable HOLD reports',async()=>{
      await reset();
      const preload=`import Module,{createRequire} from 'node:module';
        const {Client}=createRequire(${JSON.stringify(path.join(root,'apps/api/package.json'))})('pg');
        const load=Module._load;
        Module._load=function(request,parent,...args){
          if(request==='pg' && parent.filename==='/app/package.json') return {Client:class extends Client {
            constructor(config){super({...config,options:${JSON.stringify(`-c search_path=${schema} -c default_transaction_read_only=on`)}});}
          }};
          return load.call(this,request,parent,...args);
        };`;
      const core=fs.readFileSync(path.join(root,'scripts/ops/sku-source-activation.mjs'),'utf8');
      const execute=()=>spawnSync(process.execPath,['--input-type=module','--import',`data:text/javascript;base64,${Buffer.from(preload).toString('base64')}`],{
        input:containerProgram(core),encoding:'utf8',env:{PATH:process.env.PATH,
          DB_HOST:parsed.hostname,DB_PORT:parsed.port,DB_USER:decodeURIComponent(parsed.username),DB_PASSWORD:decodeURIComponent(parsed.password),DB_NAME:parsed.pathname.slice(1),
          SKU_ACTIVATION_OPTIONS_B64:Buffer.from(JSON.stringify({mode:'inspect',effectiveDate:sourceDate})).toString('base64'),
          SKU_ACTIVATION_MANIFEST_B64:Buffer.from(JSON.stringify(readManifest())).toString('base64')},
      });
      const ready=execute();assert.equal(ready.status,0,ready.stderr);assert.equal(ready.stderr,'');
      const readyReceipt=JSON.parse(ready.stdout);assert.equal(sanitizeCatalogSnapshot(readyReceipt).plan_ready,true);
      assert.equal(readyReceipt.legacy_identity_map.length,35);assert.equal(await count('md_sku_org_scope'),0);
      await c.query("DELETE FROM product_skus WHERE sku_code='LEGACY-ACTUAL-1-LOOSE'");
      const hold=execute();assert.equal(hold.status,0,hold.stderr);assert.equal(hold.stderr,'');
      const report=JSON.parse(hold.stdout);assert.equal(sanitizeCatalogSnapshot(report).plan_ready,false);
      assert.equal(report.catalog_report.reason,'LEGACY_STANDARD_TUPLE_MISSING');assert.equal(Object.hasOwn(report,'plan_sha256'),false);
      assert.equal(await count('md_egg_source_profiles'),0);assert.equal(await count('md_sku_org_scope'),0);
      assert.ok(!hold.stdout.includes('原始SKU'));assert.ok(!ready.stdout.includes('已存在名称'));
      await missingApprovedParents();
      const repair=execute();assert.equal(repair.status,0,repair.stderr);
      const repairReceipt=JSON.parse(repair.stdout);assert.equal(sanitizeCatalogSnapshot(repairReceipt).plan_ready,true);
      assert.equal(repairReceipt.approved_parent_restoration_count,5);
      assert.equal(repairReceipt.approved_parent_restorations.length,5);
      assert.equal((await c.query("SELECT count(*)::int AS n FROM mst_products WHERE product_code IN ('PRD-EGG-1','PRD-EGG-2','PRD-EGG-3','PRD-EGG-4','PRD-EGG-5')")).rows[0].n,0);

    });
    await t.test('an existing noncooperating writer makes the bounded catalog fence fail without writes',async()=>{
      await reset();const plan=await inspect();
      const other=new Client({connectionString:url});await other.connect();
      try {
        await other.query(`SET search_path TO ${schema}`);await other.query('BEGIN');
        await other.query('LOCK TABLE product_skus IN ROW EXCLUSIVE MODE');
        await assert.rejects(apply(plan),e=>e.code==='55P03');
        assert.equal(await count('md_egg_source_profiles'),0);assert.equal(await count('md_sku_org_scope'),0);
      } finally {await other.query('ROLLBACK');await other.end();}
    });
    async function missingApprovedParents(indices=[1,2,3,4,5]) {
      await reset();
      await c.query("UPDATE product_skus SET product_code='PRD-EGG-1' WHERE grade_code='GRADE_1'; UPDATE product_skus SET product_code='PRD-EGG-2' WHERE grade_code='GRADE_2'");
      await c.query("UPDATE product_skus SET sku_code='SKU-'||substring(grade_code from 7)||'-'||spec_code WHERE grade_code IN ('GRADE_1','GRADE_2','GRADE_3','GRADE_4','GRADE_5')");
      for(const n of [1,2]) await c.query("INSERT INTO mst_products(product_code,product_name,unit_zh,variety_code,status,category_code) VALUES ($1,'原存父档','枚',NULL,'ACTIVE','EGG')",[`PRD-EGG-${n}`]);
      await c.query('DELETE FROM mst_products WHERE product_code=ANY($1)',[indices.map(n=>`PRD-EGG-${n}`)]);
    }
    await t.test('explicit approved five missing parent repair is atomic and preserves actual legacy35 exactly',async()=>{
      await missingApprovedParents();
      const before=(await c.query("SELECT to_jsonb(s) AS row FROM product_skus s WHERE variety_code IS NULL AND grade_code IN ('GRADE_1','GRADE_2','GRADE_3','GRADE_4','GRADE_5') ORDER BY sku_code")).rows;
      assert.equal(before.length,35);
      const plan=await inspect();assert.equal(plan.approved_parent_restorations.length,5);
      assert.equal(plan.approved_parent_restoration_count,5);assert.equal(sanitizeCatalogSnapshot(plan).approved_parent_restorations.length,5);
      const dry=await runActivation(c,{mode:'dry-run',effectiveDate:sourceDate});assert.equal(dry.rows.restoredParents,5);
      assert.equal((await c.query("SELECT count(*)::int AS n FROM mst_products WHERE product_code IN ('PRD-EGG-1','PRD-EGG-2','PRD-EGG-3','PRD-EGG-4','PRD-EGG-5')")).rows[0].n,0);
      assert.equal(await count('md_sku_org_scope'),0);assert.equal(await count('md_egg_source_profiles'),0);
      const result=await apply(plan);assert.equal(result.rows.restoredParents,5);
      assert.deepEqual((await c.query("SELECT to_jsonb(s) AS row FROM product_skus s WHERE variety_code IS NULL AND grade_code IN ('GRADE_1','GRADE_2','GRADE_3','GRADE_4','GRADE_5') ORDER BY sku_code")).rows,before);
      assert.equal((await c.query("SELECT count(*)::int AS n FROM mst_products WHERE product_code IN ('PRD-EGG-1','PRD-EGG-2','PRD-EGG-3','PRD-EGG-4','PRD-EGG-5') AND unit_zh='枚' AND variety_code IS NULL AND category_code='EGG' AND has_grade AND has_spec AND status='ACTIVE'")).rows[0].n,5);
      assert.equal(result.rows.inserted.skus,91);assert.equal(result.rows.inserted.scopes,126);assert.equal(result.rows.inserted.profiles,11);
      assert.equal((await inspect()).approved_parent_restorations.length,0);
    });
    await t.test('partial missing approved parents restore only those rows and never overwrite existing parents',async()=>{
      await missingApprovedParents([1,3]);
      const before=(await c.query("SELECT to_jsonb(p) AS row FROM mst_products p WHERE product_code IN ('PRD-EGG-2','PRD-EGG-4','PRD-EGG-5') ORDER BY product_code")).rows;
      const result=await apply(await inspect());assert.equal(result.rows.restoredParents,2);
      assert.deepEqual((await c.query("SELECT to_jsonb(p) AS row FROM mst_products p WHERE product_code IN ('PRD-EGG-2','PRD-EGG-4','PRD-EGG-5') ORDER BY product_code")).rows,before);
    });
    for(const [name,sql,reason] of [
      ['unapproved missing parent',"UPDATE product_skus SET product_code='UNAPPROVED-MISSING' WHERE grade_code='GRADE_1'",/LEGACY_PARENT_REQUIRED/],
      ['wrong missing parent grade reference',"UPDATE product_skus SET product_code='PRD-EGG-2' WHERE grade_code='GRADE_1'",/RESTORATION_SKU_REFERENCE_CONFLICT/],
      ['existing DRAFT parent',"INSERT INTO mst_products(product_code,unit_zh,variety_code,status,category_code) VALUES ('PRD-EGG-1','枚',NULL,'DRAFT','EGG')",/LEGACY_PARENT_POLICY/],
      ['existing parent wrong unit',"INSERT INTO mst_products(product_code,unit_zh,variety_code,status,category_code) VALUES ('PRD-EGG-1','公斤',NULL,'ACTIVE','EGG')",/LEGACY_PARENT_POLICY/],
      ['existing colored parent',"INSERT INTO mst_products(product_code,unit_zh,variety_code,status,category_code) VALUES ('PRD-EGG-1','枚','EGG_RED','ACTIVE','EGG')",/LEGACY_VARIETY_MISMATCH/],
    ]) await t.test(`approved repair refuses ${name} without catalog writes`,async()=>{
      await missingApprovedParents();await c.query(sql);
      const before=(await c.query('SELECT to_jsonb(p) AS row FROM mst_products p ORDER BY product_code')).rows;
      await assert.rejects(inspect(),reason);assert.equal((await inspectRaw()).plan_ready,false);
      assert.deepEqual((await c.query('SELECT to_jsonb(p) AS row FROM mst_products p ORDER BY product_code')).rows,before);
      assert.equal(await count('md_egg_source_profiles'),0);assert.equal(await count('md_sku_org_scope'),0);
    });
    await t.test('approved parent appearing after inspect invalidates CAS before any writes',async()=>{
      await missingApprovedParents();const plan=await inspect();
      await c.query("INSERT INTO mst_products(product_code,product_name,unit_zh,variety_code,status,category_code) VALUES ('PRD-EGG-1','并发父档','枚',NULL,'ACTIVE','EGG')");
      await assert.rejects(apply(plan),/PLAN_OR_DATABASE_STATE_MOVED/);assert.equal(await count('md_egg_source_profiles'),0);
    });
    await t.test('restored parent name tampering fails the exact postcondition and rolls everything back',async()=>{
      await missingApprovedParents();
      await c.query(`CREATE FUNCTION fixture_tamper_parent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.product_code='PRD-EGG-1' THEN NEW.product_name:='unapproved'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER fixture_tamper_parent BEFORE INSERT ON mst_products FOR EACH ROW EXECUTE FUNCTION fixture_tamper_parent()`);
      try {await assert.rejects(apply(await inspect()),/POST_PARENT_RESTORATION/);
        assert.equal((await c.query("SELECT count(*)::int AS n FROM mst_products WHERE product_code IN ('PRD-EGG-1','PRD-EGG-2','PRD-EGG-3','PRD-EGG-4','PRD-EGG-5')")).rows[0].n,0);
        assert.equal(await count('product_skus'),36);assert.equal(await count('md_sku_org_scope'),0);assert.equal(await count('md_egg_source_profiles'),0);
      } finally {await c.query('DROP TRIGGER fixture_tamper_parent ON mst_products; DROP FUNCTION fixture_tamper_parent()');}
    });
    await t.test('late failure rolls back restored five parents plus managed91 and all source scopes',async()=>{
      await missingApprovedParents();
      await c.query(`CREATE FUNCTION fixture_fail_restoration() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture restoration late failure'; END $$;
        CREATE TRIGGER fixture_fail_restoration BEFORE INSERT ON md_egg_source_profiles FOR EACH ROW EXECUTE FUNCTION fixture_fail_restoration()`);
      try {await assert.rejects(apply(await inspect()),/fixture restoration late failure/);
        assert.equal((await c.query("SELECT count(*)::int AS n FROM mst_products WHERE product_code IN ('PRD-EGG-1','PRD-EGG-2','PRD-EGG-3','PRD-EGG-4','PRD-EGG-5')")).rows[0].n,0);
        assert.equal(await count('product_skus'),36);assert.equal(await count('md_sku_org_scope'),0);assert.equal(await count('md_egg_source_profiles'),0);
      } finally {await c.query('DROP TRIGGER fixture_fail_restoration ON md_egg_source_profiles; DROP FUNCTION fixture_fail_restoration()');}
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
      await c.query("INSERT INTO product_skus(sku_code,product_code,grade_code,spec_code,variety_code,status) VALUES ('UNREVIEWED','PRD-EGG-GRADE_1','GRADE_2','LOOSE',NULL,'ACTIVE')");
      await c.query(`INSERT INTO md_sku_org_scope VALUES ('UNREVIEWED','COMPANY','COMP-LAO-AGRI',false,true,'ACTIVE','${sourceDate}',NULL)`);
      await assert.rejects(inspect(),/LEGACY_STANDARD_TUPLE_AMBIGUOUS/);
    });
    for (const [label,sql,reason] of [
      ['house company spoof',"UPDATE brd_farms SET company_code='OTHER' WHERE farm_code='FARM-DP'",/SOURCE_ORGANIZATION/],
      ['rooster substitution',"UPDATE brd_houses SET house_type='ROOSTER' WHERE house_code='HOUSE_DP_01'",/SOURCE_ORGANIZATION/],
      ['inactive organization',"UPDATE sys_organizations SET status='INACTIVE' WHERE org_code='COMP-LAO-AGRI'",/MASTER_INACTIVE/],
      ['missing spec',"DELETE FROM packaging_specs WHERE spec_code='BOX720'",/UNIQUE_MASTER_REQUIRED/],
      ['wrong base unit',"UPDATE packaging_specs SET base_unit='公斤' WHERE spec_code='LOOSE'",/SPEC_UNIT/],
      ['frozen grade',"UPDATE product_grades SET status='FROZEN' WHERE grade_code='GRADE_1'",/GRADE_STATUS/],
      ['SKU identity collision',"UPDATE product_skus SET sku_code='SKU-R-1-LOOSE' WHERE sku_code='LEGACY-ACTUAL-1-LOOSE'",/SKU_IDENTITY_OR_STATUS/],
      ['frozen SKU',"UPDATE product_skus SET status='FROZEN' WHERE sku_code='LEGACY-ACTUAL-1-LOOSE'",/LEGACY_STANDARD_TUPLE_MISSING/],
      ['company stock veto',`INSERT INTO md_sku_org_scope VALUES ('LEGACY-ACTUAL-1-LOOSE','COMPANY','COMP-LAO-AGRI',true,false,'ACTIVE','${sourceDate}',NULL)`,/COMPANY_SCOPE_CONFLICT/],
      ['global grant',"INSERT INTO md_sku_org_scope VALUES ('LEGACY-ACTUAL-1-LOOSE','ALL','',true,true,'ACTIVE',NULL,NULL)",/NONCOMPANY_SCOPE_REQUIRES_REVIEW/],
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
