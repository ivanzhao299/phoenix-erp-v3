#!/usr/bin/env node
/** Reviewed two-company activation. No implicit connection, breed inference, ALL grant, or historical repair. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CONFIRM = 'I_UNDERSTAND_EGG_SOURCE_ACTIVATION_COMPANY_SCOPED';
export const SPECS = ['LOOSE', 'TRAY30', 'TRAY36', 'BOX360', 'BOX720', 'GIFT12', 'GIFT24'];
const COMPANIES = ['COMP-LAO-AGRI', 'COMP-LAO-XINGCHI'];
const GRADES = Array.from({ length: 6 }, (_, n) => `GRADE_${n}`);
const LEGACY_GRADES = GRADES.slice(1);
export const LEGACY_SELECTION_POLICY = {
  version: 'EXISTING_ACTIVE_STANDARD_MATRIX_V1', grade_codes: LEGACY_GRADES, spec_codes: SPECS,
  sku_variety_code: null, parent_variety_code: null, org_context_required: false,
  status: 'ACTIVE', parent_status: 'ACTIVE', base_unit: '枚', category_code_when_present: 'EGG',
  expected_count: 35, preserve_existing_identity: true,
};
const SOURCE_ROWS = [
  ['COMP-LAO-AGRI', 'LPH_MENGSAI', 'SITE-MENGSAI-LAYER', 'STANDARD', null, ['HOUSE_MS_01','HOUSE_MS_02','HOUSE_MS_03','HOUSE_MS_04','HOUSE_MS_05','HOUSE_MS_06']],
  ['COMP-LAO-XINGCHI', 'FARM-DP', 'SITE-DONGPENG-LAYER', 'VARIANT', 'EGG_PINK', ['HOUSE_DP_01','HOUSE_DP_03','HOUSE_DP_05']],
  ['COMP-LAO-XINGCHI', 'FARM-DP', 'SITE-DONGPENG-LAYER', 'VARIANT', 'EGG_RED', ['HOUSE_DP_02','HOUSE_DP_04']],
];
export const readManifest = () => JSON.parse(fs.readFileSync(path.join(HERE, 'manifests/sku-two-company-source-activation.json'), 'utf8'));
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
export const digest = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
export const manifestSha256 = (manifest = readManifest()) => digest(manifest);
const fail = message => { throw new Error(`SKU_ACTIVATION_HOLD=${message}`); };
const same = (a, b) => digest(a) === digest(b);
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith('0000-')
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function validateManifest(manifest, effectiveDate) {
  if (!validDate(effectiveDate)) fail('EXPLICIT_VALID_EFFECTIVE_DATE_REQUIRED');
  if (manifest?.manifest_version !== '1' || manifest.effective_date !== null) fail('MANIFEST_VERSION_OR_IMPLICIT_DATE');
  if (manifest.source_effective_date !== '2026-11-10' || effectiveDate !== manifest.source_effective_date) {
    fail('SOURCE_EFFECTIVE_DATE_NOT_REVIEWED');
  }
  if (!same(manifest.spec_codes, SPECS) || !same(manifest.scope,
    { scope_type: 'COMPANY', sale_enabled: false, legacy_standard_sale_enabled: true, stock_enabled: true, status: 'ACTIVE' })) fail('MANIFEST_SCOPE_OR_SPECS');
  if (!same(manifest.legacy_standard_selection, LEGACY_SELECTION_POLICY) || Object.hasOwn(manifest, 'standard_products')
    || !same(manifest.variant_products, ['PRD-EGG-RED','PRD-EGG-PINK'])) fail('MANIFEST_CATALOG_POLICY');
  if (!Array.isArray(manifest.companies) || manifest.companies.length !== SOURCE_ROWS.length) fail('MANIFEST_SOURCE_COUNT');
  for (const [index, source] of SOURCE_ROWS.entries()) {
    const [company, farm, site, mode, variety, houses] = source;
    const row = manifest.companies[index];
    if (row.company_code !== company || row.farm_code !== farm || row.site_code !== site
      || row.mode !== mode || row.variety_code !== variety || !same(row.houses, houses)) fail('MANIFEST_SOURCE_NOT_REVIEWED');
  }
  return true;
}
function buildIntent(manifest, effectiveDate) {
  validateManifest(manifest, effectiveDate);
  const profiles = manifest.companies.flatMap(source => source.houses.map(house => ({
    profile_code: `ESP-${source.company_code}-${house}-${effectiveDate}`,
    company_code: source.company_code, farm_code: source.farm_code, site_code: source.site_code,
    house_code: house, product_mode: source.mode, variety_code: source.variety_code,
    effective_date: effectiveDate, expire_date: null, status: 'ACTIVE',
  }))).sort((a, b) => a.profile_code.localeCompare(b.profile_code));
  const products = [
    { product_code: 'PRD-EGG-0', variety_code: null, product_name: '0号特大蛋', unit_zh: '枚', status: 'ACTIVE' },
    { product_code: 'PRD-EGG-RED', variety_code: 'EGG_RED', product_name: '红壳蛋', unit_zh: '枚', status: 'ACTIVE' },
    { product_code: 'PRD-EGG-PINK', variety_code: 'EGG_PINK', product_name: '粉壳蛋', unit_zh: '枚', status: 'ACTIVE' },
  ];
  const skus = products.flatMap(product => (product.variety_code === null ? ['GRADE_0'] : GRADES)
    .flatMap(grade => SPECS.map(spec => ({
      sku_code: `SKU-${product.variety_code ? `${product.variety_code === 'EGG_RED' ? 'R' : 'P'}-` : ''}${grade.slice(6)}-${spec}`,
      product_code: product.product_code, grade_code: grade, spec_code: spec, variety_code: product.variety_code,
      sku_name: `${product.product_name} ${grade} ${spec}`, status: 'ACTIVE', org_context_required: true,
    })))).sort((a, b) => a.sku_code.localeCompare(b.sku_code));
  const scopes = skus.map(sku => ({ sku_code: sku.sku_code, scope_type: 'COMPANY',
    scope_code: sku.variety_code === null ? COMPANIES[0] : COMPANIES[1], sale_enabled: !sku.org_context_required,
    stock_enabled: true, status: 'ACTIVE', effective_date: effectiveDate, expire_date: null,
  }));
  const desired = { effective_date: effectiveDate, profiles, products, skus, scopes,
    varieties: [
      { variety_code: 'EGG_RED', variety_name: '红壳蛋', shell_color: 'RED', status: 'ACTIVE' },
      { variety_code: 'EGG_PINK', variety_name: '粉壳蛋', shell_color: 'PINK', status: 'ACTIVE' },
    ], grade0: { grade_code: 'GRADE_0', grade_name: '0号特大蛋', weight_range: null, sort_order: 5,
      is_saleable: true, is_storable: true, status: 'ACTIVE' } };
  return desired;
}

/** No code/name patterns or company scope tie-breaks may select an existing identity. */
export function legacyIdentityMap(state) {
  if (!Array.isArray(state?.skus) || !Array.isArray(state?.products) || !validDate(state?.database?.today)) fail('LEGACY_CATALOG_STATE_REQUIRED');
  const selected = [];
  for (const grade of LEGACY_GRADES) for (const spec of SPECS) {
    const candidates = state.skus.filter(s => s.grade_code === grade && s.spec_code === spec && s.status === 'ACTIVE');
    const ordinary = [];
    for (const sku of candidates) {
      const parents = state.products.filter(p => p.product_code === sku.product_code);
      if (parents.length !== 1) fail('LEGACY_PARENT_REQUIRED');
      const parent = parents[0];
      if (sku.variety_code !== null && parent.variety_code !== null) continue;
      // A mismatched NULL side is never eligible, nor hidden as a possible runtime competitor.
      if (sku.variety_code !== null || parent.variety_code !== null) fail('LEGACY_VARIETY_MISMATCH');
      if (sku.org_context_required !== false) fail('LEGACY_SKU_POLICY_CHANGED');
      if (parent.status !== 'ACTIVE' || parent.base_unit !== '枚'
        || ((state.schemaColumns || []).some(c=>c.table_name==='mst_products' && c.column_name==='category_code')
          && parent.category_code !== 'EGG')) fail('LEGACY_PARENT_POLICY');
      validity(sku, state.database.today, 'LEGACY_STANDARD');
      validity(parent, state.database.today, 'LEGACY_STANDARD_PARENT');
      ordinary.push({ sku_code: sku.sku_code, product_code: sku.product_code, grade_code: grade, spec_code: spec,
        status: sku.status, variety_code: sku.variety_code, parent_status: parent.status,
        parent_variety_code: parent.variety_code, org_context_required: sku.org_context_required, base_unit: parent.base_unit });
    }
    if (ordinary.length !== 1) fail(ordinary.length ? 'LEGACY_STANDARD_TUPLE_AMBIGUOUS' : 'LEGACY_STANDARD_TUPLE_MISSING');
    selected.push(ordinary[0]);
  }
  return selected.sort((a,b) => a.sku_code.localeCompare(b.sku_code));
}

