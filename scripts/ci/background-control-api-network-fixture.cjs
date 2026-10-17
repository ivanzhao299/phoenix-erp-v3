/** CI host API network restriction. This is not a production authorization or sandbox. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const EVENTS = new Set(['READY','ALLOW_TCP','ALLOW_HTTP','ALLOW_FETCH','ALLOW_LISTEN','ALLOW_DNS_LITERAL','DENY_TARGET','DENY_UNIX','DENY_TLS','DENY_DNS','DENY_REDIRECT','DENY_CUSTOM','DENY_ARGUMENT','DENY_UDP','DENY_CHILD_PROCESS','DENY_LISTEN']);
const CHANNELS = ['TCP','TCP_LISTEN','TLS','HTTP','FETCH','UNDICI_CHANNEL','DNS','UDP','CHILD_PROCESS'];
function readAudit(text, pid) {
  if (typeof text !== 'string' || text.length > 16 * 1024 * 1024 || !text.endsWith('\n')) throw Error('CI_BACKGROUND_HOLD=NETWORK_AUDIT_INCOMPLETE');
  const rows = text.trimEnd().split('\n');
  let denied = 0;
  rows.forEach((line, index) => {
    let r; try { r=JSON.parse(line); } catch { throw Error('CI_BACKGROUND_HOLD=NETWORK_AUDIT_INCOMPLETE'); }
    if (!r || typeof r!=='object' || Array.isArray(r) || Object.keys(r).sort().join(',') !== 'event,pid,protocolVersion,seq' || r.protocolVersion!==1 || r.pid!==pid || r.seq!==index+1 || !EVENTS.has(r.event)
      || (index===0 ? r.event!=='READY' : r.event==='READY')) throw Error('CI_BACKGROUND_HOLD=NETWORK_AUDIT_INCOMPLETE');
    if(r.event.startsWith('DENY_'))denied++;
  });
  if(denied)throw Error('CI_BACKGROUND_HOLD=NETWORK_ATTEMPT_DENIED');
  return {identityClass:'CI_NETWORK_RESTRICTION_NOT_PRODUCTION',notProductionSandbox:true,observedChannels:CHANNELS,complete:true,events:rows.length,denied:0};
}
let installed=false;
function installNetworkGuard(auditFd=3) {
  if(installed)throw Error('CI_NETWORK_HOLD=ALREADY_INSTALLED');
  const stat=fs.fstatSync(auditFd); const info=fs.readFileSync(`/proc/self/fdinfo/${auditFd}`,'utf8');
  const flags=Number.parseInt(info.match(/^flags:\s+([0-7]+)$/m)?.[1]||'0',8);
  // The root fixture independently binds and owns this inode before launch.
  // A standalone local transport test does not confer fixture admission.
  if(!stat.isFile() || stat.nlink!==1 || (stat.mode&0o777)!==0o600 || !(flags&fs.constants.O_APPEND))throw Error('CI_NETWORK_HOLD=AUDIT_REQUIRED');
  let seq=0;
  const emit=event=>{
    try {const row=JSON.stringify({protocolVersion:1,pid:process.pid,seq:++seq,event})+'\n';if(fs.writeSync(auditFd,row)!==Buffer.byteLength(row))throw Error();}
    catch {process.stderr.write('CI_NETWORK_HOLD=AUDIT_UNAVAILABLE\n');process.exit(78);}
  };
  const deny=event=>{emit(event);throw Error(`CI_NETWORK_HOLD=${event}`);};
  const hostAllowed=host=>host==='127.0.0.1'||host==='::1';
  const check=(host,port,http=false)=>{
    if(!hostAllowed(host)||!['5432','3100'].includes(String(port))||(http&&String(port)!=='3100'))deny('DENY_TARGET');
  };
  const custom=o=>{if(o && ['lookup','createConnection','socketPath','fd','dispatcher','connect'].some(k=>o[k]!==undefined))deny('DENY_CUSTOM');};
  const socketArgs=args=>{
    if(Array.isArray(args[0]))args=args[0];
    const first=args[0];
    if(typeof first==='string'&&!/^\d+$/.test(first))deny('DENY_UNIX');
    if(first && typeof first==='object'){
      if(first.path!==undefined&&first.path!==null)deny('DENY_UNIX');custom(first);check(first.host,first.port);
    } else { if(!['number','string'].includes(typeof first))deny('DENY_ARGUMENT');check(typeof args[1]==='string'?args[1]:undefined,first); }
  };
  const net=require('node:net'); const connect=net.Socket.prototype.connect;
  net.Socket.prototype.connect=function(...args){socketArgs(args);emit('ALLOW_TCP');return connect.apply(this,args);};
  const listen=net.Server.prototype.listen;
  net.Server.prototype.listen=function(...args){
    const first=args[0];
    if(first && typeof first==='object'){
      if(first.path!==undefined||first.fd!==undefined||first.handle!==undefined||String(first.port)!=='3100')deny('DENY_LISTEN');
      if(first.host!==undefined&&!['0.0.0.0','::','127.0.0.1','::1'].includes(first.host))deny('DENY_LISTEN');
      args[0]={...first,host:first.host==='::1'?'::1':'127.0.0.1'};
    }else{
      if(String(first)!=='3100')deny('DENY_LISTEN');
      if(typeof args[1]==='string'){
        if(!['0.0.0.0','::','127.0.0.1','::1'].includes(args[1]))deny('DENY_LISTEN');
        args[1]=args[1]==='::1'?'::1':'127.0.0.1';
      }else args.splice(1,0,'127.0.0.1');
    }
    emit('ALLOW_LISTEN');return listen.apply(this,args);
  };
  const tls=require('node:tls');tls.connect=()=>deny('DENY_TLS');tls.TLSSocket.prototype.connect=()=>deny('DENY_TLS');
  const dgram=require('node:dgram');dgram.createSocket=()=>deny('DENY_UDP');
  for(const name of ['send','connect'])dgram.Socket.prototype[name]=()=>deny('DENY_UDP');
  const child=require('node:child_process');
  for(const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])child[name]=()=>deny('DENY_CHILD_PROCESS');
  child.ChildProcess.prototype.spawn=()=>deny('DENY_CHILD_PROCESS');
  const dns=require('node:dns');
  for(const key of ['lookup','lookupService','resolve','resolve4','resolve6','resolveAny','resolveCaa','resolveCname','resolveMx','resolveNaptr','resolveNs','resolvePtr','resolveSoa','resolveSrv','resolveTxt','reverse']){
    if(typeof dns[key]==='function')dns[key]=()=>deny('DENY_DNS');
    if(typeof dns.promises[key]==='function')dns.promises[key]=async()=>deny('DENY_DNS');
    if(typeof dns.Resolver.prototype[key]==='function')dns.Resolver.prototype[key]=()=>deny('DENY_DNS');
    if(typeof dns.promises.Resolver.prototype[key]==='function')dns.promises.Resolver.prototype[key]=async()=>deny('DENY_DNS');
  }
  // net.Server.listen resolves even numeric bind addresses through lookup.
  // Answer only the two approved literal addresses, without a DNS operation.
  const literalLookup=(host,options)=>{
    if(!hostAllowed(host))deny('DENY_DNS');emit('ALLOW_DNS_LITERAL');
    const family=host==='127.0.0.1'?4:6;
    return options?.all?[{address:host,family}]:{address:host,family};
  };
  dns.lookup=(host,options,callback)=>{
    if(typeof options==='function'){callback=options;options=undefined;}
    if(typeof callback!=='function')deny('DENY_ARGUMENT');
    const result=literalLookup(host,options);
    queueMicrotask(()=>Array.isArray(result)?callback(null,result):callback(null,result.address,result.family));
  };
  dns.promises.lookup=async(host,options)=>literalLookup(host,options);
  const http=require('node:http');const https=require('node:https');
  const checkUrl=value=>{
    let u;try{u=new URL(value);}catch{deny('DENY_ARGUMENT');}
    if(u.protocol!=='http:')deny(u.protocol==='https:'?'DENY_TLS':'DENY_TARGET');
    check(u.hostname.replace(/^\[|\]$/g,''),u.port||80,true);return u;
  };
  const request=http.request;
  http.request=function(...args){
    const first=args[0];const o=(typeof first==='string'||first instanceof URL)?(checkUrl(first),args[1]):first;
    if(o && typeof o==='object'){
      custom(o);if(o.agent!==undefined&&o.agent!==false)deny('DENY_CUSTOM');
      if(!(typeof first==='string'||first instanceof URL)){
        if(o.protocol!==undefined&&o.protocol!=='http:')deny('DENY_TLS');
        check(o.hostname||o.host,o.port||80,true);
      }
    }
    emit('ALLOW_HTTP');return request.apply(this,args);
  };
  http.get=function(...args){const r=http.request(...args);r.end();return r;};
  https.request=()=>deny('DENY_TLS');https.get=()=>deny('DENY_TLS');
  // Node's built-in fetch and separately loaded undici both emit this channel.
  // Validate direct undici requests too, including any internal redirect hop.
  require('node:diagnostics_channel').channel('undici:request:create').subscribe(({request:r})=>checkUrl(r?.origin));
  const fetch=globalThis.fetch;
  if(typeof fetch==='function')globalThis.fetch=async function(input,init){
    const u=checkUrl(typeof input==='string'||input instanceof URL?input:input?.url);custom(init);
    emit('ALLOW_FETCH');
    // Never let an internally followed Location escape initial URL validation.
    const r=await fetch.call(this,input,{...init,redirect:'manual'});
    if([301,302,303,307,308].includes(r.status)&&r.headers.has('location')){
      let next;try{next=new URL(r.headers.get('location'),u);}catch{deny('DENY_REDIRECT');}
      // Redirects are deliberately unavailable in this bounded CI fixture.
      // Check only in memory; neither destination nor response data is logged.
      if(next)deny('DENY_REDIRECT');
    }
    return r;
  };
  require('node:module').syncBuiltinESMExports();
  installed=true;emit('READY');
  return {identityClass:'CI_NETWORK_RESTRICTION_NOT_PRODUCTION'};
}
module.exports={installNetworkGuard,readAudit};
if(process.execArgv.some((arg,i,args)=>['--require','-r'].includes(arg)&&path.resolve(args[i+1]||'')===__filename))installNetworkGuard();
