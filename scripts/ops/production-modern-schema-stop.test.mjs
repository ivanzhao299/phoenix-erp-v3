import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {INITIAL_MODERN_SCHEMA_PROFILE} from './production-modern-schema-facts.mjs';
import {ORIGINAL_IDLE_EXECUTOR_SQL,protectedStalledShutdownMatches,stopOriginalModernSchemaRuntime} from './production-modern-schema-stop.mjs';

function fixture({graceful=false,listenerClosed=true,active=false,fence=true,exitCode=143}={}){
  const id='a'.repeat(64),image='sha256:'+'b'.repeat(64),startedAt='2026-11-21T02:50:00.000Z';
  let now=Date.parse('2026-11-21T03:00:10.000Z');
  const configured={Name:'unless-stopped',MaximumRetryCount:0};
  let restartPolicy=configured;
  const state={Status:'running',StartedAt:startedAt,Running:true,Health:{Status:'healthy'},Pid:321,
    ExitCode:0,OOMKilled:false,Dead:false,Restarting:false,Paused:false};
  const api={id,image,startedAt,restartCount:0},originalSnapshot={containers:{api}};
  const context={...INITIAL_MODERN_SCHEMA_PROFILE,owner:'9876543210-1',targetSha:'c'.repeat(40),
    window:{start:'2026-11-21T03:00:00.000Z',end:'2026-11-21T04:00:00.000Z'},pendingMigrations:Array(20).fill({})};
  const db={databaseOid:84,systemIdentifier:'673',postmasterStartMicros:'165000'},lease={database:db,sessionPid:360,backendStartMicros:'166000'};
  const runtimeAddress='172.20.0.4',files=new Map(),commands=[];
  let interval=-1,registered=false,serialized=false;
  const run=args=>{
    switch(args[0]){
      case 'inspect':return [id,'/phoenix-v3-api',image,state,0,restartPolicy].map(v=>JSON.stringify(v)).join('\t');
      case 'update':assert.deepEqual(args,['update','--restart=no',id]);restartPolicy={Name:'no',MaximumRetryCount:0};return id;
      case 'exec':return listenerClosed?'LISTENER_CLOSED':'LISTENER_OPEN';
      case 'events':{
        assert.equal(serialized,true);
        const start=BigInt(Date.parse(args[2]))*1000000n;
        return [`kill\t${id}\t15\t\t${start+1n}`,`die\t${id}\t\t${exitCode}\t${start+2n}`].join('\n');
      }
      default:assert.fail(args[0]);
    }
  };
  const stop=code=>Object.assign(state,{Running:false,Status:'exited',Pid:0,ExitCode:code});
  const privateRuntime={
    guard(){},
    publishJson(file,record){assert.equal(files.has(path.basename(file)),false);files.set(path.basename(file),Buffer.from(JSON.stringify(record)));},
    async run(spec){
      assert.deepEqual(spec.args,['kill','--signal=TERM',id]);
      commands.push(spec.stem);
      if(spec.stem==='original-r-term'&&graceful)stop(0);
      if(spec.stem==='stalled-original-term'){assert.equal(serialized,true);stop(exitCode);}
      return {stdout:spec.stem+'.stdout',stderr:spec.stem+'.stderr',exitCode:0};
    },
  };
  const scope={context,snapshot:api,lease,runtimeAddress,ownedReadSessions:[],
    async verifyFences(locked){assert.equal(!!locked,serialized);return fence;},
    async withVerifiedStop(work){serialized=true;try{const result=await work();registered=!!result.proof;return result;}finally{serialized=false;}},
    readProtectedOutput:file=>Buffer.from(file.endsWith('.stdout')?id+'\n':''),
    client:{async query(sql){
      assert.equal(sql,ORIGINAL_IDLE_EXECUTOR_SQL);
      interval++;
      const native={...db,primary:true,statsComplete:true,preparedTransactions:0,enabledSubscriptions:0,observerPid:999,workers:[],
        sessions:[{pid:lease.sessionPid,backendStartMicros:lease.backendStartMicros,clientAddress:null,databaseOid:db.databaseOid,openTransaction:false},
          {pid:365,backendStartMicros:'167000',clientAddress:runtimeAddress,databaseOid:db.databaseOid,applicationName:'',openTransaction:active}]};
      return {rows:[{observation:JSON.stringify(native),idle_pids:JSON.stringify(active?[]:[365])}]};
    }},
  };
  const perform=()=>stopOriginalModernSchemaRuntime({originalSnapshot,privateRuntime,directory:'/owned',admit:async()=>true,
    drainStillOriginal:async()=>true,stalledShutdown:scope},{run,now:()=>now,sleep:async ms=>{now+=ms===100?1000:ms;}});
  return {perform,context,lease,commands,scope,files,observations:()=>interval+1,registered:()=>registered};
}

test('the existing graceful stop has one signal and no expanded authority',async()=>{
  const f=fixture({graceful:true});
  const receipt=await f.perform();
  assert.equal(receipt.exitCode,0);
  assert.equal(receipt.stalledShutdown,undefined);
  assert.deepEqual(f.commands,['original-r-term']);
});

test('the initial release attests a stopped original through two idle snapshots and native events',async()=>{
  const f=fixture();
  const receipt=await f.perform();
  assert.equal(f.observations(),2);
  assert.equal(f.registered(),true);
  assert.equal(receipt.exitCode,143);
  assert.equal(receipt.automaticKill,false);
  assert.equal(receipt.oldDatabaseSessionsGone,false);
  assert.deepEqual(f.commands,['original-r-term','stalled-original-term']);
  const read=file=>f.files.get(path.basename(file));
  assert.equal(protectedStalledShutdownMatches(receipt,f.context,f.lease,read),true);
  assert.equal(protectedStalledShutdownMatches(receipt,f.context,{...f.lease,sessionPid:361},read),false);
  const native=JSON.parse(read('stalled-original-termination-native.json'));
  assert.equal(protectedStalledShutdownMatches(receipt,f.context,f.lease,()=>JSON.stringify({...native,events:''})),false);
});

test('listener, active transaction, fence and exact profile violations never authorize another signal',async()=>{
  for(const [options,error] of [[{listenerClosed:false},/LISTENER_NOT_CLOSED/],
    [{active:true},/EXECUTOR_NOT_IDLE/],[{fence:false},/FENCES_UNVERIFIED/],[{},/TIMEOUT_KEEP_FENCED/]]){
    const f=fixture(options);
    if(Object.keys(options).length===0)f.scope.context.floorSha='f'.repeat(40);
    await assert.rejects(f.perform(),error);
    assert.deepEqual(f.commands,['original-r-term']);
  }
});

test('an unrelated exit signal cannot become a stopped receipt',async()=>{
  const f=fixture({exitCode:137});
  await assert.rejects(f.perform(),/TERMINAL_EVENTS_REQUIRED/);
  assert.equal(f.registered(),false);
  assert.equal(f.files.has('stalled-original-termination-native.json'),false);
});