/** An explicitly non-executable, bounded nonfinancial inventory for failed read-only inspection. */
export function catalogReport(state, reason) {
  const candidates = (state?.skus || []).filter(s => LEGACY_GRADES.includes(s.grade_code) && SPECS.includes(s.spec_code));
  return { report_version:'1', plan_ready:false, reason, candidate_count:candidates.length, truncated:candidates.length > 140,
    candidates:candidates.slice(0,140).map(s => {
      const p=(state.products || []).find(p=>p.product_code===s.product_code);
      return { sku_code:s.sku_code, product_code:s.product_code, grade_code:s.grade_code, spec_code:s.spec_code,
        status:s.status, variety_code:s.variety_code, org_context_required:s.org_context_required,
        parent_status:p?.status ?? null, parent_variety_code:p?.variety_code ?? null, base_unit:p?.base_unit ?? null,
        category_code:p?.category_code ?? null, effective_date:s.effective_date ?? null, expire_date:s.expire_date ?? null,
        parent_effective_date:p?.effective_date ?? null, parent_expire_date:p?.expire_date ?? null };
    }) };
}
export function buildPlan(manifest, effectiveDate, dbState) {
  const desired = buildIntent(manifest,effectiveDate);
  const legacy_identity_map = legacyIdentityMap(dbState);
  // Existing35 are immutable references, never product/SKU insert or draft-activation inputs.
  desired.legacySkus = legacy_identity_map;
  desired.scopes.push(...legacy_identity_map.map(s => ({sku_code:s.sku_code,scope_type:'COMPANY',scope_code:COMPANIES[0],
    sale_enabled:true,stock_enabled:true,status:'ACTIVE',effective_date:effectiveDate,expire_date:null})));
  desired.scopes.sort((a,b)=>a.sku_code.localeCompare(b.sku_code));
  const body = { manifest_sha256: manifestSha256(manifest), desired, legacy_identity_map, db_state_sha256: digest(dbState), dbState };
  return { ...body, plan_sha256: digest(body) };
}

