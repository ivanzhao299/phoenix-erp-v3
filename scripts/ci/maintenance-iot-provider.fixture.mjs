/** Independent HTTP process for synthetic loopback IoT operations only.
 * No production credentials, ERP imports or production authorization. */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const exact=(value,keys)=>value&&Object.getPrototypeOf(value)===Object.prototype&&JSON.stringify(Object.keys(value).sort())===JSON.stringify([...keys].sort());
const refuse=()=>{throw Error('OWNED_IOT_PROVIDER_HOLD');};
let initial,server,journal,pin,fatal=false,closing=false,pending=0;
const events=[],held=new Map(),sockets=new Set();
function verify(){
 const stat=fs.lstatSync(journal);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==process.getuid()||stat.nlink!==1||(stat.mode&0o777)!==0o600||stat.dev!==pin.dev||stat.ino!==pin.ino)refuse();
 const raw=fs.readFileSync(journal,'utf8');if(raw!==events.map(event=>JSON.stringify(event)+'\n').join(''))refuse();return hash(raw);
}
function record(event){
 try{verify();const fd=fs.openSync(journal,fs.constants.O_WRONLY|fs.constants.O_APPEND|fs.constants.O_NOFOLLOW);
  try{const stat=fs.fstatSync(fd);if(stat.dev!==pin.dev||stat.ino!==pin.ino)refuse();fs.writeSync(fd,JSON.stringify(event)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  events.push(event);
 }catch(error){fatal=true;throw error;}
}
if(process.env.OWNED_IOT_PROVIDER!=='SYNTHETIC_LOOPBACK_ONLY'||!process.send)refuse();
process.on('disconnect',()=>{fatal=true;server?.close();});
process.on('message',async request=>{
 try{
  if(!exact(request,['id','operation','value'])||typeof request.id!=='string'||request.id.length>80||Buffer.byteLength(JSON.stringify(request))>16384)refuse();
  let value;
  if(request.operation==='INIT'){
   if(initial||!exact(request.value,['directory','owner','cases']))refuse();initial=request.value;
   if(!/^[a-f0-9]{32}$/.test(initial.owner)||!path.isAbsolute(initial.directory)||fs.realpathSync(initial.directory)!==initial.directory||!initial.directory.includes('/artifacts/maintenance-iot/owned-')||initial.directory.startsWith('/data/'))refuse();
   const stat=fs.lstatSync(initial.directory);
   if(!stat.isDirectory()||stat.uid!==process.getuid()||(stat.mode&0o777)!==0o700)refuse();
   if(!Array.isArray(initial.cases)||initial.cases.length<1||initial.cases.length>8||initial.cases.some(c=>!exact(c,['id','houseId','property','reading','collectTime','hold'])||!/^[a-f0-9]{32}$/.test(c.id)||!Number.isSafeInteger(c.houseId)||c.houseId<1||!/^fixture_[a-z0-9]+$/.test(c.property)||!Number.isFinite(c.reading)||!Number.isSafeInteger(c.collectTime)||c.collectTime<1||typeof c.hold!=='boolean')||new Set(initial.cases.map(c=>c.id)).size!==initial.cases.length||new Set(initial.cases.map(c=>c.houseId)).size!==initial.cases.length)refuse();
   journal=path.join(initial.directory,'sink.jsonl');fs.writeFileSync(journal,'',{mode:0o600,flag:'wx'});pin=fs.lstatSync(journal);
   server=http.createServer((req,res)=>{
    pending++;let bytes=0,settled=false;const chunks=[];
    const settle=()=>{if(!settled){settled=true;pending--;}};
    res.once('close',()=>{if(!res.writableFinished)fatal=true;settle();});res.once('finish',settle);
    req.once('error',()=>{fatal=true;});req.once('aborted',()=>{fatal=true;});
    req.on('data',chunk=>{bytes+=chunk.length;if(bytes>4096){fatal=true;req.destroy();}else chunks.push(chunk);});
    req.on('end',()=>{
     try{
      if(fatal||closing||req.method!=='POST'||req.headers['content-type']!=='application/json'||events.length>=64)refuse();
      const raw=Buffer.concat(chunks),body=JSON.parse(raw.toString('utf8'));let scenario,kind,response;
      if(req.url==='/open/api/auth/token/get'){
       if(!exact(body,['appId','appSecret']))refuse();scenario=initial.cases.find(c=>body.appId==='dummy-'+c.id&&body.appSecret==='test-only-'+c.id);if(!scenario)refuse();
       kind='AUTH';response={success:true,data:{accessToken:'synthetic-'+scenario.id,expireTime:4102444800}};
      }else if(req.url==='/open/api/house/device/propertys'){
       if(!exact(body,['houseId']))refuse();scenario=initial.cases.find(c=>c.houseId===body.houseId&&req.headers.authorization==='synthetic-'+c.id);if(!scenario)refuse();
       kind='DATA';response={success:true,data:[{propertys:[{code:scenario.property,value:scenario.reading,lastUpdateTime:scenario.collectTime}]}]};
      }else refuse();
      const output=JSON.stringify(response);
      record({index:events.length+1,kind:'RECEIVED',requestKind:kind,operationId:scenario.id,requestSha256:hash(raw),bytes});
      const respond=()=>{
       if(fatal||closing)refuse();record({index:events.length+1,kind:'RESPONSE_COMMITTED',requestKind:kind,operationId:scenario.id,status:200,responseSha256:hash(output)});
       res.writeHead(200,{'Content-Type':'application/json',Connection:'close'});res.end(output);
      };
      if(kind==='DATA'&&scenario.hold){if(held.has(scenario.id))refuse();held.set(scenario.id,respond);}else respond();
     }catch{fatal=true;res.destroy();}
    });
   });
   server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});server.on('clientError',()=>{fatal=true;});
   await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
   value={owner:initial.owner,port:server.address().port,productionAuthority:false};
  }else if(request.operation==='RELEASE'){
   if(!initial||fatal||!exact(request.value,['operationId'])||!held.has(request.value.operationId))refuse();
   const respond=held.get(request.value.operationId);held.delete(request.value.operationId);respond();value={released:true};
  }else if(request.operation==='SNAPSHOT'){
   if(!initial||!exact(request.value,[]))refuse();value={events,journalSha256:verify(),fatal,pendingRequests:pending,heldResponses:held.size,productionAuthority:false};
  }else if(request.operation==='CLOSE'){
   if(!initial||fatal||closing||!exact(request.value,[])||pending||held.size)refuse();closing=true;
   await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
   if(fatal||pending||sockets.size)refuse();value={originalListenerClosed:true,journalSha256:verify(),productionAuthority:false};
   process.send({id:request.id,ok:true,value},()=>process.disconnect());return;
  }else refuse();
  process.send({id:request.id,ok:true,value});
 }catch{fatal=true;process.send?.({id:request?.id,ok:false});}
});
