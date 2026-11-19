/** Synthetic local PG only; retain the fresh fixture database for inspection. */
import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
import {captureModernSchemaDefaultOff} from './production-modern-schema-facts.mjs';
test('native post-ingress OFF observation reads all four authorities and rejects a single activated row',{skip:process.env.MODERN_SCHEMA_OFF_PG!=='1'},async()=>{
 const container='phoenix-temp-reversal-20261118';
 const labels=JSON.parse(execFileSync('/usr/bin/docker',['inspect',container,'--format','{{json .Config.Labels}}'],{encoding:'utf8'}));assert.equal(labels['phoenix.fixture'],'temp-reversal');
 const native=execFileSync('/usr/bin/docker',['exec',container,'psql','-X','-qAt','-U','postgres','-d','postgres','-c','SELECT system_identifier::text FROM pg_control_system()'],{encoding:'utf8'}).trim();
 const {Client}=createRequire(new URL('../../apps/api/package.json',import.meta.url))('pg');
 const admin=new Client({host:'127.0.0.1',port:44889,user:'postgres',database:'postgres'});await admin.connect();let client;
 try{
  assert.equal((await admin.query('SELECT system_identifier::text AS id FROM pg_control_system()')).rows[0].id,native);
  const database='modern_schema_off_'+Date.now();await admin.query('CREATE DATABASE "'+database+'"');
  client=new Client({host:'127.0.0.1',port:44889,user:'postgres',database});await client.connect();
  const tables=['production_cutover_scopes','production_batch_qualifications','production_cutover_apply_admissions','production_cutover_apply_results'];
  for(const table of tables)await client.query('CREATE TABLE public."'+table+'" (id integer NOT NULL)');
  await client.query('SET default_transaction_read_only=on');
  const options={floor:{chanjetPolicy:'HOLD',readonlyApproval:null}},target='a'.repeat(40);
  const off=await captureModernSchemaDefaultOff(client,target,options);assert.equal(off.verified,true);assert.equal(off.observedTables.length,4);
  assert.ok(off.observedTables.every(row=>row.rows==='0'));
  await client.query('SET default_transaction_read_only=off');await client.query('INSERT INTO public.production_cutover_scopes (id) VALUES (1)');await client.query('SET default_transaction_read_only=on');
  await assert.rejects(captureModernSchemaDefaultOff(client,target,options),/BUSINESS_ACTIVATION_ALREADY_PRESENT/);
 }finally{if(client)await client.end();await admin.end();}
});