/** Stable, relevant database state. DATE is cast to text, never round-tripped through local-midnight JS Date. */
async function loadState(client, desired, lock = false) {
  const profileHouses = desired.profiles.map(row => row.house_code);
  const productCodes = desired.products.map(row => row.product_code);
  const skuCodes = desired.skus.map(row => row.sku_code);
  const share = lock ? ' FOR SHARE' : '';
  const update = lock ? ' FOR UPDATE' : '';
  const rows = async (sql, values = []) => (await client.query(sql, values)).rows;
  const tables = ['sys_organizations','brd_farms','brd_houses','product_grades','packaging_specs',
    'md_product_varieties','mst_products','product_skus','md_sku_org_scope','md_egg_source_profiles'];
  const schemaColumns = await rows(`SELECT table_name,column_name,udt_name,is_nullable,column_default
    FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=ANY($1)
    ORDER BY table_name,ordinal_position`, [tables]);
  const schemaConstraints = await rows(`SELECT rel.relname AS table_name, con.conname AS name, pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace ns ON ns.oid=rel.relnamespace
    WHERE ns.nspname=current_schema() AND rel.relname=ANY($1) ORDER BY rel.relname,con.conname`, [tables]);
  const schemaIndexes = await rows(`SELECT tablename,indexname,indexdef FROM pg_indexes
    WHERE schemaname=current_schema() AND tablename=ANY($1) ORDER BY tablename,indexname`, [tables]);
  const schemaTriggers = await rows(`SELECT rel.relname AS table_name, tr.tgname AS name,
    pg_get_triggerdef(tr.oid) AS definition, pg_get_functiondef(tr.tgfoid) AS function_definition
    FROM pg_trigger tr JOIN pg_class rel ON rel.oid=tr.tgrelid JOIN pg_namespace ns ON ns.oid=rel.relnamespace
    WHERE ns.nspname=current_schema() AND rel.relname=ANY($1) AND NOT tr.tgisinternal ORDER BY rel.relname,tr.tgname`, [tables]);
  const [database] = await rows(`SELECT current_database() AS name,
    (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,
    CURRENT_DATE::text AS today, current_schema() AS schema, current_setting('server_version_num') AS server_version`);
  const companies = await rows(`SELECT org_code, company_code, org_type, status FROM sys_organizations
    WHERE org_type='COMPANY' AND org_code=ANY($1) ORDER BY org_code${share}`, [COMPANIES]);
  const sites = await rows(`SELECT site.org_code, site.status, site.org_type, site.company_code,
    parent.org_code AS parent_company, parent.org_type AS parent_type, parent.status AS parent_status
    FROM sys_organizations site LEFT JOIN sys_organizations parent ON parent.id=site.parent_id
    WHERE site.org_code=ANY($1) ORDER BY site.org_code`, [[...new Set(desired.profiles.map(row => row.site_code))]]);
  if (lock) await rows(`SELECT id FROM sys_organizations WHERE org_code=ANY($1) ORDER BY id FOR SHARE`,
    [[...COMPANIES, ...desired.profiles.map(row => row.site_code)]]);
  const farms = await rows(`SELECT farm_code, company_code, mapped_site_code, status FROM brd_farms
    WHERE farm_code=ANY($1) ORDER BY farm_code${share}`, [[...new Set(desired.profiles.map(row => row.farm_code))]]);
  const houses = await rows(`SELECT house_code, farm_code, house_type, status FROM brd_houses
    WHERE house_code=ANY($1) ORDER BY house_code${share}`, [profileHouses]);
  const grades = await rows(`SELECT grade_code, weight_range, is_saleable, is_storable, status
    FROM product_grades WHERE grade_code=ANY($1) ORDER BY grade_code${update}`, [GRADES]);
  const specs = await rows(`SELECT spec_code, qty_per_unit::text AS qty_per_unit, base_unit, display_unit, status
    FROM packaging_specs WHERE spec_code=ANY($1) ORDER BY spec_code${share}`, [SPECS]);
  const varieties = await rows(`SELECT variety_code, shell_color, status, effective_date::text AS effective_date,
    expire_date::text AS expire_date FROM md_product_varieties WHERE variety_code=ANY($1) ORDER BY variety_code${update}`,
    [['EGG_RED', 'EGG_PINK']]);
  // Discover the complete tuple predicate, not just generated codes or pre-existing grants.
  const skus = await rows(`SELECT sku_code,product_code,grade_code,spec_code,variety_code,status,org_context_required,
    sku_name,product_name,effective_date::text AS effective_date, expire_date::text AS expire_date FROM product_skus
    WHERE (grade_code=ANY($4) AND spec_code=ANY($5)) OR sku_code=ANY($1) OR product_code=ANY($2)
       OR sku_code IN (SELECT sku_code FROM md_sku_org_scope WHERE scope_type='COMPANY' AND scope_code=ANY($3))
    ORDER BY sku_code${update}`, [skuCodes, productCodes, COMPANIES, GRADES, SPECS]);
  const allSkuCodes = [...new Set([...skuCodes,...skus.map(s=>s.sku_code)])];
  const allProductCodes = [...new Set([...productCodes,...skus.map(s=>s.product_code)])];
  // Only fixed nonfinancial columns are ever read. Missing optional columns are
  // represented explicitly as NULL; never serialize a whole row (which may contain prices).
  const productColumn = name => schemaColumns.some(c=>c.table_name==='mst_products' && c.column_name===name)
    ? `p.${name}::text` : 'NULL::text';
  const products = await rows(`SELECT product_code,product_name,${productColumn('product_name_zh')} AS product_name_zh,
    COALESCE(NULLIF(${productColumn('unit_zh')},''),${productColumn('unit')}) AS base_unit, variety_code, status,
    ${productColumn('category_code')} AS category_code,
    ${productColumn('has_grade')} AS has_grade,${productColumn('has_spec')} AS has_spec,
    ${productColumn('effective_date')} AS effective_date,${productColumn('expire_date')} AS expire_date
    FROM mst_products p WHERE product_code=ANY($1) ORDER BY product_code${update}`, [allProductCodes]);
  const scopes = await rows(`SELECT sku_code,scope_type,scope_code,sale_enabled,stock_enabled,status,
    effective_date::text AS effective_date,expire_date::text AS expire_date FROM md_sku_org_scope
    WHERE sku_code=ANY($1) OR (scope_type='COMPANY' AND scope_code=ANY($2))
    ORDER BY sku_code,scope_type,scope_code${update}`, [allSkuCodes, COMPANIES]);
  const profiles = await rows(`SELECT profile_code,company_code,farm_code,site_code,house_code,product_mode,variety_code,
    effective_date::text AS effective_date,expire_date::text AS expire_date,status FROM md_egg_source_profiles
    WHERE house_code=ANY($1) OR profile_code=ANY($2) ORDER BY profile_code${update}`,
    [profileHouses, desired.profiles.map(row => row.profile_code)]);
  return { database, schemaColumns, schemaConstraints, schemaIndexes, schemaTriggers,
    companies, sites, farms, houses, grades, specs, varieties, products, skus, scopes, profiles };
}

