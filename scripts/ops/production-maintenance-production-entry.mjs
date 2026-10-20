/** The only fixed production legacy-factory entry. No stdin script, adapter
 * path, command override or environment approval can supply a producer. */
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {CONTRACT,verifyContext,secureJson} from './production-config-guard.mjs';
import {validateReleasePlan} from './production-maintenance-deployment-session.mjs';
import {createMaintenanceReadControllers} from './production-maintenance-controller-factory.mjs';
import {assembleMaintenanceFactory} from './production-maintenance-factory.mjs';
import {createProductionMaintenanceSources} from './production-maintenance-root-sources.mjs';
import {createProductionMaintenanceReaders} from './production-maintenance-root-readers.mjs';
import {hold} from './production-maintenance-receipts.mjs';

export async function runProductionMaintenanceSession(){
  verifyContext(CONTRACT.repository,CONTRACT.stateDirectory);
  const owner=process.env.DEPLOY_RUN_ID;
  if(!/^\d+-\d+$/.test(owner||''))hold('SESSION_OWNER_REQUIRED');
  const plan=validateReleasePlan(secureJson(path.join(CONTRACT.stateDirectory,`maintenance-release-plan-${owner}.json`)));
  if(plan.context.owner!==owner)hold('SESSION_PLAN_OWNER_MISMATCH');
  const readControllers=createMaintenanceReadControllers(plan);
  const readers=createProductionMaintenanceReaders(plan,{readControllers});
  const sources=createProductionMaintenanceSources(plan,{readControllers,readers});
  return assembleMaintenanceFactory({plan,sources,readControllers}).run();
}

export function retainControllerOnRecoveryIncident(error){
  if(/SESSION_(?:FORMAL_SUCCESS|HOLD)_(?:LEASE_RELEASE|CONTROL_CLIENT|CONTROLLER_CLOSE)_INCIDENT|SESSION_CHILDREN_UNVERIFIED_MANUAL_RECOVERY_REQUIRED|SESSION_BOOTSTRAP_CONTROLLER_CLOSE_UNVERIFIED/.test(error?.message||'')){
    console.error('MAINTENANCE_CONTROLLER=RETAINED_FOR_MANUAL_RECOVERY');setInterval(()=>{},1000);return true;
  }
  return false;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    if(process.argv.length!==3||process.argv[2]!=='run')hold('SESSION_FIXED_COMMAND_REQUIRED');
    await runProductionMaintenanceSession();console.log('MAINTENANCE_SESSION=SUCCESS');
  }catch(error){
    console.error(/^\w+_HOLD=[A-Z0-9_]+$/.test(error.message)?error.message:'MAINTENANCE_HOLD=PRODUCTION_FACTORY_FAILED');
    process.exitCode=1;
    retainControllerOnRecoveryIncident(error);
  }
}
