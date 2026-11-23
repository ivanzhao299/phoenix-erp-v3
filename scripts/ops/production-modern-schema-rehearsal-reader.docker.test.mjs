import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import test from 'node:test';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {ModernSchemaExecutorWatch} from './production-modern-schema-watch.mjs';
import {ModernSchemaReadClient} from './production-modern-schema-read-client.mjs';
import {readRehearsalSubnet} from './production-modern-schema-rehearsal.mjs';
import {pinModernSchemaChild} from './production-modern-schema-processes.mjs';

test('a real isolated PostgreSQL reader survives native host census and leaves no production backend admission', {
  skip:process.env.MODERN_SCHEMA_FENCED_READER_DOCKER!=='1',timeout:90000,
},async t=>{
  const docker=(binary,args)=>execFileSync(binary,args,{encoding:'utf8',timeout:12000,stdio:['ignore','pipe','pipe']}).trim();
  const run=args=>docker('/usr/bin/docker',args);
  const owner=`${Date.now()}-1`,prefix='phoenix-fenced-reader-'+owner;
  const labels=['--label','phoenix.schema.owner='+owner];
  let network,volume,cid;
  t.after(()=>{
    if(cid){
      if(run(['inspect',cid,'--format','{{.State.Running}}'])==='true')run(['kill','--signal=TERM',cid]);
      run(['wait',cid]);
      run(['rm',cid]);
    }
    if(volume)run(['volume','rm',volume]);
    if(network)run(['network','rm',network]);
  });
  const subnet=process.env.MODERN_SCHEMA_FENCED_READER_SUBNET??readRehearsalSubnet();
  network=run(['network','create','--internal',...labels,'--subnet',subnet,'--label','phoenix.schema.role=rehearsal-network',prefix]);
  const [pinned]=JSON.parse(run(['network','inspect',network]));
  assert.equal(pinned.Internal,true);
  assert.equal(pinned.IPAM.Config[0].Subnet,subnet);
  if(!process.env.MODERN_SCHEMA_FENCED_READER_SUBNET)assert.notEqual(readRehearsalSubnet(),subnet);
  volume=run(['volume','create',...labels,'--label','phoenix.schema.role=rehearsal-data']);
  const image=run(['image','inspect','postgres:16-alpine','--format','{{.Id}}']);
  cid=run(['create','--pull=never','--name',prefix,...labels,'--label','phoenix.schema.role=rehearsal-database',
    '--network',network,'--restart=no','--mount',`type=volume,source=${volume},target=/var/lib/postgresql/data`,
    '-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_USER=postgres','-e','POSTGRES_DB=postgres',
    '--health-cmd','pg_isready -U postgres -h 127.0.0.1','--health-interval=1s','--health-timeout=2s',image]);
  run(['start',cid]);
  const deadline=Date.now()+30000;
  while(run(['inspect',cid,'--format','{{.State.Health.Status}}'])!=='healthy'){
    assert.ok(Date.now()<deadline);
    await pause(250);
  }
  const identity=run(['exec',cid,'psql','-XqAt','-U','postgres','-c','SELECT system_identifier::text FROM pg_control_system()']);
  const productionDatabaseId='d'.repeat(64),productionNetwork='e'.repeat(64);
  const snapshot={db:{id:productionDatabaseId}},original={database:{systemIdentifier:'1'}};
  assert.notEqual(identity,original.database.systemIdentifier);
  const record={owner,containerId:cid,stage:'fenced',role:'rehearsal-database',imageId:image,networkId:network,volume,databaseMajor:16};
  const children=new Set(),runtime={children,guard(){},registeredChildren:()=>[...children]};
  const client=new ModernSchemaReadClient({guard(){},databaseContainer:cid});
  let observedClient=client;
  const inspect=()=>{
    const {pin}=pinModernSchemaChild(observedClient.child);
    return {...pin,ppid:pin.parentPid,erpControlReference:true};
  };
  let phase='FRESH_RECHECKED';
  const watch=new ModernSchemaExecutorWatch({
    context:{owner,runtimeSnapshotSha256:canonicalDigest(snapshot)},
    preparation:{originalSnapshot:{containers:snapshot},ownedResources:[record],hostSurface:{ingressScope:{networkId:productionNetwork}}},
    state:{read:()=>({owner,phase,status:'RUNNING'})},rootLease:original,privateRuntime:runtime,admit:async()=>true,
  },{run:docker,processIdentity:inspect,captureProcesses:()=>[inspect()]});
  watch.running=true;
  await assert.rejects(watch.startFencedRehearsalReader(client,cid,original.database.systemIdentifier),/EXACT_FENCED_REHEARSAL_READER_REQUIRED/);
  phase='API_BODY';
  await assert.rejects(watch.startFencedRehearsalReader(client,cid,identity),/EXACT_FENCED_REHEARSAL_READER_REQUIRED/);
  phase='FRESH_RECHECKED';
  await assert.rejects(watch.startFencedRehearsalReader(client,cid,'2'),/EXACT_FENCED_REHEARSAL_DATABASE_REQUIRED/);
  assert.equal(client.child,null);
  assert.equal(children.size,0);
  // A transport instance is single use after its checked close.
  const live=new ModernSchemaReadClient({guard(){},databaseContainer:cid});
  observedClient=live;
  try{
    const starting=watch.startFencedRehearsalReader(live,cid,identity);
    const nativeCensus=watch.serially(()=>watch.verifyProcesses([]));
    await starting;
    await nativeCensus;
    assert.equal(children.size,1);
    assert.deepEqual(watch.readers,[]);
    const child=live.child;
    assert.equal([...children][0].pin.pid,child.pid);
    await assert.rejects(watch.startFencedRehearsalReader(new ModernSchemaReadClient({guard(){},databaseContainer:cid}),cid,identity),
      /EXACT_FENCED_REHEARSAL_READER_REQUIRED/);
    await watch.closeFencedRehearsalReader(live);
    assert.equal(child.exitCode,0);
    assert.equal(fs.existsSync('/proc/'+child.pid),false);
    assert.equal(children.size,0);
  }finally{
    if(live.child)await watch.closeFencedRehearsalReader(live);
  }
});
