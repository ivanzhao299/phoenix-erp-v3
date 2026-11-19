import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ClsServiceManager } from 'nestjs-cls';
import type { EntityManager } from 'typeorm';
import { loadPermissionSources } from '../../auth/permission-sources';
import { resolvePermissions } from '../../auth/permissions-resolver';
import { hasPerm } from '../../auth/permissions.util';
import { DataScopeService } from '../org/services/data-scope.service';
import { OrgOwnershipService } from '../org/services/org-ownership.service';
import { SysDataScopeEntity } from '../org/entities/sys-data-scope.entity';
import { SysUserOrgEntity } from '../org/entities/sys-user-org.entity';
import { SysUserProjectScopeEntity } from '../org/entities/sys-user-project-scope.entity';
import { SysUserWarehouseScopeEntity } from '../org/entities/sys-user-warehouse-scope.entity';
import { SysUserFarmScopeEntity } from '../org/entities/sys-user-farm-scope.entity';
import { SysOrganizationEntity } from '../org/entities/sys-organization.entity';

/** Explicit, existing scope metadata only; no decorative sys_user entity or application bootstrap. */
export const CUTOVER_OPERATOR_ENTITIES=[SysDataScopeEntity,SysUserOrgEntity,SysUserProjectScopeEntity,
  SysUserWarehouseScopeEntity,SysUserFarmScopeEntity,SysOrganizationEntity];

/** Read the operator from an actually consumed admission on this exact native backend/xid.
 * Passwords, JWTs, caller claims and the legacy username=admin shortcut are never loaded. */
export async function withCutoverOperator<T>(manager:EntityManager,admissionId:string,
  action:(context:{cls:ReturnType<typeof ClsServiceManager.getClsService>;dataScopes:DataScopeService;manifestId:string;operatorId:string})=>Promise<T>):Promise<T>{
  if(!manager.queryRunner?.isTransactionActive)throw new ConflictException('CUTOVER_EXECUTOR_TRANSACTION_REQUIRED');
  const [admission]=await manager.query(`SELECT manifest_id,operator_id FROM production_cutover_apply_admissions WHERE id=$1
    AND backend_pid=pg_backend_pid() AND consumed_xid=pg_current_xact_id_if_assigned() AND expires_at>clock_timestamp()`,[admissionId]);
  if(!admission)throw new ForbiddenException('CUTOVER_EXECUTOR_CONSUMED_ADMISSION_REQUIRED');
  // One native SHARE/NOWAIT barrier protects all menu, role, scope, warehouse and proof sources until the host commits.
  try{await manager.query('SELECT lock_production_cutover_authority($1)',[admissionId]);}
  catch(error){if((error as{code?:string}).code==='55P03')throw new ConflictException('CUTOVER_OPERATOR_AUTHORITY_BUSY');throw error;}

  const id=String(admission.operator_id);
  // DataScopeService's established repository path uses numeric user IDs. Fail closed rather than round a bigint into another person.
  if(!/^[1-9][0-9]*$/.test(id)||BigInt(id)>BigInt(Number.MAX_SAFE_INTEGER))throw new ForbiddenException('CUTOVER_OPERATOR_SCOPE_ID_UNSUPPORTED');
  const [actor]=await manager.query(`SELECT user_id::text AS user_id,username,status,perms_version,store_code
    FROM sys_user WHERE user_id=$1 AND status=1`,[id]);
  if(!actor||typeof actor.username!=='string'||!actor.username.trim())throw new ForbiddenException('CUTOVER_OPERATOR_INACTIVE');
  const version=Number(actor.perms_version);
  if(!Number.isSafeInteger(version)||version<1)throw new ForbiddenException('CUTOVER_OPERATOR_VERSION_INVALID');
  const rows:Array<{role_code:string}>=await manager.query(`SELECT role.role_code FROM sys_user_role binding JOIN sys_role role ON role.role_id=binding.role_id
    WHERE binding.user_id=$1 AND COALESCE(binding.is_visible,true)=true AND role.status='ACTIVE' ORDER BY role.role_code`,[id]);
  const roles=[...new Set(rows.map(row=>row.role_code))];
  const permissions=roles.includes('ROLE_ADMIN')?['*']:resolvePermissions(await loadPermissionSources(manager,id,{activeRolesOnly:true}));
  if(!hasPerm(permissions,'MENU_PROD_INBOUND','E'))throw new ForbiddenException('CUTOVER_OPERATOR_EDIT_PERMISSION_REQUIRED');
  const cls=ClsServiceManager.getClsService();
  return cls.runWith({},async()=>{
    const ownership=new OrgOwnershipService(manager);
    const dataScopes=new DataScopeService(manager.getRepository(SysDataScopeEntity),manager.getRepository(SysUserOrgEntity),
      manager.getRepository(SysUserProjectScopeEntity),manager.getRepository(SysUserWarehouseScopeEntity),manager.getRepository(SysUserFarmScopeEntity),
      manager.getRepository(SysOrganizationEntity),cls,ownership);
    const scope=await dataScopes.resolve(id,roles,'MENU_PROD_INBOUND',version);
    const [manifest]=await manager.query('SELECT company_code,warehouse_code FROM production_cutover_manifests WHERE id=$1',[admission.manifest_id]);
    if(!manifest||!scope.isGlobal&&(!scope.allowedCompanyCodes.includes(manifest.company_code)||!scope.allowedWarehouseCodes.includes(manifest.warehouse_code)))
      throw new ForbiddenException('CUTOVER_OPERATOR_SCOPE_REQUIRED');
    cls.set('user',{userId:id,username:actor.username,roles,permissions,perms_version:version,storeCode:actor.store_code});
    cls.set('dataScope',scope);
    return action({cls,dataScopes,manifestId:admission.manifest_id,operatorId:id});
  });
}
