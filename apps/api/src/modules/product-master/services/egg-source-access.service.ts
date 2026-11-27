import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { EGG_SOURCE_MENU, EggSourcePermission } from '../../../auth/egg-source-permissions';
import { loadPermissionSources } from '../../../auth/permission-sources';
import { eggSourceHouseDenials,loadEggSourceOrganizationGrants,type EggSourceHouseAction,type EggSourceGrantProposal,type EggSourceGrantOrigin } from '../../../auth/egg-source-organization-grants';
import { PermSource, resolvePermissions, parseCodes } from '../../../auth/permissions-resolver';
import { hasPerm } from '../../../auth/permissions.util';
import { deriveOrgScope } from '../../farm/farm.service';
import { OrgOwnershipService } from '../../org/services/org-ownership.service';
import { DataScopeService } from '../../org/services/data-scope.service';
import { sourceScopeFor,type ChangeScope } from './egg-source-change.service';
import { canAccessEggSource,type EggSourceOwner } from './egg-source-change-policy';

type SiteBinding = { code:string; company_code:string|null; farm_code:string|null; problem:string|null };

async function sourceSiteBindings(manager:EntityManager,codes:string[]):Promise<SiteBinding[]> {
  if (!codes.length) return [];
  return manager.query(`WITH RECURSIVE chain AS (
    SELECT s.org_code AS code,s.id,s.parent_id,s.status,s.org_type,s.org_code,
      CASE WHEN btrim(s.company_code)<>'' THEN s.company_code END AS company_code,ARRAY[s.id] AS visited,0 AS depth
    FROM sys_organizations s WHERE s.org_type='SITE' AND s.org_code=ANY($1)
    UNION ALL
    SELECT c.code,p.id,p.parent_id,p.status,p.org_type,p.org_code,CASE WHEN btrim(p.company_code)<>'' THEN p.company_code END,
      c.visited||p.id,c.depth+1 FROM chain c JOIN sys_organizations p ON p.id=c.parent_id
    WHERE NOT p.id=ANY(c.visited)
  ), sites AS (
    SELECT code, bool_and(status IS NOT DISTINCT FROM 'ACTIVE') AND bool_or(parent_id IS NULL) AS active,
      max(company_code) FILTER (WHERE depth=0) AS explicit_company,
      (array_agg(company_code ORDER BY depth) FILTER (WHERE org_type='COMPANY'))[1] AS company_code,
      count(*) FILTER (WHERE depth=0) AS site_count
    FROM chain GROUP BY code
  ), farms AS (
    SELECT ${OrgOwnershipService.FARM_SITE_SQL} AS code,count(*) AS farm_count,
      min(f.farm_code) AS farm_code,min(f.company_code) AS company_code
    FROM ${OrgOwnershipService.FARM_TABLE} f
    WHERE f.status='ACTIVE' AND f.mapped_site_code=ANY($1) GROUP BY 1
  ) SELECT s.code,s.company_code,f.farm_code,
    CASE WHEN NOT s.active OR s.site_count<>1 OR s.company_code IS NULL THEN 'SITE_OWNERSHIP_UNRESOLVED'
      WHEN f.farm_count IS NULL THEN 'SITE_FARM_MAPPING_MISSING'
      WHEN f.farm_count<>1 THEN 'SITE_FARM_MAPPING_UNRESOLVED'
      WHEN f.company_code IS DISTINCT FROM s.company_code OR
        (s.explicit_company IS NOT NULL AND s.explicit_company<>s.company_code) THEN 'SITE_COMPANY_CONFLICT'
      ELSE NULL END AS problem FROM sites s LEFT JOIN farms f USING(code)`,[codes]);
}

export type EggSourceAccount = { userId?: string | number; perms_version?: number; impersonatedBy?: unknown };

@Injectable()
export class EggSourceAccessService {
  constructor(private readonly db: DataSource, private readonly dataScopes: DataScopeService) {}

