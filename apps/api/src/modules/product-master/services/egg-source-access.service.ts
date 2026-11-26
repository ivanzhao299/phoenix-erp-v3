import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { EGG_SOURCE_MENU, EggSourcePermission } from '../../../auth/egg-source-permissions';
import { loadPermissionSources } from '../../../auth/permission-sources';
import { PermSource, resolvePermissions, parseCodes } from '../../../auth/permissions-resolver';
import { hasPerm } from '../../../auth/permissions.util';
import { deriveOrgScope } from '../../farm/farm.service';
import { DataScopeService } from '../../org/services/data-scope.service';
import type { ChangeScope } from './egg-source-change.service';

export type EggSourceAccount = { userId?: string | number; perms_version?: number; impersonatedBy?: unknown };

@Injectable()
export class EggSourceAccessService {
  constructor(private readonly db: DataSource, private readonly dataScopes: DataScopeService) {}

  async resolve(user: EggSourceAccount | undefined, required: EggSourcePermission = 'V', manager = this.db.manager) {
    const id = String(user?.userId ?? '');
    if (!/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id))) {
      throw new ForbiddenException('蛋品来源档案需要有效的实名账号');
    }
    const inTransaction = manager.queryRunner?.isTransactionActive;
    const [account] = await manager.query(`SELECT perms_version FROM sys_user WHERE user_id=$1 AND status=1
      ${inTransaction ? 'FOR SHARE' : ''}`, [id]);
    const [roles, sources] = await Promise.all([
      manager.query(`SELECT r.role_code FROM sys_user_role ur JOIN sys_role r ON r.role_id=ur.role_id
        WHERE ur.user_id=$1 AND COALESCE(ur.is_visible,true) AND r.status='ACTIVE'`, [id]),
      loadPermissionSources(manager, id, { activeRolesOnly: true }),
    ]);
    if (!account) throw new ForbiddenException('账号已停用');
    const admin = roles.some((role: { role_code: string }) => role.role_code === 'ROLE_ADMIN');
    const permissions = admin ? ['*'] : resolvePermissions(sources);
    const current = Number.isSafeInteger(user?.perms_version) && user?.perms_version === Number(account.perms_version);
    if (required !== 'V' && !current) {
      throw new UnauthorizedException({ subcode: 'PERMS_CHANGED', message: '权限已变化，请以本人账号重新登录' });
    }
    if (required !== 'V' && user?.impersonatedBy) throw new ForbiddenException('须以本人身份申请或审核');
    if (!hasPerm(permissions, EGG_SOURCE_MENU, 'V') || !hasPerm(permissions, EGG_SOURCE_MENU, required)) {
      throw new ForbiddenException('缺少蛋品来源档案的查看或当前操作权限');
    }

    const grants = (action: EggSourcePermission) =>
      this.scopesFor(manager,id,EGG_SOURCE_MENU,action,sources,admin,true);
    const canWrite = current && !user?.impersonatedBy;
    const [view, edit, approve] = await Promise.all([
      grants('V'), canWrite && required !== 'A' ? grants('E') : [],
      canWrite && required !== 'E' ? grants('A') : [],
    ]);
    if (!view.length || (required === 'E' && !edit.length) || (required === 'A' && !approve.length)) {
      throw new ForbiddenException('蛋品来源档案的授权范围无法确认');
    }
    const scope = this.union(view);
    return { scope, edit, approve, actor: user?.impersonatedBy ? null : id };
  }

  async flockScope(user: EggSourceAccount | undefined, manager = this.db.manager): Promise<ChangeScope | undefined> {
    const id = String(user?.userId ?? '');
    if (!/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id))) return undefined;
    const roles: { role_code: string }[] = await manager.query(`SELECT r.role_code FROM sys_user_role ur
      JOIN sys_role r ON r.role_id=ur.role_id WHERE ur.user_id=$1 AND COALESCE(ur.is_visible,true) AND r.status='ACTIVE'`, [id]);
    const sources = await loadPermissionSources(manager, id, { activeRolesOnly: true });
    const grants = await this.scopesFor(manager,id,'MENU_FARM_DATA','V',sources,
      roles.some(row => row.role_code === 'ROLE_ADMIN'),false);
    return grants.length ? this.union(grants) : undefined;
  }

  private async scopesFor(manager: EntityManager,id:string,menu:string,action:EggSourcePermission,
    sources:PermSource[],admin:boolean,eggSource:boolean): Promise<ChangeScope[]> {
    if (!admin && !hasPerm(resolvePermissions(sources),menu,action)) return [];
    const resolver = manager.queryRunner?.isTransactionActive ? this.dataScopes.withManager(manager) : this.dataScopes;
    const scopeFor = async (role: string | null) => {
      const scope = await resolver.resolve(id,role ? [role] : [],menu,undefined,eggSource && !admin);
      return { ...deriveOrgScope({dataScope:scope}),allowedWarehouses:scope.allowedWarehouseCodes };
    };
    if (admin) return [await scopeFor('ROLE_ADMIN')];
    const rows = sources.filter(row => row.menu_code === menu &&
      (eggSource ? row.perm_codes?.split(',').some(code => code.trim()===action) : parseCodes(row.perm_codes).has(action)));
    const roles = new Map<string|null,Promise<ChangeScope>>();
    return (await Promise.all(rows.map(async row => {
      if (eggSource && action!=='V' && (!row.scope_type || !row.scope_value)) return null;
      if ((row.scope_type || row.scope_value) &&
        (!row.scope_value || !['FARM', ...(eggSource ? ['WAREHOUSE'] : [])].includes(row.scope_type??''))) return null;
      const role = row.role_code??null;
      if (!roles.has(role)) roles.set(role,scopeFor(role));
      const scope = await roles.get(role)!;
      if (row.scope_type==='FARM') return { ...scope,restrictedFarm:row.scope_value! };
      if (row.scope_type==='WAREHOUSE') {
        if (!scope.allowedWarehouses?.includes(row.scope_value!)) return null;
        const [warehouse] = await manager.query(`SELECT company_code,site_code FROM wms_warehouses
          WHERE warehouse_code=$1 AND domain='OPERATIONAL'`, [row.scope_value]);
        if (!warehouse?.company_code) return null;
        return { ...scope,restrictedWarehouse:row.scope_value!,restrictedCompany:warehouse.company_code,
          restrictedSite:warehouse.site_code||undefined };
      }
      return scope;
    }))).filter(scope => scope!==null);
  }

  private union(grants: ChangeScope[]): ChangeScope {
    return {
      isGlobal:grants.some(scope => scope.isGlobal),farmCode:null,siteCode:null,
      companyCodes:grants.flatMap(scope => scope.companyCodes??[]),
      farmCodes:grants.flatMap(scope => scope.farmCodes??[]),
      siteCodes:grants.flatMap(scope => scope.siteCodes??[]),
      allowedWarehouses:grants.flatMap(scope => scope.allowedWarehouses??[]),viewGrants:grants,
    };
  }
}
