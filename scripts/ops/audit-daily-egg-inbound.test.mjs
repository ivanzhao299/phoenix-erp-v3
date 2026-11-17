import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';

const script = fs.readFileSync(path.join(import.meta.dirname, 'audit-daily-egg-inbound.mjs'), 'utf8');

test('daily egg audit is read-only and covers duplicate, overpost, and legacy ledger signals', () => {
  assert.match(script, /duplicate_sources/);
  assert.match(script, /overposted/);
  assert.match(script, /日报产蛋入账/);
  assert.doesNotMatch(script, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP)\b/i);
});

test('daily egg audit reports retired duplicates and production ledger balance', () => {
  assert.match(script, /DAILY_EGG_DUPLICATE_RETIRED/);
  assert.match(script, /retired_duplicate_batches/);
  assert.match(script, /unbalanced_production_batches/);
  assert.match(script, /TEMP_PRODUCTION_REVERSAL/);
  // Balance only claims untouched batches: outbound flows legitimately rewrite qty.
  assert.match(script, /change_type NOT IN \('TEMP_PRODUCTION_INBOUND', 'TEMP_PRODUCTION_REVERSAL'\)/);
  // GO requires zero duplicates, zero overposts and a balanced production ledger.
  assert.match(script, /WHEN \(SELECT COUNT\(\*\) FROM duplicate_sources\) = 0/);
  assert.match(script, /AND \(SELECT COUNT\(\*\) FROM daily_duplicate_groups\) = 0/);
  assert.match(script, /GROUP BY log_date, house_code, shift/);
  assert.match(script, /AND \(SELECT COUNT\(\*\) FROM overposted\) = 0/);
  assert.match(script, /AND \(SELECT unbalanced_batches FROM unbalanced\) = 0/);
});

test('daily egg audit repair signal stays informational for legacy FARM_IN rows', () => {
  // Legacy rows are counted for traceability; they never gate the conclusion.
  const conclusion = script.match(/'conclusion', CASE([\s\S]*?)END/s)?.[1] ?? '';
  assert.doesNotMatch(conclusion, /farm_rows/);
});