  transaction<T>(work:(manager:EntityManager)=>Promise<T>,readOnly=false) {
    return readOnly ? this.db.transaction('REPEATABLE READ',work) : this.db.transaction(work);
  }

  async resolve(user: EggSourceAccount | undefined, required: EggSourceHouseAction = 'V',
    manager = this.db.manager, contract?:1|2, proposal?:EggSourceGrantProposal,lockAccount=true,inspect=false) {
    const id = String(user?.userId ?? '');
    if (!/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id))) {
      throw new ForbiddenException('蛋品来源档案需要有效的实名账号');
    }
    const [account] = await manager.query(`SELECT perms_version FROM sys_user WHERE user_id=$1 AND status=1
      ${lockAccount&&manager.queryRunner?.isTransactionActive ? 'FOR SHARE' : ''}`, [id]);
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
    const sessionRestriction=user?.impersonatedBy ? 'IMPERSONATION' as const : !current ? 'PERMS_CHANGED' as const : null;
    const canWrite = sessionRestriction===null;
    const legacyGrants = (action: EggSourcePermission) =>
      contract===2 ? [] : this.scopesFor(manager,id,EGG_SOURCE_MENU,action,sources,admin,true);
    const [view, edit, approve] = await Promise.all([
      legacyGrants('V'), canWrite ? legacyGrants('E') : [], canWrite ? legacyGrants('A') : [],
    ]);
    const restrictions = { COMPANY:'restrictedCompany',FARM:'restrictedFarm',SITE:'restrictedSite',HOUSE:'restrictedHouse' } as const;
    const denials = eggSourceHouseDenials(sources);
    let siteBindings:SiteBinding[]=[];
    let houseGrants: (action:EggSourceHouseAction)=>(ChangeScope & {origin?:EggSourceGrantOrigin})[] = ()=>[];
    if (contract!==1 && (admin || organizationGrants.length)) {
      const resolver = manager.queryRunner?.isTransactionActive ? this.dataScopes.withManager(manager) : this.dataScopes;
      const dataScope = await resolver.resolve(id,admin ? ['ROLE_ADMIN'] : [],EGG_SOURCE_MENU,undefined,!admin);
      const base = deriveOrgScope({dataScope});
      const [sites,farms]:[SiteBinding[],{code:string;company_code:string}[]] = admin ? [[],[]] : await Promise.all([
        sourceSiteBindings(manager,base.siteCodes??[]),
        manager.query(`SELECT f.farm_code AS code,f.company_code FROM sys_user_farm_scopes uf
          JOIN ${OrgOwnershipService.FARM_TABLE} f USING(farm_code) WHERE uf.user_id=$1 AND f.status='ACTIVE'`,[id]),
      ]);
      siteBindings=sites;
      houseGrants = action => admin ? [base] : denials.has(action) ? [] : organizationGrants
        .filter(row=>row.actions.includes(action))
        .flatMap<ChangeScope & {origin:EggSourceGrantOrigin}>(row=>{
          const restricted=row.scope_type==='OWNER' ? undefined : row;
          if (restricted?.scope_type==='COMPANY'&&restricted.scope_code!==restricted.company_code) return [];
          const bound={...base,origin:row.origin,restrictedCompany:restricted?.company_code,
            ...(restricted ? {[restrictions[restricted.scope_type]]:restricted.scope_code} : {})};
          const direct={...bound,companyCodes:row.scope_type==='OWNER' ? dataScope.allowedExplicitBreedingCompanyCodes??[] : base.companyCodes,
            farmCodes:farms.filter(f=>!restricted||f.company_code===restricted.company_code).map(f=>f.code),siteCodes:[]};
          const projected=sites.flatMap(site=>{
            if (site.problem || !site.company_code || !site.farm_code || (restricted && (
              site.company_code!==restricted.company_code ||
              restricted.scope_type==='FARM'&&site.farm_code!==restricted.scope_code ||
              restricted.scope_type==='SITE'&&site.code!==restricted.scope_code
            ))) return [];
            return [{...bound,companyCodes:[],farmCodes:[site.farm_code],siteCodes:[],
              restrictedCompany:site.company_code,restrictedSite:site.code,restrictedFarm:site.farm_code}];
          });
          return [direct,...projected];
        });
    }
    const houseView = houseGrants('V');
    const houseCreate = canWrite ? houseGrants('C') : [];
    const houseEdit = canWrite ? houseGrants('E') : [];
    const houseApprove = canWrite ? houseGrants('A') : [];
    const legacy = { V:view,C:[],E:edit,A:approve };
    const house = { V:houseView,C:houseCreate,E:houseEdit,A:houseApprove };
    if (!inspect && !(view.length&&legacy[required].length) && !(houseView.length&&house[required].length)) {
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
      ? await (manager.queryRunner?.isTransactionActive ? this.dataScopes.withManager(manager) : this.dataScopes).resolve(id,admin ? ['ROLE_ADMIN'] : [],EGG_SOURCE_MENU,undefined,!admin)
      : undefined;
    return { scope, edit, approve, houseCreate, houseEdit, houseApprove, warehouseScope, sessionRestriction,siteBindings,denials:[...denials], actor:user?.impersonatedBy ? null : id };
  }

  async inspectHouseAccount(manager:EntityManager,owner:EggSourceOwner,username:string,includeLegacy=false,lockAccount=!includeLegacy) {
    const [account] = await manager.query(`SELECT u.user_id::text AS id,u.perms_version FROM sys_user u WHERE u.username=$1
      AND u.status=1 AND NOT EXISTS (SELECT 1 FROM sys_user_role ur JOIN sys_role r USING(role_id)
        WHERE ur.user_id=u.user_id AND COALESCE(ur.is_visible,true) AND r.status='ACTIVE' AND r.role_code='ROLE_ADMIN')`,[username]);
    const actions:EggSourceHouseAction[]=[];
    const origins:{action:EggSourceHouseAction;source:EggSourceGrantOrigin}[]=[];
    if (!account) return {accountId:null,actions,origins,diagnostics:['ACCOUNT_INELIGIBLE']};
    const subject={userId:account.id,perms_version:Number(account.perms_version)};
    let access:Awaited<ReturnType<EggSourceAccessService['resolve']>>|undefined;
    try {
      access=await this.resolve(subject,'V',manager,includeLegacy?undefined:2,undefined,lockAccount,true);
    } catch (error) {
      if (error instanceof BadRequestException && /^SITE .+ 映射了多个 ACTIVE 农场/.test(error.message)) return {accountId:account.id as string,actions,origins,diagnostics:['SITE_FARM_MAPPING_UNRESOLVED']};
      if (!(error instanceof ForbiddenException || error instanceof UnauthorizedException)) throw error;
    }
    if (!access) return {accountId:account.id as string,actions,origins,diagnostics:['ACCOUNT_INELIGIBLE']};
    const scope=sourceScopeFor(access.scope,2);
    const applied=[['V',scope.viewGrants],['C',access.houseCreate],['E',access.houseEdit],['A',access.houseApprove]] as const;
    for (const [action,grants] of applied) {
      let permitted=false;
      for (const grant of grants??[]) {
        if (!canAccessEggSource({...scope,actionGrants:[grant]},owner)) continue;
        permitted=true;
        const source=(grant as ChangeScope & {origin?:EggSourceGrantOrigin}).origin;
        if (source && !origins.some(item=>item.action===action && item.source.subject===source.subject &&
          item.source.code===source.code && item.source.scopeType===source.scopeType && item.source.scopeCode===source.scopeCode)) {
          origins.push({action,source});
        }
      }
      if (permitted) actions.push(action);
    }
    const diagnostics=access.siteBindings.flatMap(site=>site.code===owner.siteCode&&site.problem?[site.problem]:[]);
    if (access.denials.length) diagnostics.push('EXPLICIT_DENIAL');
    return {accountId:account.id as string,permissionsVersion:Number(account.perms_version),actions,origins,access,
      diagnostics,denials:access.denials};
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
