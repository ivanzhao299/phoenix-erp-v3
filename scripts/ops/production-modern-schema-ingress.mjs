/** Persistent native ingress for the modern original-session chain. This
 * controller cannot grant authority or remove a fence in finally/on timeout. */
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {executionEnv} from './capture-production-runtime.mjs';
import {CONTRACT} from './production-config-guard.mjs';
import {readPinnedFile} from './production-trusted-paths.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {validateModernSchemaContext} from './production-modern-schema-authority.mjs';
import {compileOwnedIngressRules,projectOwnedIngressTable,ingressIdentity} from './maintenance-ingress-policy.mjs';
const fail=code=>{throw Error('MODERN_SCHEMA_INGRESS_HOLD='+code);};
const prefix='phoenix_maintenance';
const command=(program,args)=>{try{return execFileSync(program,args,{env:executionEnv(),encoding:'utf8',timeout:5000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']}).trim();}catch{fail('NATIVE_KERNEL_OBSERVATION_OR_EFFECT_UNRESOLVED');}};
export class ModernSchemaIngress {
 constructor({context,scope,privateRuntime,admit},dependencies={}){
  this.context=validateModernSchemaContext(context);this.scope=structuredClone(scope);this.runtime=privateRuntime;this.admit=admit;this.run=dependencies.run??command;
  if(typeof admit!=='function'||canonicalDigest(scope)!==context.ingressScopeSha256||!same(Object.keys(scope).sort(),['bridge','interfaceIndex','networkId','port','subnet'])
   ||scope.port!==3100||!/^[a-f0-9]{64}$/.test(scope.networkId??'')||!Number.isSafeInteger(scope.interfaceIndex)||scope.interfaceIndex<1)fail('EXACT_NATIVE_SCOPE_REQUIRED');
  this.readProgram=dependencies.readProgram??(file=>readPinnedFile(file,{contract:CONTRACT}));
  this.ruleScope={owner:canonicalDigest(context).slice(0,32),bridge:scope.bridge,subnet:scope.subnet,port:3100};
  this.compiled=compileOwnedIngressRules(this.ruleScope,prefix);this.state='NEW';this.baseline=null;this.poisoned=false;
  this.host={bootId:fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),namespace:fs.readlinkSync('/proc/self/ns/net')};
 }
 async check(operation,admission=this.admit,denialOnly=false){
  if(this.poisoned&&!denialOnly)fail('POISONED_ORIGINAL_CHAIN');this.runtime.guard();
  if(await admission(operation)!==true)fail('ORIGINAL_NATIVE_ADMISSION_REQUIRED');
  this.runtime.guard();if(!same(this.host,{bootId:fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),namespace:fs.readlinkSync('/proc/self/ns/net')}))fail('ORIGINAL_HOST_CHANGED');
  const [network]=JSON.parse(this.run('/usr/bin/docker',['network','inspect',this.scope.networkId]));
  if(network?.Id!==this.scope.networkId||network.Driver!=='bridge'||network.Scope!=='local'||network.EnableIPv6!==false||network.IPAM?.Config?.length!==1||network.IPAM.Config[0].Subnet!==this.scope.subnet
   ||(network.Options?.['com.docker.network.bridge.name']||'br-'+network.Id.slice(0,12))!==this.scope.bridge)fail('ORIGINAL_NETWORK_CHANGED');
  const links=JSON.parse(this.run('/usr/sbin/ip',['-json','-details','link','show','dev',this.scope.bridge]));
  if(links.length!==1||links[0].ifname!==this.scope.bridge||links[0].ifindex!==this.scope.interfaceIndex||links[0].linkinfo?.info_kind!=='bridge')fail('ORIGINAL_BRIDGE_CHANGED');
  if(await admission(operation)!==true)fail('ORIGINAL_NATIVE_ADMISSION_REQUIRED');return true;
 }
 tables(){return ['inet','bridge'].map(family=>projectOwnedIngressTable(JSON.parse(this.run('/usr/sbin/nft',['--json','--handle','list','table',family,this.compiled.table])),family,this.ruleScope,prefix));}
 names(){const value=JSON.parse(this.run('/usr/sbin/nft',['--json','list','tables']));if(!Array.isArray(value.nftables))fail('COMPLETE_KERNEL_TABLE_INVENTORY_REQUIRED');return value.nftables.filter(row=>row.table?.name===this.compiled.table);}
 publish(name,value){const file=path.join(this.runtime.directory,`schema-release-ingress-${name}-${this.context.owner}.json`);this.runtime.publishJson(file,value);return file;}
 assertProgram(file,program){
  let bytes;try{bytes=this.readProgram(file);}catch{fail('NATIVE_PROGRAM_UNVERIFIED');}
  if(!Buffer.isBuffer(bytes)||!bytes.equals(Buffer.from(JSON.stringify(program)+'\n')))fail('NATIVE_PROGRAM_CHANGED');
 }
 async install(){
  if(this.state!=='NEW')fail('SINGLE_NATIVE_INSTALL_REQUIRED');this.state='INSTALL_INTENT';
  try{
   await this.check('INSTALL');if(this.names().length)fail('OWNED_TABLE_ALREADY_PRESENT');
   const program=JSON.parse(this.compiled.program),file=this.publish('install-program',program);
   this.publish('install-intent',{schema:'phoenix.modern-schema-ingress-intent/v1',owner:this.context.owner,contextDigest:canonicalDigest(this.context),scope:this.scope,host:this.host,programSha256:canonicalDigest(program),automaticUnfence:false});
   await this.check('INSTALL');this.assertProgram(file,program);this.run('/usr/sbin/nft',['--json','--file',file]);
   this.assertProgram(file,program);await this.check('INSTALL');
   this.baseline=ingressIdentity(this.tables());this.state='FENCED';const observed=await this.observe();this.publish('installed',observed);return observed;
  }catch(error){this.poisoned=true;throw error;}
 }
 async observe(){return this.#observe(this.admit);}
 async #observe(admission){
  if(this.state!=='FENCED')fail('PERSISTENT_INSTALLED_FENCE_REQUIRED');
  try{await this.check('OBSERVE',admission);const found=ingressIdentity(this.tables());if(!same(found,this.baseline))fail('NATIVE_RULE_IDENTITY_CHANGED');await this.check('OBSERVE',admission);
   return {schema:'phoenix.modern-schema-ingress-observation/v1',owner:this.context.owner,contextDigest:canonicalDigest(this.context),scopeSha256:canonicalDigest(this.scope),host:this.host,
    identitySha256:canonicalDigest(found),state:'FENCED',checkedAt:new Date().toISOString(),model:'TRUSTED_ROOT_FD9_EXCLUSIVE_WRITER',databaseIsolation:false,automaticUnfence:false};
  }catch(error){this.poisoned=true;throw error;}
 }
 async releaseBeforeOpen(){return this.#release('RELEASE_VERIFIED_FENCED',this.admit);}
 /** Emergency denial under the original root FD9. This cannot resume the
  * release or grant authority, even when ordinary admission has been lost. */
 async reinstateForFailure(admit){
  if(typeof admit!=='function'||this.state==='NEW')fail('OWNED_INSTALL_INTENT_REQUIRED');
  this.poisoned=true;
  await this.check('DENY_FAILURE',admit,true);
  const original=path.join(this.runtime.directory,`schema-release-ingress-install-program-${this.context.owner}.json`);
  const full=JSON.parse(this.compiled.program);
  const names=this.names(),families=names.map(row=>row.table?.family);
  if(names.length>2||new Set(families).size!==names.length||families.some(family=>!['inet','bridge'].includes(family)))fail('OWNED_TABLE_INVENTORY_CHANGED');
  try{this.assertProgram(original,full);}catch(error){
   // The initial install can fail before creating its program or doing any
   // nft effect. A new create-only denial program is safe only with no table.
   if(this.state!=='INSTALL_INTENT'||names.length)throw error;
   this.publish('install-program',full);this.assertProgram(original,full);
  }
  for(const family of families){
   const found=projectOwnedIngressTable(JSON.parse(this.run('/usr/sbin/nft',['--json','--handle','list','table',family,this.compiled.table])),family,this.ruleScope,prefix);
   if(this.baseline&&!this.failureCreatedFamilies?.has(family)&&!same(ingressIdentity([found]),this.baseline.filter(row=>row.family===family)))fail('NATIVE_RULE_IDENTITY_CHANGED');
  }
  const missing=['inet','bridge'].filter(family=>!families.includes(family));
  if(missing.length){
   const program={nftables:full.nftables.filter(row=>missing.includes(Object.values(Object.values(row)[0])[0].family))};
   let file=original;
   if(missing.length!==2){
    file=path.join(this.runtime.directory,`schema-release-ingress-failure-denial-program-${this.context.owner}.json`);
    try{this.assertProgram(file,program);}catch{this.publish('failure-denial-program',program);}
   }
   await this.check('DENY_FAILURE',admit,true);this.assertProgram(file,program);
   this.failureCreatedFamilies??=new Set();for(const family of missing)this.failureCreatedFamilies.add(family);
   this.run('/usr/sbin/nft',['--json','--file',file]);this.assertProgram(file,program);
  }
  await this.check('DENY_FAILURE',admit,true);
  if(this.names().length!==2)fail('NATIVE_DENIAL_INCOMPLETE');
  const found=ingressIdentity(this.tables());
  await this.check('DENY_FAILURE',admit,true);this.state='DENIED';
  return {schema:'phoenix.modern-schema-ingress-failure-denial/v1',owner:this.context.owner,contextDigest:canonicalDigest(this.context),
   host:this.host,identitySha256:canonicalDigest(found),state:'DENIED',automaticUnfence:false};
 }
 async releaseRecoveredOriginal(admit){
  if(typeof admit!=='function')fail('ORIGINAL_RECOVERY_OPEN_ADMISSION_REQUIRED');
  const file=path.join(this.runtime.directory,`schema-release-original-recovery-verified-${this.context.owner}.json`);let proof;
  try{proof=JSON.parse(this.readProgram(file));}catch{fail('PROTECTED_ORIGINAL_RECOVERY_REQUIRED');}
  if(proof?.schema!=='phoenix.modern-schema-original-recovery-proof/v1'||proof.owner!==this.context.owner
   ||proof.contextDigest!==canonicalDigest(this.context)||proof.targetSha!==this.context.runtimeSha||proof.attemptedTargetSha!==this.context.targetSha
   ||proof.outcome!=='ABORTED_BEFORE_DDL_ORIGINAL_R_RECOVERED'||proof.formalTargetSuccess!==false||proof.schemaChanged!==false)fail('PROTECTED_ORIGINAL_RECOVERY_REQUIRED');
  return this.#release('RELEASE_RECOVERED_ORIGINAL',admit);
 }
 async #release(operation,admission){
  if(this.state!=='FENCED')fail('SINGLE_VERIFIED_OPEN_RELEASE_REQUIRED');
  try{
   await this.#observe(admission);await this.check(operation,admission);this.state='RELEASE_INTENT';
   const program={nftables:['bridge','inet'].map(family=>({delete:{table:{family,name:this.compiled.table}}}))},file=this.publish('release-program',program);
   this.publish('release-intent',{schema:'phoenix.modern-schema-ingress-release/v1',owner:this.context.owner,contextDigest:canonicalDigest(this.context),identitySha256:canonicalDigest(this.baseline),programSha256:canonicalDigest(program),automaticRetry:false});
   await this.check(operation,admission);if(!same(ingressIdentity(this.tables()),this.baseline))fail('NATIVE_RULE_IDENTITY_CHANGED');
   this.assertProgram(file,program);this.run('/usr/sbin/nft',['--json','--file',file]);this.assertProgram(file,program);
   await this.check(operation,admission);if(this.names().length)fail('EXACT_OWNED_RELEASE_UNRESOLVED');
   const receipt={schema:'phoenix.modern-schema-ingress-released/v1',owner:this.context.owner,contextDigest:canonicalDigest(this.context),host:this.host,outcome:'EXACT_OWNED_TABLES_ABSENT',automaticRetry:false};
   this.publish('released',receipt);this.state='RELEASED';return receipt;
  }catch(error){this.poisoned=true;throw error;}
 }
}
