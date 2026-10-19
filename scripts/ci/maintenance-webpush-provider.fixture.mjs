/** Independent loopback TLS sink for isolated, test-generated Web Push only.
 * Never imports production authority, credentials or ERP mutation code. */
import fs from 'node:fs';import https from 'node:https';import path from 'node:path';import {createHash} from 'node:crypto';
const digest=x=>createHash('sha256').update(x).digest('hex');
const exact=(x,keys)=>x&&Object.getPrototypeOf(x)===Object.prototype&&JSON.stringify(Object.keys(x).sort())===JSON.stringify(keys.sort());
let server,initial,journal,pin,fatal=false,closing=false;const events=[],held=new Map(),sockets=new Set();let pending=0;
const refuse=()=>{throw Error('OWNED_PUSH_PROVIDER_HOLD');};
function verifyJournal(){const s=fs.lstatSync(journal);if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid()||s.nlink!==1||(s.mode&0o777)!==0o600||s.dev!==pin.dev||s.ino!==pin.ino)refuse();
 const raw=fs.readFileSync(journal,'utf8');if(raw!==events.map(x=>JSON.stringify(x)+'\n').join(''))refuse();return digest(raw);}
function record(value){try{verifyJournal();const fd=fs.openSync(journal,fs.constants.O_APPEND|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW);try{const s=fs.fstatSync(fd);if(s.dev!==pin.dev||s.ino!==pin.ino)refuse();fs.writeSync(fd,JSON.stringify(value)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}events.push(value);}catch(e){fatal=true;throw e;}}
if(process.env.OWNED_WEBPUSH_PROVIDER!=='EPHEMERAL_TEST_TLS_ONLY'||!process.send)refuse();
process.on('disconnect',()=>{fatal=true;server?.close();});
process.on('message',async request=>{try{
 if(!exact(request,['id','operation','value'])||typeof request.id!=='string'||request.id.length>80||Buffer.byteLength(JSON.stringify(request))>32768)refuse();
 let value;
 if(request.operation==='INIT'){
  if(initial||!exact(request.value,['directory','owner','cert','key','cases']))refuse();initial=request.value;
  if(!/^[a-f0-9]{32}$/.test(initial.owner)||!path.isAbsolute(initial.directory)||fs.realpathSync(initial.directory)!==initial.directory||!initial.directory.includes('/artifacts/maintenance-notification/owned-')||initial.directory.startsWith('/data/'))refuse();
  const d=fs.lstatSync(initial.directory);if(!d.isDirectory()||d.uid!==process.getuid()||(d.mode&0o777)!==0o700)refuse();
  if(!Array.isArray(initial.cases)||initial.cases.length<1||initial.cases.length>8||initial.cases.some(c=>!exact(c,['id','status','hold'])||!/^[a-f0-9]{32}$/.test(c.id)||![202,503].includes(c.status)||typeof c.hold!=='boolean')||new Set(initial.cases.map(c=>c.id)).size!==initial.cases.length)refuse();
  journal=path.join(initial.directory,'sink.jsonl');fs.writeFileSync(journal,'',{mode:0o600,flag:'wx'});pin=fs.lstatSync(journal);
  server=https.createServer({cert:initial.cert,key:initial.key},(req,res)=>{
   pending++;const chunks=[];let size=0,settled=false;
   const settle=()=>{if(!settled){settled=true;pending--;}};
   res.once('close',()=>{if(!res.writableFinished)fatal=true;settle();});res.once('finish',settle);
   req.on('error',()=>{fatal=true;});req.on('aborted',()=>{fatal=true;});
   req.on('data',b=>{size+=b.length;if(size>65536){fatal=true;req.destroy();}else chunks.push(b);});
   req.on('end',()=>{try{
    const scenario=initial.cases.find(c=>req.url==='/'+c.id);
    if(fatal||closing||req.method!=='POST'||!scenario||size<1||req.headers['content-encoding']!=='aes128gcm'||events.length>=32)refuse();
    const index=events.length+1;record({kind:'RECEIVED',index,operationId:scenario.id,encryptedBodySha256:digest(Buffer.concat(chunks)),bytes:size});
    const respond=()=>{if(fatal||closing)refuse();record({kind:'RESPONSE_COMMITTED',index:events.length+1,operationId:scenario.id,status:scenario.status});res.writeHead(scenario.status,{Connection:'close'});res.end();};
    if(scenario.hold){if(held.has(scenario.id))refuse();held.set(scenario.id,respond);}else respond();
   }catch{fatal=true;res.destroy();}});
  });
  server.on('connection',s=>{sockets.add(s);s.once('close',()=>sockets.delete(s));});server.on('clientError',()=>{fatal=true;});server.on('tlsClientError',()=>{fatal=true;});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  value={port:server.address().port,owner:initial.owner,source:'OWNED_TEST_TLS_SINK',productionAuthority:false};
 }else if(request.operation==='RELEASE'){
  if(!initial||fatal||!exact(request.value,['operationId'])||!held.has(request.value.operationId))refuse();
  const respond=held.get(request.value.operationId);held.delete(request.value.operationId);respond();value={released:true};
 }else if(request.operation==='SNAPSHOT'){
  if(!initial||!exact(request.value,[]))refuse();value={events,journalSha256:verifyJournal(),pendingRequests:pending,heldResponses:held.size,fatal,productionAuthority:false};
 }else if(request.operation==='CLOSE'){
  if(!initial||fatal||closing||!exact(request.value,[])||held.size||pending)refuse();closing=true;
  await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  if(sockets.size||pending||fatal)refuse();value={originalListenerClosed:true,journalSha256:verifyJournal(),productionAuthority:false};
  process.send({id:request.id,ok:true,value},()=>process.disconnect());return;
 }else refuse();
 process.send({id:request.id,ok:true,value});
}catch{fatal=true;process.send?.({id:request?.id,ok:false});}});