test('actual PG covers ledger balance, full daily identity and confirmed DAILY/ALL summary ambiguity',{
  skip:process.env.DAILY_EGG_AUDIT_PG_FIXTURE!=='1',timeout:90000,
},async()=>{
  const container=`flock-daily-audit-${process.pid}-${randomBytes(4).toString('hex')}`;
  const run=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',timeout:30000,stdio:['pipe','pipe','pipe']});
  let created=false;
  try{
    run(['run','--rm','-d','--network','none','--name',container,'--label','phoenix.fixture=daily-egg-audit','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_USER=postgres','-e','POSTGRES_DB=postgres','postgres:18-alpine']);created=true;
    const until=Date.now()+30000;let ready=false;
    while(Date.now()<until){if(spawnSync('docker',['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres'],{timeout:3000,stdio:'ignore'}).status===0){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,250));}
    assert.ok(ready);
    const sql=script.match(/const auditSql = `([\s\S]*?)`;/)?.[1];assert.ok(sql);
    const old=sql.replace("COALESCE(b.legacy_source, '') NOT LIKE",'b.legacy_source NOT LIKE');assert.notEqual(old,sql);
    const setup=`CREATE TEMP TABLE brd_daily_logs(id bigint,log_date date,house_code text,shift text,eggs_by_grade jsonb);
      CREATE TEMP TABLE inv_batches(batch_no text,qty numeric,source_type text,collection_batch_ref text,egg_date date,grade_code_std text,quality_grade text,source_no text,sku_code text,spec_code text,packaging_spec text,company_code text,legacy_source text);
      CREATE TEMP TABLE inv_ledger(id bigint,batch_no text,qty_change numeric,change_type text,note text);
      INSERT INTO inv_batches(batch_no,qty,source_type,legacy_source) VALUES
        ('NULL_BALANCED',10,'TEMP_PRODUCTION',NULL),('NULL_UNBALANCED',20,'TEMP_PRODUCTION',NULL),
        ('RETIRED',999,'TEMP_PRODUCTION','DAILY_EGG_DUPLICATE_RETIRED'),
        ('PLAIN_UNBALANCED',77,'TEMP_PRODUCTION','OTHER'),('CONSUMED',1,'TEMP_PRODUCTION',NULL);
      INSERT INTO inv_ledger VALUES
        (1,'NULL_BALANCED',10,'TEMP_PRODUCTION_INBOUND','owned'),(2,'NULL_UNBALANCED',19,'TEMP_PRODUCTION_INBOUND','owned'),
        (3,'RETIRED',0,'TEMP_PRODUCTION_INBOUND','owned'),(4,'PLAIN_UNBALANCED',76,'TEMP_PRODUCTION_INBOUND','owned'),
        (5,'CONSUMED',100,'TEMP_PRODUCTION_INBOUND','owned'),(6,'CONSUMED',-99,'FIFO_OUT','owned');`;
    const report=(query=sql)=>'\nBEGIN READ ONLY;\n'+query+'\nROLLBACK;\n';
    const text=setup+report(old)+report()
      +"UPDATE inv_batches SET qty=19 WHERE batch_no='NULL_UNBALANCED'; UPDATE inv_batches SET qty=76 WHERE batch_no='PLAIN_UNBALANCED';"+report()
      +"INSERT INTO brd_daily_logs VALUES(1,'2026-11-17','OWNED-HOUSE','AM','{}'),(2,'2026-11-17','OWNED-HOUSE','PM','{}');"+report()
      +"INSERT INTO brd_daily_logs VALUES(3,'2026-11-17','OWNED-HOUSE','AM','{}');"+report()
      +"DELETE FROM brd_daily_logs WHERE id=3; UPDATE brd_daily_logs SET shift='DAILY' WHERE id=1;"+report()
      +"UPDATE brd_daily_logs SET shift=NULL WHERE id=1;"+report()
      +"UPDATE brd_daily_logs SET shift=' ' WHERE id=1;"+report()
      +"DELETE FROM brd_daily_logs; INSERT INTO brd_daily_logs VALUES(1,'2026-11-17','OWNED-HOUSE','ALL','{}');"+report()
      +"INSERT INTO brd_daily_logs VALUES(2,'2026-11-17','OWNED-HOUSE','早班','{}');"+report()
      +"UPDATE brd_daily_logs SET shift='DAILY' WHERE id=2;"+report()
      +"UPDATE brd_daily_logs SET shift=CASE id WHEN 1 THEN '早班' ELSE '晚班' END;"+report()
      +"UPDATE brd_daily_logs SET shift=' 早班' WHERE id=1;"+report();
    const output=run(['exec','-i',container,'psql','-X','-tA','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],text);
    const results=output.split('\n').filter(line=>line.startsWith('{')).map(JSON.parse);assert.equal(results.length,13);
    assert.equal(results[0].unbalanced_production_batches,1,'Old predicate silently omitted NULL_UNBALANCED');
    assert.equal(results[1].unbalanced_production_batches,2);assert.equal(results[1].conclusion,'HOLD');
    assert.equal(results[2].unbalanced_production_batches,0);assert.equal(results[2].conclusion,'GO','Balanced NULL and consumed/retired exclusions retain intended semantics');
    assert.equal(results[3].daily_duplicate_groups,0);assert.equal(results[3].daily_unknown_identity_rows,0);assert.equal(results[3].daily_mixed_summary_groups,0);assert.equal(results[3].conclusion,'GO','Different nonempty legacy shifts are separate identities');
    assert.equal(results[4].daily_duplicate_groups,1);assert.equal(results[4].conclusion,'HOLD','Same full date/house/shift identity blocks GO');
    assert.equal(results[5].daily_duplicate_groups,0);assert.equal(results[5].daily_mixed_summary_groups,1);assert.equal(results[5].conclusion,'HOLD','DAILY plus a shift is ambiguity, not duplicate identity');
    for(const i of [6,7]){assert.equal(results[i].daily_duplicate_groups,0);assert.equal(results[i].daily_unknown_identity_rows,1);assert.equal(results[i].conclusion,'HOLD','NULL/blank shift stays unknown, never normalized to a guessed shift');}
    assert.equal(results[8].daily_unknown_identity_rows,0);assert.equal(results[8].daily_mixed_summary_groups,0);assert.equal(results[8].conclusion,'GO','Confirmed ALL summary alone has a known identity');
    for(const i of [9,10]){assert.equal(results[i].daily_duplicate_groups,0);assert.equal(results[i].daily_mixed_summary_groups,1);assert.equal(results[i].conclusion,'HOLD','ALL with a detail shift or DAILY summary remains ambiguous');}
    assert.equal(results[11].daily_unknown_identity_rows,0);assert.equal(results[11].daily_mixed_summary_groups,0);assert.equal(results[11].conclusion,'GO','Historical Chinese morning/evening identities remain separate legal shifts');
    assert.equal(results[12].daily_unknown_identity_rows,1);assert.equal(results[12].conclusion,'HOLD','Outer whitespace is diagnosed without silently trimming the identity');
  }finally{if(created)run(['stop','--time','5',container]);}
});
