import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { EGG_SOURCE_MENU, EggSourcePermission } from '../../../auth/egg-source-permissions';
import { loadPermissionSources } from '../../../auth/permission-sources';
import { eggSourceHouseDenials,loadEggSourceOrganizationGrants,type EggSourceHouseAction,type EggSourceGrantProposal } from '../../../auth/egg-source-organization-grants';
import { PermSource, resolvePermissions, parseCodes } from '../../../auth/permissions-resolver';
import { hasPerm } from '../../../auth/permissions.util';
import { deriveOrgScope } from '../../farm/farm.service';
import { OrgOwnershipService } from '../../org/services/org-ownership.service';
import { DataScopeService } from '../../org/services/data-scope.service';
import { sourceScopeFor,type ChangeScope } from './egg-source-change.service';
import { canAccessEggSource,type EggSourceOwner } from './egg-source-change-policy';

export type EggSourceAccount = { userId?: string | number; perms_version?: number; impersonatedBy?: unknown };

@Injectable()
export class EggSourceAccessService {
  constructor(private readonly db: DataSource, private readonly dataScopes: DataScopeService) {}

  async resolve(user: EggSourceAccount | undefined, required: EggSourceHouseAction = 'V',
    manager = this.db.manager, contract?:1|2, proposal?:EggSourceGrantProposal) {
    const id = String(user?.userId ?? '');
    if (!/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id))) {
      throw new ForbiddenException('蛋品来源档案需要有效的实名账号');
    }
    const [account] = await manager.query(`SELECT perms_version FROM sys_user WHERE user_id=$1 AND status=1
      ${manager.queryRunner?.isTransactionActive ? 'FOR SHARE' : ''}`, [id]);
    if (!account) throw new ForbiddenException('账号已停用');
    const current = Number.isSafeInteger(user?.perms_version) && user?.perms_version === Number(account.perms_version);
    if (required !== 'V' && !current) {
      throw new UnauthorizedException({ subcode: 'PERMS_CHANGED', message: '权限已变化，请以本人账号重新登录' });
    }
    if (required !== 'V' && user?.impersonatedBy) throw new ForbiddenException('须以本人身份申请或审核');
    const [roles, sources, organizationGrants] = await Promise.all([
      manager.query(`SELECT r.role_code FROM sys_user_role ur JOIN sys_role r ON r.role_id=ur.role_id
        WHERE ur.user_id=$1 AND COALESCE(ur.is_visible,true) AND r.status='ACTIVE'`, [id]),
      loadPermissionSources(manager, id, { activeRolesOnly: true }),
      contract===1 ? [] : loadEggSourceOrganizationGrants(manager,id,proposal),
    ]);
    const admin = roles.some((role: { role_code: string }) => role.role_code === 'ROLE_ADMIN');
    const canWrite = current && !user?.impersonatedBy;
    const legacyGrants = (action: EggSourcePermission) =>
      contract===2 ? [] : this.scopesFor(manager,id,EGG_SOURCE_MENU,action,sources,admin,true);
    const [view, edit, approve] = await Promise.all([
      legacyGrants('V'), canWrite ? legacyGrants('E') : [], canWrite ? legacyGrants('A') : [],
    ]);
    const restrictions = { COMPANY:'restrictedCompany',FARM:'restrictedFarm',SITE:'restrictedSite',HOUSE:'restrictedHouse' } as const;
    const denials = eggSourceHouseDenials(sources);
    let houseGrants: (action:EggSourceHouseAction)=>ChangeScope[] = ()=>[];
    if (contract!==1 && (admin || organizationGrants.length)) {
      const resolver = manager.queryRunner?.isTransactionActive ? this.dataScopes.withManager(manager) : this.dataScopes;
      const dataScope = await resolver.resolve(id,admin ? ['ROLE_ADMIN'] : [],EGG_SOURCE_MENU,undefined,!admin);
      const base = deriveOrgScope({dataScope});
      const [sites,farms]: {code:string;company_code:string}[][] = admin ? [[],[]] : await Promise.all([
        manager.query(`SELECT org_code AS code,company_code FROM sys_organizations
          WHERE org_type='SITE' AND status='ACTIVE' AND org_code=ANY($1)`,[base.siteCodes??[]]),
        manager.query(`SELECT f.farm_code AS code,f.company_code FROM sys_user_farm_scopes uf
          JOIN ${OrgOwnershipService.FARM_TABLE} f USING(farm_code) WHERE uf.user_id=$1 AND f.status='ACTIVE'`,[id]),
      ]);
      houseGrants = action => admin ? [base] : denials.has(action) ? [] : organizationGrants
        .filter(row=>row.actions.includes(action))
        .flatMap<ChangeScope>(row=>row.scope_type==='OWNER'
          ? [
              {...base,companyCodes:dataScope.allowedExplicitBreedingCompanyCodes??[],farmCodes:farms.map(f=>f.code),siteCodes:[]},
              ...sites.map(site=>({...base,restrictedCompany:site.company_code,companyCodes:[],farmCodes:[],siteCodes:[site.code]})),
            ]
          : [{ ...base,restrictedCompany:row.company_code,[restrictions[row.scope_type]]:row.scope_code,
          farmCodes:farms.filter(f=>f.company_code===row.company_code).map(f=>f.code),
          siteCodes:sites.filter(site=>site.company_code===row.company_code).map(site=>site.code) }]);
    }
    const houseView = houseGrants('V');
    const houseCreate = canWrite ? houseGrants('C') : [];
    const houseEdit = canWrite ? houseGrants('E') : [];
    const houseApprove = canWrite ? houseGrants('A') : [];
    const legacy = { V:view,C:[],E:edit,A:approve };
    const house = { V:houseView,C:houseCreate,E:houseEdit,A:houseApprove };
    if (!(view.length&&legacy[required].length) && !(houseView.length&&house[required].length)) {
      throw new ForbiddenException('缺少蛋品来源档案的查看或当前操作范围');
    }
    const scope = this.union(view);
    scope.houseScope = this.union(houseView);
    scope.visibilityScope = this.union([...view,...houseView]);
    if (required!=='V') {
      scope.actionGrants = legacy[required];
      scope.houseScope.actionGrants = house[required];
    }
    const warehouseScope = contract===undefined
      ? await this.dataScopes.resolve(id,admin ? ['ROLE_ADMIN'] : [],EGG_SOURCE_MENU,undefined,!admin)
      : undefined;
    return { scope, edit, approve, houseCreate, houseEdit, houseApprove, warehouseScope, actor:user?.impersonatedBy ? null : id };
  }

  async inspectHouseAccount(manager:EntityManager,owner:EggSourceOwner,username:string) {
    const [account] = await manager.query(`SELECT u.user_id::text AS id,u.perms_version FROM sys_user u WHERE u.username=$1
      AND u.status=1 AND NOT EXISTS (SELECT 1 FROM sys_user_role ur JOIN sys_role r USING(role_id)
        WHERE ur.user_id=u.user_id AND COALESCE(ur.is_visible,true) AND r.status='ACTIVE' AND r.role_code='ROLE_ADMIN')`,[username]);
    if (!account) return {accountId:null,actions:[] as EggSourceHouseAction[]};
    const actions:EggSourceHouseAction[]=[];
    const subject={userId:account.id,perms_version:Number(account.perms_version)};
    for (const action of ['V','C','E','A'] as const) {
      try {
        const {scope}=await this.resolve(subject,action,manager,2);
        if (canAccessEggSource(sourceScopeFor(scope,2),owner)) actions.push(action);
      } catch (error) {
        if (!(error instanceof ForbiddenException || error instanceof UnauthorizedException)) throw error;
      }
    }
    return {accountId:account.id as string,actions};
  }

  async previewHouseGrants(manager:EntityManager,proposal:EggSourceGrantProposal,
    accounts:readonly {id:string;username:string;version:number}[],houses:readonly EggSourceOwner[]) {
    const results:{username:string;companyCode:string;houseCode:string;before:EggSourceHouseAction[];after:EggSourceHouseAction[]}[]=[];
    for (const account of accounts) {
      const identity={userId:account.id,perms_version:account.version};
      const lookup=async (override?:EggSourceGrantProposal)=>{
        try {return await this.resolve(identity,'V',manager,2,override);}
        catch (error) {if (error instanceof ForbiddenException || error instanceof UnauthorizedException) return null;throw error;}
      };
      const before=await lookup();
      const after=await lookup(proposal);
      const actions=(access:typeof before,owner:EggSourceOwner):EggSourceHouseAction[]=>{
        if (!access) return [];
        const view=sourceScopeFor(access.scope,2);
        if (!canAccessEggSource(view,owner)) return [];
        return ([
          ['V',view.viewGrants],['C',access.houseCreate],['E',access.houseEdit],['A',access.houseApprove],
        ] as const).filter(([,grants])=>canAccessEggSource({...view,actionGrants:grants},owner)).map(([action])=>action);
      };
      for (const house of houses) {
        const previous=actions(before,house);
        const next=actions(after,house);
        if (previous.join(',')!==next.join(',')) results.push({username:account.username,companyCode:house.companyCode,
          houseCode:house.houseCode,before:previous,after:next});
      }
    }
    return results;
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
