import 'reflect-metadata';

/** Import-only host runtime. Loading this module starts no application, database, server or background task. */
export { applyApprovedProductionCutover } from '../modules/wms/production-cutover-executor';
export { CUTOVER_OPERATOR_ENTITIES } from '../modules/wms/production-cutover-operator';
export const CUTOVER_RUNTIME_PROTOCOL='phoenix.production-cutover-runtime/1';

if(require.main===module){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--self-check'){
    process.stdout.write(JSON.stringify({protocol:CUTOVER_RUNTIME_PROTOCOL,moduleOnly:true,databaseInitialized:false,activationAuthorized:false})+'\n');
  }else{
    process.stderr.write('PRODUCTION_CUTOVER=HOLD_TRUSTED_HOST_REQUIRED;databaseInitialized=false\n');process.exitCode=2;
  }
}
