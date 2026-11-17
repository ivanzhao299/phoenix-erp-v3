/** Fixed backup namespace; no operator-provided paths or filesystem adapters
 * enter the CLI. Test dependencies model metadata, never production authority. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CONTRACT,verifyContext} from './production-config-guard.mjs';
import {assertRootIdentity,inspectTrustedDirectory,assertSameDirectory,readPinnedFile} from './production-trusted-paths.mjs';
const parent='/opt/phoenix-erp-backups';
const hold=reason=>{throw Error('BACKUP_PATH_HOLD='+reason);};
function context(runId,dependencies){
 if(!/^[0-9]+-[0-9]+$/.test(runId||''))hold('RUN_ID');
 assertRootIdentity(CONTRACT,dependencies.uid??process.getuid());
 (dependencies.guard||(()=>verifyContext(CONTRACT.repository,CONTRACT.stateDirectory)))();
 const io=dependencies.fs||fs,inspect=dependencies.inspect|| (p=>inspectTrustedDirectory(p,CONTRACT));
 const stage=path.join(CONTRACT.stateDirectory,'migration-apply-'+runId),directory=path.join(parent,'pending-migration-'+runId);
 return {io,inspect,stage,directory,pinFile:path.join(stage,'backup-path-pins.json'),
  readPin:dependencies.readPin||(p=>readPinnedFile(p,{contract:CONTRACT}))};
}
function directoryPins(c){
 const pins=c.inspect(c.directory),stat=c.io.lstatSync(c.directory);
 if((stat.mode&0o7777)!==0o700)hold('RUN_DIRECTORY_MODE');
 return pins;
}
export function preparePendingMigrationBackupPaths(runId,dependencies={}){
 const c=context(runId,dependencies),stageBefore=c.inspect(c.stage),optBefore=c.inspect('/opt');
 try{c.io.lstatSync(parent);}catch(error){if(error.code!=='ENOENT')throw error;c.io.mkdirSync(parent,{mode:0o700});}
 assertSameDirectory(optBefore,c.inspect('/opt'));
 const parentBefore=c.inspect(parent);
 c.io.mkdirSync(c.directory,{mode:0o700}); // exclusive; never repair/reuse an existing run directory
 assertSameDirectory(parentBefore,c.inspect(parent));
 const directories=directoryPins(c),stage=c.inspect(c.stage);assertSameDirectory(stageBefore,stage);
 c.io.writeFileSync(c.pinFile,JSON.stringify({schema:'phoenix.pending-migration-backup-paths/v1',runId,directory:c.directory,directories,stage})+'\n',{mode:0o600,flag:'wx'});
 assertSameDirectory(stage,c.inspect(c.stage));assertSameDirectory(directories,directoryPins(c));
 return {directory:c.directory};
}
export function verifyPendingMigrationBackupPaths(runId,dependencies={}){
 const c=context(runId,dependencies),pin=JSON.parse(c.readPin(c.pinFile).toString('utf8'));
 if(pin?.schema!=='phoenix.pending-migration-backup-paths/v1'||pin.runId!==runId||pin.directory!==c.directory)hold('PIN_IDENTITY');
 assertSameDirectory(pin.stage,c.inspect(c.stage));assertSameDirectory(pin.directories,directoryPins(c));
 return {directory:c.directory};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [operation,runId,...extra]=process.argv.slice(2);if(extra.length||!['prepare','verify'].includes(operation))hold('ARGUMENTS');
  (operation==='prepare'?preparePendingMigrationBackupPaths:verifyPendingMigrationBackupPaths)(runId);
  console.log('MIGRATION_BACKUP_PATHS=VERIFIED');
 }catch(error){console.error(/^(?:CONFIG_HOLD|BACKUP_PATH_HOLD)=[A-Z0-9_]+$/.test(error.message||'')?error.message:'BACKUP_PATH_HOLD=UNVERIFIED');process.exitCode=1;}
}