const by = (rows, key, value) => rows.filter(row => row[key] === value);
function exactlyOne(rows, label) { if (rows.length !== 1) fail(`UNIQUE_MASTER_REQUIRED:${label}`); return rows[0]; }
function active(row, label) { if (row.status !== 'ACTIVE') fail(`MASTER_INACTIVE:${label}`); }
function validity(row, today, label) {
  if ((row.effective_date && row.effective_date > today) || (row.expire_date && row.expire_date < today)) fail(`MASTER_DATE:${label}`);
}
const keysEqual = (old, desired, keys) => keys.every(key => old[key] === desired[key]);
function validateState(state, desired) {
  for (const company of COMPANIES) active(exactlyOne(by(state.companies, 'org_code', company), company), company);
  for (const profile of desired.profiles) {
    const house = exactlyOne(by(state.houses, 'house_code', profile.house_code), profile.house_code);
    const farm = exactlyOne(by(state.farms, 'farm_code', profile.farm_code), profile.farm_code);
    const site = exactlyOne(by(state.sites, 'org_code', profile.site_code), profile.site_code);
    active(house, profile.house_code); active(farm, profile.farm_code); active(site, profile.site_code);
    if (house.house_type !== 'LAYER' || house.farm_code !== farm.farm_code || farm.company_code !== profile.company_code
      || farm.mapped_site_code !== profile.site_code || site.org_type !== 'SITE' || site.parent_type !== 'COMPANY'
      || site.parent_status !== 'ACTIVE' || site.parent_company !== profile.company_code
      || (site.company_code && site.company_code !== profile.company_code)) fail(`SOURCE_ORGANIZATION:${profile.house_code}`);
    const sameCode = by(state.profiles, 'profile_code', profile.profile_code);
    if (sameCode.length > 1 || (sameCode[0] && !keysEqual(sameCode[0], profile, Object.keys(profile)))) fail(`SOURCE_IDENTITY_CONFLICT:${profile.profile_code}`);
    const overlaps = state.profiles.filter(old => old.company_code === profile.company_code && old.house_code === profile.house_code
      && old.status === 'ACTIVE' && old.effective_date <= (profile.expire_date || '9999-12-31')
      && (old.expire_date || '9999-12-31') >= profile.effective_date && old.profile_code !== profile.profile_code);
    if (overlaps.length) fail(`SOURCE_PERIOD_OVERLAP:${profile.house_code}`);
  }
  for (const specCode of SPECS) {
    const spec = exactlyOne(by(state.specs, 'spec_code', specCode), specCode); active(spec, specCode);
    if (spec.base_unit !== '枚' || !spec.display_unit || !Number.isFinite(Number(spec.qty_per_unit)) || Number(spec.qty_per_unit) <= 0) fail(`SPEC_UNIT:${specCode}`);
  }
  for (const gradeCode of GRADES) {
    const candidates = by(state.grades, 'grade_code', gradeCode);
    if (!candidates.length && gradeCode === 'GRADE_0') continue;
    const grade = exactlyOne(candidates, gradeCode);
    if (grade.status !== 'ACTIVE' && !(gradeCode === 'GRADE_0' && grade.status === 'DRAFT')) fail(`GRADE_STATUS:${gradeCode}`);
    if (gradeCode !== 'GRADE_0' && (grade.is_saleable !== true || grade.is_storable !== true)) fail(`GRADE_USAGE:${gradeCode}`);
  }
  for (const variety of desired.varieties) {
    const found = by(state.varieties, 'variety_code', variety.variety_code);
    if (found.length > 1) fail(`VARIETY_DUPLICATE:${variety.variety_code}`);
    if (found[0]) {
      if (found[0].shell_color !== variety.shell_color || !['ACTIVE','DRAFT'].includes(found[0].status)) fail(`VARIETY_CONFLICT:${variety.variety_code}`);
      validity(found[0], desired.effective_date, variety.variety_code);
    }
  }
  for (const product of desired.products) {
    const found = by(state.products, 'product_code', product.product_code);
    if (found.length > 1) fail(`PRODUCT_DUPLICATE:${product.product_code}`);
    if (!found.length) {
      if (product.variety_code === null && product.product_code !== 'PRD-EGG-0') fail(`EXISTING_STANDARD_PRODUCT_MISSING:${product.product_code}`);
      continue;
    }
    if (found[0].variety_code !== product.variety_code || found[0].base_unit !== '枚'
      || !['ACTIVE','DRAFT'].includes(found[0].status)) fail(`PRODUCT_CONFLICT:${product.product_code}`);
  }
  if (!same(legacyIdentityMap(state), desired.legacySkus)) fail('LEGACY_CATALOG_IDENTITY_MOVED');
  const identity = ['product_code','grade_code','spec_code','variety_code'];
  for (const sku of desired.skus) {
    const found = by(state.skus, 'sku_code', sku.sku_code);
    if (found.length > 1) fail(`SKU_DUPLICATE:${sku.sku_code}`);
    if (found[0]) {
      if (!keysEqual(found[0], sku, identity) || !['ACTIVE','DRAFT'].includes(found[0].status)) fail(`SKU_IDENTITY_OR_STATUS:${sku.sku_code}`);
      validity(found[0], state.database.today, sku.sku_code);
      if (!sku.org_context_required && found[0].org_context_required !== false) fail(`LEGACY_SKU_POLICY_CHANGED:${sku.sku_code}`);
      if (sku.org_context_required && found[0].org_context_required !== true && found[0].status !== 'DRAFT') fail(`UNREVIEWED_ACTIVE_SKU_POLICY:${sku.sku_code}`);
    } else if (sku.variety_code === null && sku.grade_code !== 'GRADE_0') fail(`EXISTING_STANDARD_SKU_MISSING:${sku.sku_code}`);
    if (state.skus.some(old => old.sku_code !== sku.sku_code && keysEqual(old, sku, ['product_code','grade_code','spec_code']))) fail(`SKU_COMBINATION_COLLISION:${sku.sku_code}`);
  }
  for (const oldScope of state.scopes.filter(row => row.scope_type === 'COMPANY' && COMPANIES.includes(row.scope_code))) {
    const oldSku = by(state.skus, 'sku_code', oldScope.sku_code)[0];
    if (oldSku && GRADES.includes(oldSku.grade_code) && SPECS.includes(oldSku.spec_code)
      && !desired.scopes.some(scope => keysEqual(oldScope, scope, ['sku_code','scope_type','scope_code']))) {
      fail(`UNREVIEWED_COMPANY_CATALOG:${oldScope.sku_code}`);
    }
  }
  for (const scope of desired.scopes) {
    const sameScope = state.scopes.filter(old => keysEqual(old, scope, ['sku_code','scope_type','scope_code']));
    if (sameScope.length > 1 || (sameScope[0] && !keysEqual(sameScope[0], scope, Object.keys(scope)))) fail(`COMPANY_SCOPE_CONFLICT:${scope.sku_code}`);
    // Existing ALL and child-level records change availability; do not silently expand/override them.
    if (state.scopes.some(old => old.sku_code === scope.sku_code && old.scope_type !== 'COMPANY')) fail(`NONCOMPANY_SCOPE_REQUIRES_REVIEW:${scope.sku_code}`);
  }
}

