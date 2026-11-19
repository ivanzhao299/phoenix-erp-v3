import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { collectLegacyEggAuditEvidence, LEGACY_EGG_TEST_MANIFEST } from './production-legacy-egg-audit-evidence.mjs';

const binding={targetSha:'a'.repeat(40),floorSha:'e'.repeat(40),runningApiSha:'b'.repeat(40),
  ledgerSha256:createHash('sha256').update(JSON.stringify({legacy:[],typeorm:[]})).digest('hex'),migrationEvidenceSha256:'c'.repeat(64)};
test('unbound evidence cannot start a database transaction',async()=>{
  const client={query:()=>assert.fail('Unexpected database access')};
  await assert.rejects(collectLegacyEggAuditEvidence(client,{...binding,ledgerSha256:'no-digest'}),/BINDING_REQUIRED/);
});

const pgUrl=process.env.OWNED_LEGACY_EGG_AUDIT_PG_URL;
test('actual read-only snapshot preserves original HOLD and checks complete test scope and downstream references',{
  skip:!pgUrl,timeout:60000,
},async()=> {
  const uri=new URL(pgUrl);
  assert.equal(uri.hostname,'127.0.0.1');
  assert.equal(uri.pathname,'/installments_fixture');
  const {Client}=createRequire(new URL('../../apps/api/package.json',import.meta.url))('pg');
  const schema='legacy_egg_audit_'+randomBytes(6).toString('hex'), downstreamSchema=schema+'_outside';
  const writer=new Client({connectionString:pgUrl});
  const reader=new Client({connectionString:pgUrl,options:'-c search_path='+schema});
  await writer.connect();
  try {
    assert.match((await writer.query('SHOW server_version')).rows[0].server_version,/^18\./);
    await writer.query(`CREATE SCHEMA ${schema}; CREATE SCHEMA ${downstreamSchema}; SET search_path=${schema};
      CREATE TABLE schema_migrations(filename text,applied_at timestamptz);
      CREATE TABLE migrations(timestamp bigint,name text);
      CREATE TABLE brd_farms(farm_code text PRIMARY KEY,company_code text);
      CREATE TABLE brd_houses(house_code text PRIMARY KEY,farm_code text);
      CREATE TABLE wms_warehouses(warehouse_code text PRIMARY KEY,company_code text);
      CREATE TABLE product_skus(sku_code text PRIMARY KEY,product_code text);
      CREATE TABLE brd_daily_logs(id bigint PRIMARY KEY,log_date date,house_code text,shift text,eggs_by_grade jsonb);
      CREATE TABLE inv_batches(id bigint PRIMARY KEY,batch_no text UNIQUE NOT NULL,qty numeric,qty_available numeric,source_type text,
        collection_batch_ref text,egg_date date,grade_code_std text,quality_grade text,source_no text,sku_code text,spec_code text,
        packaging_spec text,company_code text,legacy_source text,product_code text,warehouse_code text,material_code text,packaging_batch_ref text,parent_batch_id bigint);
      CREATE TABLE inv_ledger(id bigint PRIMARY KEY,batch_no text REFERENCES inv_batches(batch_no),qty_change numeric,change_type text,
        note text,company_code text,ref_no text,sku_code text,warehouse_code text);
      CREATE TABLE sal_order_items(id bigint PRIMARY KEY,allocated_batch_no text);
      CREATE TABLE sal_order_item_batch_allocations(id bigint PRIMARY KEY,batch_no text);
      CREATE TABLE store_sale_allocations(id bigint PRIMARY KEY,batch_no text);
      CREATE TABLE wms_transfer_items(id bigint PRIMARY KEY,source_batch_no text,target_batch_no text);
      CREATE TABLE pkg_source_batches(id bigint PRIMARY KEY,source_inbound_no text);
      CREATE TABLE fin_ar_invoices(id bigint PRIMARY KEY,source_no text);
      CREATE TABLE fin_ap_invoices(id bigint PRIMARY KEY,source_no text);
      CREATE TABLE chanjet_voucher_drafts(id bigint PRIMARY KEY,provenance jsonb);
      INSERT INTO brd_farms VALUES('FARM-A','COMP-A');
      INSERT INTO brd_houses VALUES('HOUSE-A','FARM-A');
      INSERT INTO wms_warehouses VALUES('WH-A','COMP-A');
      INSERT INTO product_skus VALUES('SYNTHETIC-GRADE4','EGG-RED'),('SYNTHETIC-GRADE5','EGG-RED'),('SYNTHETIC-GRADE1','EGG-RED');
      INSERT INTO brd_daily_logs VALUES(1,'2026-11-18','HOUSE-A','DAILY','{"GRADE_0":540,"GRADE_1":11880,"GRADE_2":32760,"GRADE_3":1980,"GRADE_4":0,"GRADE_5":0,"DIRTY":540,"BROKEN":230}');`);
    await reader.connect();
    const {rows:[databaseIdentity]}=await reader.query(`SELECT current_database() AS name,current_schema() AS schema,
      system_identifier::text AS "systemIdentifier" FROM pg_control_system()`);
    const localBinding={...binding,databaseIdentity};
    const capture=manifest=>collectLegacyEggAuditEvidence(reader,{...localBinding,manifest});
    await assert.rejects(collectLegacyEggAuditEvidence(reader,{
      ...localBinding,databaseIdentity:{...databaseIdentity,name:'another_database'},
    }),/DATABASE_IDENTITY_MISMATCH/);
    assert.equal((await capture()).evidence.disposition,'ORIGINAL_AUDIT_GO');
    await writer.query("INSERT INTO migrations VALUES(101,'OwnedSchemaChange101')");
    assert.equal((await capture()).evidence.reason,'MIGRATION_LEDGER_MOVED');
    await writer.query('DELETE FROM migrations');
    await writer.query(`INSERT INTO inv_batches(id,batch_no,qty,qty_available,source_type,collection_batch_ref,egg_date,grade_code_std,
      quality_grade,source_no,sku_code,spec_code,company_code,product_code,warehouse_code) VALUES
      (401,'SYNTHETIC-TEST-0004',30,30,'TEMP_PRODUCTION','HOUSE-HOUSE-A','2026-11-18','GRADE_4','GRADE_4','SYNTHETIC-SRC-0004','SYNTHETIC-GRADE4','LOOSE','COMP-A','EGG-RED','WH-A'),
      (501,'SYNTHETIC-TEST-0005',30,30,'TEMP_PRODUCTION','HOUSE-HOUSE-A','2026-11-18','GRADE_5','GRADE_5','SYNTHETIC-SRC-0004','SYNTHETIC-GRADE5','LOOSE','COMP-A','EGG-RED','WH-A'),
      (101,'SYNTHETIC-OLDER-SIBLING',10,10,'TEMP_PRODUCTION','HOUSE-HOUSE-A','2026-11-18','GRADE_1','GRADE_1','SYNTHETIC-SRC-0004','SYNTHETIC-GRADE1','LOOSE','COMP-A','EGG-RED','WH-A');
      INSERT INTO inv_ledger(id,batch_no,qty_change,change_type,company_code,ref_no,sku_code,warehouse_code) VALUES
      (104,'SYNTHETIC-TEST-0004',30,'TEMP_PRODUCTION_INBOUND','COMP-A','SYNTHETIC-SRC-0004','SYNTHETIC-GRADE4','WH-A'),
      (105,'SYNTHETIC-TEST-0005',30,'TEMP_PRODUCTION_INBOUND','COMP-A','SYNTHETIC-SRC-0004','SYNTHETIC-GRADE5','WH-A'),
      (101,'SYNTHETIC-OLDER-SIBLING',10,'TEMP_PRODUCTION_INBOUND','COMP-A','SYNTHETIC-SRC-0004','SYNTHETIC-GRADE1','WH-A');`);
    const baseline=await capture();
    assert.equal(baseline.evidence.reason,'MATCHING_FROZEN_TEST_MANIFEST_REQUIRED');
    assert.deepEqual(baseline.evidence.groups.map(g=>[g.gradeCode,g.quantity]),[['GRADE_4',30],['GRADE_5',30]]);
    const manifest={schema:LEGACY_EGG_TEST_MANIFEST,classification:'HISTORICAL_TEST',
      businessEvidenceSha256:'d'.repeat(64),groups:baseline.evidence.groups};
    const matched=await capture(manifest);
    assert.equal(matched.evidence.disposition,'HOLD');
    assert.equal(matched.evidence.reason,'MATCHED_CLAIM_PENDING_INDEPENDENT_REVIEW');
    assert.equal(matched.evidence.verifiedTestScope,false);
    assert.equal(matched.evidence.originalConclusion,'HOLD');
    assert.equal(matched.evidence.releaseAuthorized,false);
    assert.equal(JSON.parse(matched.originalAudit).overposted_grade_groups,2);
    assert.equal(matched.evidence.originalAuditSha256,createHash('sha256').update(matched.originalAudit).digest('hex'));
    assert.equal((await capture({...manifest,groups:manifest.groups.slice(0,1)})).evidence.reason,'MATCHING_FROZEN_TEST_MANIFEST_REQUIRED');
    assert.equal((await capture({...manifest,businessEvidenceSha256:33})).evidence.reason,'MATCHING_FROZEN_TEST_MANIFEST_REQUIRED');
    await writer.query("INSERT INTO sal_order_items VALUES(1,'OTHER, SYNTHETIC-TEST-0004')");
    const reserved=await capture(manifest);
    assert.equal(reserved.evidence.reason,'LEGACY_BUSINESS_REFERENCES_UNRESOLVED');
    assert.deepEqual(reserved.evidence.referenceCoverage.matches,['sal_order_items']);
    await writer.query(`DELETE FROM sal_order_items; INSERT INTO chanjet_voucher_drafts VALUES(1,'{"trace":"SYNTHETIC-SRC-0004"}');`);
    assert.deepEqual((await capture(manifest)).evidence.referenceCoverage.matches,['chanjet_voucher_drafts']);
    await writer.query(`UPDATE chanjet_voucher_drafts SET provenance='{"trace":{"inventoryBatchId":501}}'`);
    assert.deepEqual((await capture(manifest)).evidence.referenceCoverage.matches,['chanjet_voucher_drafts']);
    await writer.query('DELETE FROM chanjet_voucher_drafts; CREATE TABLE future_stock_edge(stock_key bigint REFERENCES inv_batches(id)); INSERT INTO future_stock_edge VALUES(501)');
    assert.deepEqual((await capture(manifest)).evidence.referenceCoverage.matches,['future_stock_edge']);
    await writer.query('DELETE FROM future_stock_edge');
    const wrapped={query:async (query,...params)=>{
      const result=await reader.query(query,...params);
      if(query.includes('WITH report_grade')) await writer.query('INSERT INTO future_stock_edge VALUES(501)');
      return result;
    }};
    assert.equal((await collectLegacyEggAuditEvidence(wrapped,{...localBinding,manifest})).evidence.reason,'MATCHED_CLAIM_PENDING_INDEPENDENT_REVIEW');
    assert.deepEqual((await capture(manifest)).evidence.referenceCoverage.matches,['future_stock_edge']);
    await writer.query(`DELETE FROM future_stock_edge;
      CREATE TABLE ${downstreamSchema}.link(stock_key bigint REFERENCES ${schema}.inv_batches(id));
      INSERT INTO ${downstreamSchema}.link VALUES(401)`);
    assert.deepEqual((await capture(manifest)).evidence.referenceCoverage.matches,[downstreamSchema+'.link']);
    await writer.query(`DELETE FROM ${downstreamSchema}.link;
      INSERT INTO inv_batches(id,batch_no,qty,qty_available,source_type,parent_batch_id) VALUES
      (803,'SYNTHETIC-DERIVED',4,4,'TRANSFER',501)`);
    assert.deepEqual((await capture(manifest)).evidence.referenceCoverage.matches,['inv_batches.descendants']);
    await writer.query("DELETE FROM inv_batches WHERE id=803; UPDATE inv_ledger SET note='Changed actual fact' WHERE id=104");
    assert.equal((await capture(manifest)).evidence.reason,'MATCHING_FROZEN_TEST_MANIFEST_REQUIRED');
    await writer.query("UPDATE inv_ledger SET note=NULL; UPDATE wms_warehouses SET company_code='COMP-B'");
    assert.equal((await capture(manifest)).evidence.reason,'CUSTODY_IDENTITY_UNRESOLVED');
    await writer.query("UPDATE wms_warehouses SET company_code='COMP-A'; INSERT INTO brd_daily_logs VALUES(2,'2026-11-18','HOUSE-A','AM','{}')");
    assert.equal((await capture(manifest)).evidence.reason,'ORIGINAL_STRUCTURAL_OR_LEDGER_HOLD');
    await writer.query(`DELETE FROM brd_daily_logs WHERE id=2; UPDATE brd_daily_logs SET eggs_by_grade='{"GRADE_1":11880,"GRADE_4":1}'`);
    assert.equal((await capture(manifest)).evidence.reason,'UNRESOLVED_OR_PARTIAL_OVERPOSTED_GROUP');
    await writer.query("UPDATE brd_daily_logs SET eggs_by_grade=jsonb_build_object('GRADE_1',11880); DROP TABLE store_sale_allocations");
    assert.deepEqual((await capture(manifest)).evidence.referenceCoverage.missing,['store_sale_allocations']);
    assert.equal((await writer.query('SELECT sum(qty)::int AS qty FROM inv_batches')).rows[0].qty,70);
  } finally {
    try { await reader.end(); }
    finally { try { await writer.query(`DROP SCHEMA IF EXISTS ${downstreamSchema} CASCADE; DROP SCHEMA IF EXISTS ${schema} CASCADE`); } finally { await writer.end(); } }
  }
});
