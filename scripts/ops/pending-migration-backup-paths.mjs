/** Fixed backup namespace; no operator-provided paths or filesystem adapters
 * enter the CLI. Test dependencies model metadata, never production authority. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CONTRACT,verifyContext} from './production-config-guard.mjs';
import {assertRegularFile,assertRootIdentity,inspectTrustedDirectory,assertSameDirectory,readPinnedFile} from './production-trusted-paths.mjs';
import {physicalParent,physicalPins,archiveEvidence} from './vet-1124-backup-volume.mjs';
import {atomicState} from './production-atomic-state.mjs';
const physicalScopes=['vet-1124','egg-source-1125','production-ui-1125','egg-source-permissions-1126','egg-source-house-1126','egg-source-legacy-creation-1126','inventory-1127','egg-source-standard-1127','egg-source-retirement-1127','egg-source-operations-1127','procurement-ap-1128'];
const inspectionScopes=['egg-source-house-1126','egg-source-legacy-creation-1126','inventory-1127','egg-source-standard-1127','egg-source-retirement-1127','egg-source-operations-1127','procurement-ap-1128'];
const legacyParent='/opt/phoenix-erp-backups';
const hold=reason=>{throw Error('BACKUP_PATH_HOLD='+reason);};
function context(runId,dependencies){
 if(!/^[0-9]+-[0-9]+$/.test(runId||''))hold('RUN_ID');
 assertRootIdentity(CONTRACT,dependencies.uid??process.getuid());
 (dependencies.guard||(()=>verifyContext(CONTRACT.repository,CONTRACT.stateDirectory)))();
 const scope=dependencies.scope??'ordinary';
 if(!['ordinary',...physicalScopes].includes(scope))hold('SCOPE');
 const physical=physicalScopes.includes(scope),parent=physical?physicalParent:legacyParent;
 const io=dependencies.fs||fs;
 const inspect=dependencies.inspect||(p=>physical&&(p===parent||p.startsWith(parent+'/'))?physicalPins(p):inspectTrustedDirectory(p,CONTRACT));
 const stage=path.join(CONTRACT.stateDirectory,'migration-apply-'+runId),directory=path.join(parent,'pending-migration-'+runId);
 return {io,inspect,physical,parent,stage,directory,pinFile:path.join(stage,'backup-path-pins.json'),
  readPin:dependencies.readPin||(p=>readPinnedFile(p,{contract:CONTRACT}))};
}
function directoryPins(c){
 const pins=c.inspect(c.directory),stat=c.io.lstatSync(c.directory);
 if((stat.mode&0o7777)!==0o700)hold('RUN_DIRECTORY_MODE');
 return pins;
}
export function preparePendingMigrationBackupPaths(runId,dependencies={}){
 const c=context(runId,dependencies),stageBefore=c.inspect(c.stage),parent=c.parent;
 if(!c.physical){
  const optBefore=c.inspect('/opt');
  try{c.io.lstatSync(parent);}catch(error){if(error.code!=='ENOENT')throw error;c.io.mkdirSync(parent,{mode:0o700});}
  assertSameDirectory(optBefore,c.inspect('/opt'));
 }
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
// Only regular single-link private files produced by this exclusive run.
function filePin(file) {
 const stat=fs.lstatSync(file);
 assertRegularFile(stat);
 return [stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs];
}
function evidenceFiles(archive) {
 return [archive,archive+'.sha256',path.join(path.dirname(archive),'archive-toc.txt'),path.join(path.dirname(archive),'archive-parse.log')];
}
function receiptFile(runId,scope) {
 return path.join(CONTRACT.stateDirectory,scope+'-migration-backup-'+runId+'.json');
}
function verifyArchivePins(directory,runId,target,scope,beforeLedgerSha256,inspectionSha256) {
 const receipt=JSON.parse(readPinnedFile(receiptFile(runId,scope),{contract:CONTRACT}));
 const archive=path.join(directory,'phoenix_erp_pre_'+target.slice(0,12)+'.dump');
 if(receipt.runId!==runId||receipt.sourceSha!==target||receipt.archive!==archive||(beforeLedgerSha256&&receipt.beforeLedgerSha256!==beforeLedgerSha256)
   ||(inspectionSha256&&receipt.scopedInspectionSha256!==inspectionSha256))hold('ARCHIVE_RECEIPT');
 assertSameDirectory(receipt.files,evidenceFiles(archive).map(filePin));
 assertSameDirectory(receipt.manifest,filePin(path.join(directory,'backup-receipt.json')));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [operation,runId,...extra]=process.argv.slice(2);if(extra.length||!['prepare','verify','receipt','recover'].includes(operation))hold('ARGUMENTS');
  const scope=process.env.AUDIT_SCOPE||'ordinary';
  if(operation==='recover'){
   const target=process.env.TARGET_SHA,before=process.env.EXPECTED_BEFORE_LEDGER_SHA256,inspection=process.env.EXPECTED_VET_INSPECTION_SHA256;
   if(!inspectionScopes.includes(scope)||!/^\d+-\d+$/.test(runId||'')||!/^[a-f0-9]{40}$/.test(target||'')
      ||!/^[a-f0-9]{64}$/.test(before||'')||!/^[a-f0-9]{64}$/.test(inspection||''))hold('RECOVERY_BINDING');
   verifyContext(CONTRACT.repository,CONTRACT.stateDirectory);
   const directory=path.join(physicalParent,'pending-migration-'+runId);
   physicalPins(directory);
   verifyArchivePins(directory,runId,target,scope,before,inspection);
   console.log('MIGRATION_BACKUP_RECOVERY=VERIFIED');
  } else if(operation==='receipt'){
   if(!physicalScopes.includes(scope))hold('SCOPE');
   const check=()=>verifyPendingMigrationBackupPaths(runId,{scope});
   const {directory}=check();
   const receipt=archiveEvidence(directory,runId,process.env.TARGET_SHA,process.env.BACKUP_SHA256);
   const beforeLedgerSha256=process.env.EXPECTED_BEFORE_LEDGER_SHA256,entries=Number(process.env.TOC_ENTRIES);
   if(!/^[a-f0-9]{64}$/.test(beforeLedgerSha256||'')||!Number.isSafeInteger(entries)||entries<1)hold('ARCHIVE_RECEIPT');
   Object.assign(receipt,{beforeLedgerSha256,tocEntries:entries,verification:'pg_restore full parse and SHA-256'});
   if(inspectionScopes.includes(scope)){
    const inspection=process.env.EXPECTED_VET_INSPECTION_SHA256;
    if(!/^[a-f0-9]{64}$/.test(inspection||''))hold('INSPECTION_BINDING');
    receipt.scopedInspectionSha256=inspection;
   }
   check();
   const file=receiptFile(runId,scope);
   receipt.files=evidenceFiles(receipt.archive).map(filePin);
   assertSameDirectory(receipt.archivePin,receipt.files[0]);
   if(fs.lstatSync(file,{throwIfNoEntry:false}))hold('RECEIPT_EXISTS');
   const manifest=path.join(directory,'backup-receipt.json');
   const handle=fs.openSync(manifest,'wx',0o600);
   try { fs.writeFileSync(handle,JSON.stringify(receipt)+'\n'); fs.fsyncSync(handle); }
   finally { fs.closeSync(handle); }
   const parentHandle=fs.openSync(directory,fs.constants.O_DIRECTORY|fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
   try { fs.fsyncSync(parentHandle); } finally { fs.closeSync(parentHandle); }
   check();
   receipt.manifest=filePin(path.join(directory,'backup-receipt.json'));
   atomicState(file,receipt);
   verifyArchivePins(directory,runId,receipt.sourceSha,scope);
   console.log('MIGRATION_BACKUP_RECEIPT='+file);
  } else {
  (operation==='prepare'?preparePendingMigrationBackupPaths:verifyPendingMigrationBackupPaths)(runId,{scope});
  if(physicalScopes.includes(scope)&&operation==='verify'&&process.env.REQUIRE_BACKUP_RECEIPT==='1'){
   verifyArchivePins(path.join(physicalParent,'pending-migration-'+runId),runId,process.env.TARGET_SHA,scope,
     inspectionScopes.includes(scope)?process.env.EXPECTED_BEFORE_LEDGER_SHA256:undefined,
     inspectionScopes.includes(scope)?process.env.EXPECTED_VET_INSPECTION_SHA256:undefined);
  }
  console.log('MIGRATION_BACKUP_PATHS=VERIFIED');
  }
 }catch(error){console.error(/^(?:CONFIG_HOLD|BACKUP_PATH_HOLD)=[A-Z0-9_]+$/.test(error.message||'')?error.message:'BACKUP_PATH_HOLD=UNVERIFIED');process.exitCode=1;}
}