async function insertRow(client, table, row) {
  const fields = Object.keys(row);
  const result = await client.query(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row));
  if (result.rowCount !== 1) fail(`INSERT_NOT_ACKNOWLEDGED:${table}`);
  return 1;
}
async function applyPlan(client, plan) {
  const { desired: d, dbState: state } = plan;
  const counts = { inserted: { grades:0,varieties:0,products:0,skus:0,scopes:0,profiles:0 }, activatedDrafts:0, policyUpgrades:0 };
  const activate = async (table, key, code) => {
    const result = await client.query(`UPDATE ${table} SET status='ACTIVE' WHERE ${key}=$1 AND status='DRAFT'`, [code]);
    if (result.rowCount !== 1) fail(`DRAFT_ACTIVATION_MOVED:${table}/${code}`);
    counts.activatedDrafts++;
  };
  const oldGrade0 = by(state.grades, 'grade_code', 'GRADE_0')[0];
  if (!oldGrade0) counts.inserted.grades += await insertRow(client, 'product_grades', d.grade0);
  else if (oldGrade0.status === 'DRAFT' || !oldGrade0.is_saleable || !oldGrade0.is_storable) {
    // Restore the approved grade, never invent or overwrite its weight boundary.
    const result = await client.query("UPDATE product_grades SET status='ACTIVE',is_saleable=true,is_storable=true WHERE grade_code='GRADE_0'");
    if (result.rowCount !== 1) fail('GRADE0_ACTIVATION_MOVED');
    counts.activatedDrafts++;
  }
  for (const variety of d.varieties) {
    const old = by(state.varieties, 'variety_code', variety.variety_code)[0];
    if (!old) counts.inserted.varieties += await insertRow(client, 'md_product_varieties', variety);
    else if (old.status === 'DRAFT') await activate('md_product_varieties','variety_code',variety.variety_code);
  }
  for (const product of d.products) {
    const old = by(state.products, 'product_code', product.product_code)[0];
    if (!old) counts.inserted.products += await insertRow(client, 'mst_products', { ...product,
      product_name_zh: product.product_name, category_code:'EGG', has_grade:true, has_spec:true });
    else if (old.status === 'DRAFT') await activate('mst_products','product_code',product.product_code);
  }
  for (const sku of d.skus) {
    const old = by(state.skus, 'sku_code', sku.sku_code)[0];
    const parent = by(state.products,'product_code',sku.product_code)[0];
    const productName = parent?.product_name_zh || parent?.product_name
      || d.products.find(product=>product.product_code===sku.product_code).product_name;
    if (!old) counts.inserted.skus += await insertRow(client,'product_skus',{...sku,product_name:productName});
    else if (old.status === 'DRAFT') {
      await client.query("UPDATE product_skus SET product_name=COALESCE(NULLIF(product_name,''),$2) WHERE sku_code=$1 AND status='DRAFT'",[sku.sku_code,productName]);
      if (sku.org_context_required && old.org_context_required !== true) {
        const changed = await client.query("UPDATE product_skus SET org_context_required=true WHERE sku_code=$1 AND status='DRAFT' AND org_context_required=false",[sku.sku_code]);
        if (changed.rowCount !== 1) fail(`SKU_POLICY_MOVED:${sku.sku_code}`);
        counts.policyUpgrades++;
      }
      await activate('product_skus','sku_code',sku.sku_code);
    }
  }
  for (const scope of d.scopes) if (!state.scopes.some(old => keysEqual(old,scope,['sku_code','scope_type','scope_code']))) counts.inserted.scopes += await insertRow(client,'md_sku_org_scope',scope);
  for (const profile of d.profiles) if (!state.profiles.some(old => old.profile_code === profile.profile_code)) counts.inserted.profiles += await insertRow(client,'md_egg_source_profiles',{
    ...profile, created_by:'SKU_SOURCE_ACTIVATION',updated_by:'SKU_SOURCE_ACTIVATION',
  });
  return counts;
}

