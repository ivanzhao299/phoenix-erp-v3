/** Test-only fixed loopback fixture identity, verified before the first database write. */
import {execFileSync} from 'node:child_process';
import {isIP} from 'node:net';
export function ownedConnection(value:string|undefined){
 let target:URL;try{target=new URL(value||'');}catch{throw Error('OWNED_LOOPBACK_POSTGRES_REQUIRED');}
 if(!['postgres:','postgresql:'].includes(target.protocol)||target.hostname!=='127.0.0.1'||target.pathname!=='/fence_test'||target.username!=='fence_fixture'||!['56416','56418'].includes(target.port)||target.search||target.hash||target.password)throw Error('OWNED_LOOPBACK_POSTGRES_REQUIRED');
 return {type:'postgres' as const,host:'127.0.0.1',port:Number(target.port),username:'fence_fixture',database:'fence_test',ssl:false as const,synchronize:false,migrationsRun:false,installExtensions:false};
}
export function inspectOwnedPg(port:string,id:string|undefined){
  if(!/^[a-f0-9]{64}$/.test(id||''))throw Error('ORIGINAL_OWNED_PG_CONTAINER_ID_REQUIRED');
  const template='[{{json .Id}},{{json .Image}},{{json .State.StartedAt}},{{json .State.Running}},{{json .RestartCount}},{{json (index .Config.Labels "phoenix.fixture")}},{{json .NetworkSettings.Ports}},{{json .Mounts}},{{json .Name}},{{if (index .State "Health")}}{{json .State.Health.Status}}{{else}}null{{end}}]';
  const run=(args:string[])=>execFileSync('/usr/bin/docker',['--host','unix:///var/run/docker.sock',...args],{env:{PATH:'/usr/bin:/bin'},encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:5000,maxBuffer:32768}).trim();
  const pin=JSON.parse(run(['inspect',id!,'--format',template]));
  if(pin[0]!==id||!/^sha256:[a-f0-9]{64}$/.test(pin[1])||pin[3]!==true||pin[4]!==0||pin[5]!=='background-control'||(pin[9]!==null&&pin[9]!=='healthy')||pin[8].startsWith('/phoenix-v3-')
   ||JSON.stringify(pin[6])!==JSON.stringify({'5432/tcp':[{HostIp:'127.0.0.1',HostPort:port}]})||pin[7].some((m:any)=>m.Type==='bind'))throw Error('ORIGINAL_OWNED_PG_IDENTITY_MISMATCH');
  const metadata=run(['inspect',id!,'--format','{{range .Config.Env}}{{if eq . "POSTGRES_DB=fence_test"}}DB_MATCH {{end}}{{if eq . "POSTGRES_USER=fence_fixture"}}USER_MATCH {{end}}{{end}}']);
  if(metadata!=='USER_MATCH DB_MATCH'&&metadata!=='DB_MATCH USER_MATCH')throw Error('OWNED_DATABASE_CONFIGURATION_MISMATCH');
  run(['exec',id!,'pg_isready','-q','-U','fence_fixture','-d','fence_test']);
  const serverAddress=run(['inspect',id!,'--format','{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}']);if(isIP(serverAddress)!==4)throw Error('OWNED_PG_NETWORK_IDENTITY_REQUIRED');
  return {id:pin[0],imageId:pin[1],startedAt:pin[2],loopbackPort:port,serverAddress,actualPgIsReady:'PASS'};
 }
