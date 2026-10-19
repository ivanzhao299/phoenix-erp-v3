/** Pure evaluator counterexamples plus opt-in actual isolated PG/local sink.
 * This does not prove real historical ERP domain reconciliation or full17. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { fixture } from './maintenance-transition-fixture.mjs';
import { evaluateIsolatedBusinessFacts, openIsolatedBusinessRecorder, prepareIsolatedBusinessRecorderParticipant } from './maintenance-isolated-business-recorder.fixture.mjs';
import { prepareIsolatedAuthorityParticipant } from './maintenance-isolated-authority-participant.fixture.mjs';
import { openControlParticipantFixture } from './maintenance-control-participants.fixture.mjs';
import { MaintenanceControlParticipants } from '../ops/production-maintenance-control-participants.mjs';

const hash = b => createHash('sha256').update(b).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
const domain = ['NOTIFICATION_EXTERNAL_SEND','IOT_PARTIAL_COMMITS','CHANJET_AUTH_REQUESTS','DATABASE_TRANSACTIONS','PERSISTENT_TASKS'];
function initial() {
  const context = fixture({ clock: Date.now }).context;
  context.owner = `${Date.now()}-${Math.floor(Math.random()*1000000)}`;
  return { context, directory: fs.mkdtempSync(path.join(os.tmpdir(),'phoenix-business-recorder-')),
    database: { id: 'a'.repeat(64), imageId: 'sha256:'+'b'.repeat(64), startedAt: new Date().toISOString() },
    expected: Object.fromEntries(domain.map((name,i) => [name,[['notify_one','iot_one','auth_one','transaction_one','job_one'][i]]])) };
}
function syntheticFacts(input) {
  const rows = [], sink = [], owner = input.context.owner;
  for (const d of domain.slice(0,4)) for (const id of input.expected[d]) for (const step of d === domain[1] ? [1,2] : [0]) {
    const bodySha256 = hash(`owned:${owner}:${id}`), httpStatus = d === domain[0] ? 202 : d === domain[2] ? 503 : null;
    rows.push({ owner, domain: d, id, step, status: 'COMPLETE', payload_sha256: httpStatus ? bodySha256 : null, http_status: httpStatus });
    if (httpStatus) sink.push({ owner, domain: d, id, bodySha256, httpStatus });
  }
  return { facts: { startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), databasePinSha256: 'c'.repeat(64),
    value: { database: 'maintenance_business', user: 'fixture_recorder', readOnly: 'on', operations: rows,
      jobs: input.expected[domain[4]].map(id => ({ owner, id, status: 'COMPLETE' })), sessions: [], prepared: [] } }, sink };
}
test('synthetic evaluator baseline needs the full frozen inventory, not five empty counts', () => {
  const input = initial(), { facts,sink } = syntheticFacts(input);
  const good = evaluateIsolatedBusinessFacts(input,facts,sink); assert.equal(good.evaluation,'RECONCILED'); assert.equal(good.productionReceipt,false);
  assert.equal(good.result,'SNAPSHOT_ONLY'); assert.equal(good.continuousFenceProof,false);
  const empty = structuredClone(facts); empty.value.operations=[]; empty.value.jobs=[];
  const result = evaluateIsolatedBusinessFacts(input,empty,[]); assert.equal(result.evaluation,'HOLD'); assert.equal(result.domains.every(r => r.unknownEffects>0),true);
});
test('a throwing registration callback returns the original handle and actual close, not just a PID', async () => {
  let child, error;
  try { await openIsolatedBusinessRecorder(initial(),{registerOwnedChild(c){child=c;throw Error('OWNED_REGISTRATION_REFUSED');}}); }
  catch (e) { error=e; }
  assert.match(error.message,/OWNED_REGISTRATION_REFUSED/);assert.equal(error.originalChild,child);
  assert.deepEqual(await error.originalClose,{code:0,signal:null});assert.equal(error.originalChildClosed,true);
  assert.equal(error.cleanupAttempted,true);assert.equal(error.supervisionRequired,false);
});
test('INIT timeout returns original stopped-child debt; a late actual close cannot make startup succeed', async () => {
  let child,error;
  try { await openIsolatedBusinessRecorder(initial(),{timeoutMs:40,registerOwnedChild(c){child=c;child.kill('SIGSTOP');}}); }
  catch (e) { error=e; }
  try {
    assert.match(error.message,/DEADLINE_OR_ABORT/);assert.equal(error.originalChild,child);assert.equal(error.supervisionRequired,true);
    assert.equal(error.originalChildClosed,false);assert.match(error.cleanupFailure,/DEADLINE_OR_ABORT/);
  } finally { child?.kill('SIGCONT'); if(error)assert.deepEqual(await error.originalClose,{code:0,signal:null}); }
  assert.equal(error.supervisionRequired,true); // The returned failed-start fact remains unchanged.
});
for (const [name,change] of [
  ['notification accepted but missing DB receipt',(f,s) => { f.value.operations=f.value.operations.filter(r=>r.domain!==domain[0]); }],
  ['one IoT commit only',(f,s) => { f.value.operations=f.value.operations.filter(r=>r.domain!==domain[1]||r.step===1); }],
  ['unmatched local auth attempt',(f,s) => { s.push({ ...s[1], id:'unaccounted_auth' }); }],
  ['a prepared transaction survives clients',(f,s) => { f.value.prepared.push({gid:'owned_unfinished'}); }],
  ['persistent worker crash leaves RUNNING',(f,s) => { f.value.jobs[0].status='RUNNING'; }],
  ['a foreign owner terminal',(f,s) => { f.value.operations[0].owner='99999-1'; }],
  ['an unclassified effect',(f,s) => { f.value.operations.push({domain:'UNKNOWN'}); }]
]) test('synthetic evaluator refuses '+name, () => {
  const input = initial(), { facts,sink }=syntheticFacts(input); change(facts,sink);
  assert.equal(evaluateIsolatedBusinessFacts(input,facts,sink).evaluation,'HOLD');
});

const enabled=process.env.MAINTENANCE_BUSINESS_PG_FIXTURE==='1';
test('actual isolated PG16/18 with independent durable local sink distinguishes all five domains', {skip:!enabled,timeout:120000}, async t => {
  const output=process.env.MAINTENANCE_BUSINESS_OUTPUT;
  assert.ok(output && path.isAbsolute(output) && !fs.existsSync(output)); fs.mkdirSync(output,{mode:0o700});
  for (const major of [16,18]) await t.test('PG'+major, async () => {
    const input=initial(), resources=[], receipts=[]; let recorder, originalChild, db;
    const sourceProvenance=Object.fromEntries(['./maintenance-isolated-business-recorder.fixture.mjs','./maintenance-isolated-business-recorder.test.mjs',
      './maintenance-isolated-authority-participant.fixture.mjs','./maintenance-fixture-authority.fixture.mjs'].map(name=>[name,hash(fs.readFileSync(new URL(name,import.meta.url)))]));
    const file=path.join(output,`pg${major}.json`), save=()=>fs.writeFileSync(file,JSON.stringify({fixtureOnly:true,productionReceipt:false,
      sourceState:'WORKING_SOURCE_NOT_A_PRODUCTION_GIT_RECEIPT',sourceProvenance,owner:input.context.owner,major,resources,receipts})+'\n',{mode:0o600});
    const docker=(args,options={})=>execFileSync('/usr/bin/docker',['--host','unix:///var/run/docker.sock',...args],{env:{PATH:'/usr/bin:/bin'},encoding:'utf8',timeout:5000,maxBuffer:131072,stdio:['ignore','pipe','pipe'],...options}).trim();
    const owned=()=>{const r=JSON.parse(docker(['inspect',db,'--format','[{{json .Id}},{{json .Image}},{{json .State.StartedAt}},{{json .Config.Labels}}]']));
      assert.equal(r[0],db);assert.equal(r[3]['phoenix.test.owner'],input.context.owner);assert.equal(r[3]['phoenix.test.kind'],'maintenance-business-evidence');return r;};
    const sql=statement=>{owned();return docker(['exec',db,'psql','-U','postgres','-d','maintenance_business','-X','-qAt','-v','ON_ERROR_STOP=1','-c',statement]);};
    try {
      db=docker(['run','-d','--pull=never','--network=none','--restart=no','--label','phoenix.test.kind=maintenance-business-evidence','--label',`phoenix.test.owner=${input.context.owner}`,
        '--tmpfs',major===18?'/var/lib/postgresql:rw':'/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=maintenance_business',`postgres:${major}-alpine`,'-c','max_prepared_transactions=5']);
      resources.push({id:db,kind:'OWNED_ISOLATED_POSTGRES',stopped:false});save();assert.match(db,/^[a-f0-9]{64}$/);
      for(let n=0;;n++){try{if(sql('SELECT 1')==='1')break;}catch{}assert.ok(n<50);await pause(100);}
      const serverVersionNum=Number(sql("SELECT current_setting('server_version_num')"));assert.equal(Math.floor(serverVersionNum/10000),major);resources[0].serverVersionNum=serverVersionNum;
      const pin=owned(); input.database={id:db,imageId:pin[1],startedAt:pin[2]};
      sql(`CREATE TABLE fixture_operations(owner text NOT NULL,domain text NOT NULL,id text NOT NULL,step integer NOT NULL,status text NOT NULL,payload_sha256 text,http_status integer,PRIMARY KEY(domain,id,step));
        CREATE TABLE fixture_jobs(owner text NOT NULL,id text PRIMARY KEY,status text NOT NULL);
        ALTER TABLE fixture_operations ADD COLUMN private_fixture_note text DEFAULT 'DUMMY_SYNTHETIC_NOT_FOR_ARTIFACT';
        ALTER TABLE fixture_jobs ADD COLUMN private_fixture_note text DEFAULT 'DUMMY_SYNTHETIC_NOT_FOR_ARTIFACT';
        CREATE ROLE fixture_recorder LOGIN; ALTER ROLE fixture_recorder SET default_transaction_read_only=on;
        GRANT SELECT ON fixture_operations,fixture_jobs TO fixture_recorder; GRANT pg_read_all_stats TO fixture_recorder;`);
      recorder=await openIsolatedBusinessRecorder(input,{registerOwnedChild(child){originalChild=child;resources.push({pid:child.pid,kind:'ORIGINAL_RECORDER',closed:false});save();}});
      assert.equal(recorder.sourceSha256,sourceProvenance['./maintenance-isolated-business-recorder.fixture.mjs']);
      resources.find(r=>r.pid===originalChild.pid).sourceSha256=recorder.sourceSha256;
      assert.equal((await recorder.collect()).report.evaluation,'HOLD');
      // The true recorder role has no write privilege, independently of SQL syntax.
      assert.throws(()=>docker(['exec',db,'psql','-U','fixture_recorder','-d','maintenance_business','-X','-qAt','-v','ON_ERROR_STOP=1','-c',"INSERT INTO fixture_jobs VALUES ('x','x','COMPLETE')"]));
      const owner=input.context.owner;
      for(const [route,d,status] of [['notify',domain[0],202],['auth',domain[2],503]]){
        const id=input.expected[d][0],body=`owned:${owner}:${id}`;
        const response=await fetch(`${recorder.endpoint}/${route}/${id}`,{method:'POST',body,signal:AbortSignal.timeout(2000)});await response.body?.cancel();assert.equal(response.status,status);
        sql(`INSERT INTO fixture_operations VALUES ('${owner}','${d}','${id}',0,'COMPLETE','${hash(body)}',${status})`);
      }
      const iot=input.expected[domain[1]][0],tx=input.expected[domain[3]][0],job=input.expected[domain[4]][0];
      sql(`INSERT INTO fixture_operations VALUES ('${owner}','${domain[1]}','${iot}',1,'COMPLETE',NULL,NULL);`);
      let read=await recorder.collect();assert.equal(read.report.domains[1].disposition,'UNKNOWN');receipts.push({case:'ACTUAL_PARTIAL_IOT_COMMIT',report:read.report});
      sql(`INSERT INTO fixture_operations VALUES ('${owner}','${domain[1]}','${iot}',2,'COMPLETE',NULL,NULL),('${owner}','${domain[3]}','${tx}',0,'COMPLETE',NULL,NULL);
        INSERT INTO fixture_jobs VALUES ('${owner}','${job}','RUNNING');`);
      read=await recorder.collect();assert.equal(read.report.domains[4].disposition,'UNKNOWN');receipts.push({case:'ACTUAL_PERSISTENT_RUNNING',report:read.report});
      sql(`UPDATE fixture_jobs SET status='COMPLETE' WHERE id='${job}'`);
      read=await recorder.collect();assert.equal(read.report.evaluation,'RECONCILED');receipts.push({case:'ACTUAL_FIVE_OWNED_DOMAIN_TERMINALS',report:read.report});
      assert.equal(JSON.stringify(read).includes('private_fixture_note'),false);assert.equal(JSON.stringify(read).includes('DUMMY_SYNTHETIC_NOT_FOR_ARTIFACT'),false);
      sql(`DELETE FROM fixture_operations WHERE domain='${domain[0]}'`);
      read=await recorder.collect();assert.equal(read.report.domains[0].disposition,'UNKNOWN');receipts.push({case:'ACTUAL_SEND_WITHOUT_LOCAL_RECEIPT',report:read.report});
      const id=input.expected[domain[0]][0],body=`owned:${owner}:${id}`;
      sql(`INSERT INTO fixture_operations VALUES ('${owner}','${domain[0]}','${id}',0,'COMPLETE','${hash(body)}',202)`);
      sql("BEGIN; INSERT INTO fixture_jobs VALUES ('owned','prepared_one','COMPLETE'); PREPARE TRANSACTION 'owned_recorder_prepared';");
      read=await recorder.collect();assert.equal(read.report.domains[3].disposition,'UNKNOWN');receipts.push({case:'ACTUAL_PREPARED_XACT',report:read.report});
      sql("ROLLBACK PREPARED 'owned_recorder_prepared'");
      const worker=spawn('/usr/bin/docker',['--host','unix:///var/run/docker.sock','exec',db,'psql','-U','postgres','-d','maintenance_business','-X','-qAt','-v','ON_ERROR_STOP=1','-c',"SET application_name='owned-recorder-transaction'; BEGIN; SELECT pg_sleep(2); ROLLBACK;"],{env:{PATH:'/usr/bin:/bin'},stdio:'ignore'});
      const workerClose=once(worker,'close');resources.push({pid:worker.pid,kind:'ORIGINAL_TRANSACTION_CLIENT',closed:false});save();
      let seen=false;
      for(let n=0;n<10;n++){read=await recorder.collect();if(read.report.domains[3].disposition==='UNKNOWN'){seen=true;break;}await pause(20);}
      assert.equal(seen,true);receipts.push({case:'ACTUAL_OPEN_TRANSACTION',report:read.report});assert.deepEqual(await workerClose,[0,null]);resources.at(-1).closed=true;
      assert.equal((await recorder.collect()).report.evaluation,'RECONCILED');
      const sealed=await recorder.seal();assert.equal(sealed.report.result,'SEALED_RECONCILED');
      assert.equal(sealed.report.seal.originalListenerClosed,true);assert.equal(sealed.report.seal.connectionCount,0);
      assert.equal(sealed.report.workerLifecycleProof,false);assert.equal(sealed.report.actualProductionDomainsCovered,false);
      await assert.rejects(fetch(`${recorder.endpoint}/notify/post_seal`,{method:'POST',body:'owned',signal:AbortSignal.timeout(1000)}));
      receipts.push({case:'ACTUAL_SINGLE_LISTENER_SEAL',report:sealed.report});
      await assert.rejects(recorder.close({timeoutMs:0}),/FIXED_CLOSE_BUDGET_REQUIRED/);
      const close=await recorder.close();assert.equal(close.originalChildClosed,true);assert.equal(originalChild.exitCode,0);resources.find(r=>r.pid===originalChild.pid).closed=true;
      receipts.push({case:'ORIGINAL_RECORDER_CLOSED',receipt:close});save();
      // Independent recorder processes isolate these failures. None is retried
      // into a passing final result after its observation became uncertain.
      for(const fault of ['invalid-route','oversize','partial-seal','parser-error','truncated-headers','connect','upgrade','expectation']) {
        const nextInput={...input,directory:fs.mkdtempSync(path.join(os.tmpdir(),'phoenix-business-negative-'))};
        let c, socket, agent;
        const r=await openIsolatedBusinessRecorder(nextInput,{registerOwnedChild(child){c=child;resources.push({pid:child.pid,kind:'ORIGINAL_NEGATIVE_RECORDER',fault,closed:false});save();}});
        assert.equal(r.sourceSha256,sourceProvenance['./maintenance-isolated-business-recorder.fixture.mjs']);resources.find(x=>x.pid===c.pid).sourceSha256=r.sourceSha256;
        try {
          for(const [route,d] of [['notify',domain[0]],['auth',domain[2]]]) {
            if(fault==='expectation'&&route==='notify')continue;
            const op=input.expected[d][0],response=await fetch(`${r.endpoint}/${route}/${op}`,{method:'POST',body:`owned:${owner}:${op}`,signal:AbortSignal.timeout(2000)});await response.body?.cancel();
          }
          if(fault==='expectation'){
            agent=new http.Agent({keepAlive:true,maxSockets:1});let originalSocket;
            const request=(headers,body)=>new Promise((resolve,reject)=>{
              const op=input.expected[domain[0]][0],req=http.request(`${r.endpoint}/notify/${op}`,{method:'POST',agent,headers:{'Content-Length':Buffer.byteLength(body),...headers}},res=>{
                res.resume();res.once('end',()=>resolve(res.statusCode));res.once('error',reject);
              });
              req.on('socket',s=>{if(originalSocket)assert.equal(s,originalSocket);else originalSocket=s;});
              req.once('error',reject);req.setTimeout(2000,()=>req.destroy(Error('OWNED_EXPECTATION_PROBE_TIMEOUT')));req.end(body);
            });
            assert.equal(await request({},`owned:${owner}:${input.expected[domain[0]][0]}`),202);
            const before=await r.collect();assert.equal(before.report.result,'SNAPSHOT_ONLY');assert.equal(before.report.evaluation,'RECONCILED');
            assert.equal(await request({Expect:'unsupported-owned-expectation',Connection:'close'},''),417);
            if(!originalSocket.destroyed)await new Promise(resolve=>originalSocket.once('close',resolve));
            await assert.rejects(r.seal(),/READ_REFUSED/);await assert.rejects(r.collect(),/DEADLINE_OR_UNAVAILABLE/);
            receipts.push({case:'ACTUAL_NEGATIVE_'+fault,outcome:'HOLD_SAME_ORIGINAL_KEEPALIVE_SOCKET'});continue;
          }
          const snapshot=await r.collect();assert.equal(snapshot.report.result,'SNAPSHOT_ONLY');assert.equal(snapshot.report.evaluation,'RECONCILED');
          if(fault==='invalid-route'){
            const response=await fetch(`${r.endpoint}/unknown`,{method:'POST',body:'owned',signal:AbortSignal.timeout(2000)});await response.body?.cancel();assert.equal(response.status,400);
            // A fully received rejection is an UNKNOWN journal entry; an
            // incomplete exchange poisons observation. Neither may seal PASS.
            const refused=await r.collect().then(value=>{assert.equal(value.report.evaluation,'HOLD');return false;},error=>{assert.match(error.message,/READ_REFUSED/);return true;});
            if(refused)await assert.rejects(r.seal(),/DEADLINE_OR_UNAVAILABLE/);
            else assert.equal((await r.seal()).report.result,'HOLD');
          }else if(fault==='oversize'){
            await assert.rejects(fetch(`${r.endpoint}/notify/oversize`,{method:'POST',body:'x'.repeat(257),signal:AbortSignal.timeout(2000)}));
            await assert.rejects(r.collect(),/READ_REFUSED/);await assert.rejects(r.collect(),/DEADLINE_OR_UNAVAILABLE/);
          }else if(fault==='partial-seal'){
            const url=new URL(r.endpoint);socket=net.createConnection({host:'127.0.0.1',port:Number(url.port)});await once(socket,'connect');
            socket.write('POST /notify/incomplete HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 100\r\n\r\npartial');await pause(30);
            await assert.rejects(r.seal({timeoutMs:40}),/DEADLINE_OR_ABORT/);assert.equal(r.cleanupDebt().pendingReads,1);
            await assert.rejects(r.close(),/PENDING_WORK_REQUIRES_SUPERVISION/);
            const socketClose=once(socket,'close');socket.destroy();await socketClose;
            for(let n=0;r.cleanupDebt().pendingReads;n++){assert.ok(n<100);await pause(10);}
            await assert.rejects(r.collect(),/DEADLINE_OR_UNAVAILABLE/);
          }else{
            const url=new URL(r.endpoint);socket=net.createConnection({host:'127.0.0.1',port:Number(url.port)});await once(socket,'connect');
            const packets={
              'parser-error':'not valid HTTP\r\n\r\n',
              'truncated-headers':'POST /notify/incomplete HTTP/1.1\r\nHost:',
              connect:'CONNECT localhost:3100 HTTP/1.1\r\nHost: localhost\r\n\r\n',
              upgrade:'GET / HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'
            };
            const socketClose=new Promise(resolve=>socket.once('close',resolve));socket.on('data',()=>{});socket.on('error',()=>{});socket.end(packets[fault]);await socketClose;
            await assert.rejects(r.seal(),/READ_REFUSED/);await assert.rejects(r.collect(),/DEADLINE_OR_UNAVAILABLE/);
          }
          receipts.push({case:'ACTUAL_NEGATIVE_'+fault,outcome:'HOLD_NOT_REHABILITATED'});
        }finally{agent?.destroy();socket?.destroy();await r.close();assert.equal(c.exitCode,0);resources.find(x=>x.pid===c.pid).closed=true;save();}
      }
      const graphInput={...input,directory:fs.mkdtempSync(path.join(os.tmpdir(),'phoenix-business-graph-'))};
      const recorderParticipant=prepareIsolatedBusinessRecorderParticipant(graphInput);
      const authority=prepareIsolatedAuthorityParticipant({context:input.context,records:[{purpose:'MAINTENANCE',payload:fixture({clock:Date.now}).material.approval.payload}]});
      const synthetic=await openControlParticipantFixture({context:input.context});
      const graph=new MaintenanceControlParticipants({context:input.context,definitions:[authority.definition,recorderParticipant.definition,
        synthetic.definitions.find(d=>d.role==='INGRESS_OBSERVER')]});
      try {
        await graph.bootstrap();assert.equal(synthetic.clients.length,1);
        const before=await recorderParticipant.reader.collect();assert.equal(before.report.result,'SNAPSHOT_ONLY');assert.equal(before.report.evaluation,'HOLD');
        // Health intentionally proves a working observer, not reconciled work.
        // The recorder's missing sink receipts remain HOLD until actually sent.
        for(const [route,d] of [['notify',domain[0]],['auth',domain[2]]]){
          const op=input.expected[d][0],response=await fetch(`${recorderParticipant.reader.endpoint()}/${route}/${op}`,{method:'POST',body:`owned:${owner}:${op}`,signal:AbortSignal.timeout(2000)});await response.body?.cancel();
        }
        await graph.check();const evidence=await recorderParticipant.reader.seal();assert.equal(evidence.report.result,'SEALED_RECONCILED');
        await graph.check();const close=await graph.close();assert.equal(close.graphClosed,true);
        receipts.push({case:'ACTUAL_ISSUER_AND_RECORDER_GRAPH_ONLY',report:evidence.report,close,
          ingressController:'SYNTHETIC_LIFECYCLE_ONLY',continuousIngressProof:false,completeFactory:false});save();
      }finally{await graph.close();await synthetic.cleanup();}
    } finally {
      if(recorder&&!recorder.cleanupDebt().originalChildClosed)await recorder.close();
      if(db){owned();docker(['stop','--signal','SIGTERM','--time','10',db],{timeout:12000});const state=JSON.parse(docker(['inspect',db,'--format','{{json .State}}']));assert.equal(state.Running,false);assert.equal(state.ExitCode,0);assert.equal(state.OOMKilled,false);resources[0].stopped=true;save();}
    }
  });
});