/** inspect is provably read-only; writes reacquire their own fresh snapshot after all source locks. */
export async function runActivation(client, { mode, effectiveDate, manifest = readManifest(), expectedPlanSha256, confirm } = {}) {
  if (!['inspect','dry-run','apply'].includes(mode)) fail('MODE_REQUIRED');
  if (mode === 'apply' && (confirm !== CONFIRM || !/^[a-f0-9]{64}$/.test(expectedPlanSha256 || ''))) fail('EXPLICIT_APPLY_APPROVAL_AND_PLAN_REQUIRED');
  const intent = buildIntent(manifest,effectiveDate);
  let inspectedState;
  let inTransaction = false;
  try {
    await client.query(mode === 'inspect' ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN ISOLATION LEVEL SERIALIZABLE');
    inTransaction = true;
    if (mode !== 'inspect') {
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='30s'");
      // Before any SELECT establishes the SERIALIZABLE snapshot: block non-cooperating inserts and parent/scope edits.
      await client.query('LOCK TABLE mst_products, product_skus, md_sku_org_scope IN SHARE ROW EXCLUSIVE MODE');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('phoenix:sku-source-activation'))");
      for (const profile of intent.profiles) await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('phoenix:egg-source-profile'),hashtext($1))", [`${profile.company_code}:${profile.house_code}`]);
    }
    const state = await loadState(client,intent,mode !== 'inspect');
    inspectedState = state;
    const plan = buildPlan(manifest,effectiveDate,state);
    validateState(state,plan.desired);
    if (mode === 'apply' && expectedPlanSha256 !== plan.plan_sha256) fail('PLAN_OR_DATABASE_STATE_MOVED');
    // The human explicitly confirmed these house colors from this business date.
    // This admits pending postings; it does not UPDATE any historical batch identity.
    if (mode === 'apply' && effectiveDate > state.database.today) fail('SOURCE_EFFECTIVE_DATE_IS_FUTURE');
    const result = { mode, plan_ready:true, manifest_sha256:plan.manifest_sha256, plan_sha256:plan.plan_sha256,
      db_state_sha256:plan.db_state_sha256, database:state.database, effective_date:effectiveDate,
      legacy_identity_map:plan.legacy_identity_map, legacy_identity_map_sha256:digest(plan.legacy_identity_map),
      expectedCounts:{ profiles:11, standardSkus:42, variantSkus:84, scopes:126 },
      existingCounts:Object.fromEntries(['grades','specs','varieties','products','skus','scopes','profiles'].map(key=>[key,state[key].length])) };
    if (mode !== 'inspect') {
      result.rows = await applyPlan(client,plan);
      const after = await loadState(client,intent,true);
      validateState(after,plan.desired);
      for (const table of ['products','skus']) {
        const key=table==='products'?'product_code':'sku_code';
        const codes=new Set(plan.legacy_identity_map.map(r=>r[key]));
        if (!same(state[table].filter(r=>codes.has(r[key])),after[table].filter(r=>codes.has(r[key])))) fail('LEGACY_CATALOG_IDENTITY_MOVED');
      }
      for (const [table,key,wanted] of [
        ['profiles','profile_code',plan.desired.profiles], ['skus','sku_code',plan.desired.skus],
        ['products','product_code',plan.desired.products], ['varieties','variety_code',plan.desired.varieties],
      ]) for (const row of wanted) {
        const actual = exactlyOne(by(after[table],key,row[key]),row[key]);
        if (actual.status !== 'ACTIVE') fail(`POST_ACTIVATION_STATUS:${row[key]}`);
      }
      const grade0 = exactlyOne(by(after.grades,'grade_code','GRADE_0'),'GRADE_0');
      if (!grade0.is_saleable || !grade0.is_storable || grade0.status !== 'ACTIVE') fail('POST_GRADE0_USAGE');
      if (plan.desired.scopes.some(scope => !after.scopes.some(row => keysEqual(row,scope,Object.keys(scope))))) fail('POST_COMPANY_SCOPE');
      result.after_state_sha256 = digest(after);
    }
    await client.query(mode === 'dry-run' ? 'ROLLBACK' : 'COMMIT');
    inTransaction = false;
    return result;
  } catch (error) {
    if (inTransaction) await client.query('ROLLBACK');
    if (mode === 'inspect' && inspectedState) {
      const reason=/^SKU_ACTIVATION_HOLD=([A-Z0-9_]+)(?::[^\r\n]*)?$/.exec(error?.message || '')?.[1];
      if (reason) {
        const catalog_report=catalogReport(inspectedState,reason);
        return { mode:'inspect',plan_ready:false,effective_date:effectiveDate,manifest_sha256:manifestSha256(manifest),
          db_state_sha256:digest(inspectedState),database:inspectedState.database,
          catalog_report,catalog_report_sha256:digest(catalog_report) };
      }
    }
    throw error;
  }
}

