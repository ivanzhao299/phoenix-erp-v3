/** Readonly physical capacity gate for root/state/Docker storage. This does
 * not replace the snapshot backup's own size/reservation check. */
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {CONTRACT,verifyContext} from './production-config-guard.mjs';import {executionEnv} from './capture-production-runtime.mjs';
const fail=code=>{throw Error('MODERN_SCHEMA_DISK_HOLD='+code);};
export function observeModernSchemaDiskSpace({databaseBytes='0'}={},dependencies={}){
 const guard=dependencies.guard??(()=>verifyContext(CONTRACT.repository,CONTRACT.stateDirectory));guard();
 if(typeof databaseBytes!=='string'||!/^\d{1,20}$/.test(databaseBytes))fail('NATIVE_DATABASE_SIZE_REQUIRED');
 const dockerRoot=(dependencies.dockerRoot??(()=>execFileSync('/usr/bin/docker',['info','--format','{{.DockerRootDir}}'],{env:executionEnv(),encoding:'utf8',timeout:5000,maxBuffer:65536,stdio:['ignore','pipe','pipe']}).trim()))();
 if(!path.isAbsolute(dockerRoot)||path.normalize(dockerRoot)!==dockerRoot||fs.realpathSync(dockerRoot)!==dockerRoot)fail('LOCAL_NATIVE_DOCKER_STORAGE_REQUIRED');
 const required=4n*BigInt(databaseBytes)+2147483648n,observations=[];
 for(const [role,directory]of [['ROOT','/'],['STATE',dependencies.stateDirectory??CONTRACT.stateDirectory],['DOCKER',dockerRoot]]){
  const stat=(dependencies.statfs??((file)=>fs.statfsSync(file,{bigint:true})))(directory);
  if(typeof stat.bavail!=='bigint'||typeof stat.bsize!=='bigint'||stat.bavail<0n||stat.bsize<=0n)fail('NATIVE_AVAILABLE_SPACE_REQUIRED');
  const available=stat.bavail*stat.bsize;if(available<required)fail('INSUFFICIENT_ROOT_STATE_OR_DOCKER_SPACE');
  observations.push({role,path:directory,availableBytes:available.toString(),requiredBytes:required.toString()});
 }
 guard();return {schema:'phoenix.modern-schema-disk-observation/v1',databaseBytes,minimumFixedBytes:'2147483648',observations,readOnly:true,releaseAuthorized:false};
}