export function parseArgs(argv) {
  const allowed = new Set(['mode','effective-date','confirm','expected-plan-sha256']);
  const out = {};
  for (let i=0;i<argv.length;i+=2) {
    const flag = argv[i]; const value=argv[i+1];
    if (!flag?.startsWith('--') || !allowed.has(flag.slice(2)) || Object.hasOwn(out,flag.slice(2)) || !value || value.startsWith('--')) fail('INVALID_OR_DUPLICATE_ARGUMENT');
    out[flag.slice(2)]=value;
  }
  if (!['inspect','dry-run','apply'].includes(out.mode)) fail('MODE_REQUIRED');
  if (!validDate(out['effective-date'])) fail('EXPLICIT_VALID_EFFECTIVE_DATE_REQUIRED');
  if (out.mode !== 'apply' && (out.confirm || out['expected-plan-sha256'])) fail('APPROVAL_ONLY_FOR_APPLY');
  return out;
}
export function explicitDbConfig(env) {
  if (env.DATABASE_URL) return { connectionString:env.DATABASE_URL };
  const keys=['DB_HOST','DB_PORT','DB_USER','DB_PASSWORD','DB_NAME'];
  if (keys.some(key=>typeof env[key] !== 'string' || !env[key].trim())) fail('EXPLICIT_DATABASE_CONFIGURATION_REQUIRED');
  const port=Number(env.DB_PORT);
  if (!Number.isInteger(port) || port<1 || port>65535) fail('INVALID_DATABASE_PORT');
  return { host:env.DB_HOST,port,user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME };
}
async function main() {
  const args=parseArgs(process.argv.slice(2));
  const cfg=explicitDbConfig(process.env);
  const require=createRequire(path.join(HERE,'../../apps/api/package.json'));
  const {Client}=require('pg');
  const client=new Client(cfg);
  try {
    await client.connect();
    console.log(JSON.stringify(await runActivation(client,{mode:args.mode,effectiveDate:args['effective-date'],
      confirm:args.confirm,expectedPlanSha256:args['expected-plan-sha256']}),null,2));
  } finally { await client.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error=>{
    // pg errors may contain connection details or values. Emit declared invariant codes only.
    console.error(/^SKU_ACTIVATION_HOLD=[A-Za-z0-9_:/.\-]+$/.test(error?.message || '') ? error.message : 'SKU_ACTIVATION_HOLD=OPERATION_FAILED');
    process.exitCode=1;
  });
}
