import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { notArchived } from './egg-source-cutover-ledger';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import type { OrgScope } from '../../farm/farm.service';
import {
  assertEggSourceScope, canAccessEggSource, canAccessStoredEggSource, eggSourceWarehouse, commercialShellClass, EggShellClass, EggSourceOwner, lockEggSourceHouse, lockEggSourcePolicy,
  readEggSourceOwner, requireShellClass, SHELL_TYPES, sourceClock, sourceDate, sourceDigest, sourceText, sourceUuid, sourceCalendars,
} from './egg-source-change-policy';
import { assertApprovedFlock,checkHouseInventoryReadiness,sourceUseBlockers, SourceSkuRequirement, SourcePlanBlocked, SourcePrecheckRow, verifySourceChangePlan } from './egg-source-change-facts';
import { type ChangeListQuery, type ChangeReader, changeList, changeDetail, draftReceipt, actionReceipt, candidateHouses, candidateWarehouses, candidateOptions, workspace, authorizedPlans, changeArgs, planOptions, findChange, redactChange, sourceCreatePolicy, sourceCreationPrerequisite } from './egg-source-change-read';
import { SkuAvailabilityService } from './sku-availability.service';

type ChangeInput = {
  actionKey?: unknown; houseCode?: unknown; effectiveDate?: unknown; targetClass?: unknown;
  reason?: unknown; warehouseCode?: unknown; requirements?: unknown; planDocument?: unknown;
  contractVersion?: unknown; continuationProfileCode?: unknown;
};
type Payload = { reason:string; warehouseCode?:string; requirements:SourceSkuRequirement[];
  planDocument:string|null; continuationProfileCode?:string };
export type SourceContractVersion = 1|2;

export function sourceContractVersion(value:unknown):SourceContractVersion {
  if (value===undefined || value===1 || value==='1') return 1;
  if (value===2 || value==='2') return 2;
  throw new BadRequestException('来源申请口径无效');
}
export type Action = 'submit'|'approve'|'reject'|'cancel'|'request-revoke'|'revoke'|'decline-revoke';
type LiveScope = (manager: EntityManager) => Promise<ChangeScope>;
type LiveFlock = (manager: EntityManager) => Promise<ChangeScope|undefined>;
export type ChangeScope = OrgScope & {
  allowedWarehouses?: string[];
  restrictedFarm?: string;
  restrictedHouse?: string;
  houseScope?: ChangeScope;
  visibilityScope?: ChangeScope;
  restrictedWarehouse?: string;
  restrictedCompany?: string;
  restrictedSite?: string;
  viewGrants?: readonly ChangeScope[];
  actionGrants?: readonly ChangeScope[];
};
export function sourceScopeFor(scope:ChangeScope, contract:SourceContractVersion):ChangeScope {
  return contract===2 ? scope.houseScope ?? {isGlobal:false,farmCode:null,siteCode:null,viewGrants:[]} : scope;
}
type ActionInput = { contractVersion?:unknown; actionKey?:unknown; version?:unknown; planDigest?:unknown; readinessDigest?:unknown; reason?:unknown };
type ProfileRow = { profile_code:string; product_mode:string; variety_code:string|null; effective_date:string;
  expire_date:string|null; status:string };
export type ChangeRow = { id:string; created_at:string; updated_at:string; created_by:string; last_editor:string; approved_by:string|null; version:number;
  state:string; effective_date:string; target_class:EggShellClass; company_code:string; farm_code:string; site_code:string;
  house_code:string; contract_version:SourceContractVersion; payload:Payload; previous_profile_code:string|null; new_profile_code:string|null;
  approval: { priorEndsOn:string|null; planDigest:string; snapshot?:Awaited<ReturnType<typeof verifySourceChangePlan>>; previousClass?:EggShellClass|null; retractionRequestedBy?:string; readiness?:Awaited<ReturnType<typeof checkHouseInventoryReadiness>> } | null };

export const changeFields = 'c.*,c.effective_date::text AS effective_date,c.created_at::text AS created_at,c.updated_at::text AS updated_at';
const profileFields = 'profile_code, product_mode, variety_code, effective_date::text, expire_date::text, status';

function normalize(input: ChangeInput, contract:SourceContractVersion): Payload {
  if (!Array.isArray(input.requirements) || !input.requirements.length || input.requirements.length > 96) {
    throw new BadRequestException('请选择本舍实际要使用的等级与规格');
  }
  const requirements = input.requirements.map(row => ({
    gradeCode:sourceText(row?.gradeCode,'等级',64),
    specCode:sourceText(row?.specCode,'规格',64),
  })).sort((a,b) => a.gradeCode.localeCompare(b.gradeCode) || a.specCode.localeCompare(b.specCode));
  if (new Set(requirements.map(({gradeCode,specCode}) => JSON.stringify([gradeCode,specCode]))).size !== requirements.length) {
    throw new BadRequestException('等级与规格不可重复');
  }
  const reason = sourceText(input.reason,'变更依据',2000);
  const planDocument = input.planDocument ? sourceUuid(input.planDocument,'换群计划') : null;
  if (contract===1) {
    if (input.continuationProfileCode!==undefined) throw new BadRequestException('旧口径不可办理档期接续');
    return { reason,warehouseCode:sourceText(input.warehouseCode,'目标仓库',64),requirements,planDocument };
  }
  if (Object.prototype.hasOwnProperty.call(input,'warehouseCode')) throw new BadRequestException('来源申请只绑定鸡舍，请按业务单办理仓库作业');
  if (input.continuationProfileCode===undefined) return { reason,requirements,planDocument };
  if (planDocument) throw new BadRequestException('接续保留原换群依据，无须选择新计划');
  return { reason,requirements,planDocument,continuationProfileCode:sourceText(input.continuationProfileCode,'原档期',64) };
}

@Injectable()
export class EggSourceChangeService {
  constructor(private readonly db: DataSource, private readonly skus: SkuAvailabilityService) {}

  workspace(house:string,reader:(manager:EntityManager)=>Promise<ChangeReader>) { return workspace(this.db,house,reader); }
  candidateHouses(scope: ChangeScope) { return candidateHouses(this.db.manager,scope); }
  candidateWarehouses(house: string, scope: ChangeScope) {
    return this.db.transaction('REPEATABLE READ',async m => {
      await this.checkNewApplication(m,house,1,scope);
      return candidateWarehouses(m,house,scope);
    });
  }

  candidateOptions(house:string,contract:SourceContractVersion,scope:ChangeScope) {
    return this.db.transaction('REPEATABLE READ',async m => {
      if (!house && contract===1) {
        const [legacy]=await m.query('SELECT legacy_creates_enabled FROM md_egg_source_write_control WHERE id=1');
        if (!legacy?.legacy_creates_enabled) {
          throw new ConflictException({subcode:'SOURCE_CONTRACT_CHANGED',message:'请刷新来源申请后继续'});
        }
      } else {
        await this.checkNewApplication(m,house,contract,scope);
      }
      return candidateOptions(m);
    });
  }

  changeList(query: ChangeListQuery, scope: ChangeScope) { return this.db.transaction('REPEATABLE READ',m=>changeList(m,query,scope)); }
  changeDetail(id: string, reader: ChangeReader) { return changeDetail(this.db,id,reader); }
  draftReceipt(key: string, house: string, scope: ChangeScope, actor: string) {
    return draftReceipt(this.db.manager,key,house,scope,actor);
  }
  legacyCreationResolution(keyInput:string,house:string,companyInput:string,actor:string,
    access:(manager:EntityManager,lockAccount:boolean)=>Promise<ChangeScope>) {
    const key=sourceUuid(keyInput,'创建请求号');
    const company=sourceText(companyInput,'原公司',64);
    const houseCode=sourceText(house,'鸡舍',64);
    return this.db.transaction('READ COMMITTED',async m=>{
      const preliminary=await readEggSourceOwner(m,houseCode);
      const original=await access(m,false);
      if (preliminary.companyCode!==company || !canAccessEggSource(original.visibilityScope??original,preliminary)) {
        return {status:'UNKNOWN' as const};
      }
      await lockEggSourceHouse(m,houseCode);
      const scope=await access(m,true);
      const owner=await readEggSourceOwner(m,houseCode,false,true);
      if (owner.companyCode!==company || !canAccessEggSource(scope.visibilityScope??scope,owner)) return {status:'UNKNOWN' as const};
      const [occupied]=await m.query(`SELECT contract_version FROM md_egg_source_changes
        WHERE company_code=$1 AND request_key=$2 AND house_code=$3 AND created_by=$4`,[company,key,houseCode,actor]);
      if (occupied) {
        if (occupied.contract_version!==1) return {status:'UNKNOWN' as const};
        try {
          return {status:'FOUND' as const,receipt:await draftReceipt(m,key,houseCode,scope,actor)};
        } catch (error) {
          if (!(error instanceof NotFoundException)) throw error;
          return {status:'UNKNOWN' as const};
        }
      }
      const policy=await sourceCreatePolicy(m,owner,true);
      if (policy.rollout==='UNREGISTERED' && !policy.legacyClosed) return {status:'UNKNOWN' as const};
      return {status:'V1_NOT_COMMITTED' as const};
    });
  }

  actionReceipt(id: string, key: string, scope: ChangeScope, actor: string) {
    return actionReceipt(this.db.manager,id,key,scope,actor);
  }

  async timeline(house: string, scope: ChangeScope, flock?:ChangeScope) {
    return this.db.transaction('REPEATABLE READ',async m => {
      const owner = await readEggSourceOwner(m, house);
      assertEggSourceScope(scope.visibilityScope??scope,owner);
      const clock = await sourceClock(m, owner);
      const profiles: ProfileRow[] = await this.profiles(m, owner, false);
      const changes: ChangeRow[] = await m.query(`SELECT ${changeFields} FROM md_egg_source_changes c
        WHERE company_code=$1 AND farm_code=$2 AND site_code=$3 AND house_code=$4
        AND ((c.contract_version=1 AND ($5::boolean OR c.payload->>'warehouseCode'=ANY($6::text[])))
          OR (c.contract_version=2 AND $7::boolean)) AND ${notArchived}
        ORDER BY c.created_at DESC,c.id DESC LIMIT 100`, changeArgs(owner,scope));
      const ids=changes.flatMap(change=>{
        const id = change.payload.planDocument ?? change.approval?.snapshot?.planned?.documentId;
        return id ? [id] : [];
      });
      const allowed=new Set((await authorizedPlans(m,flock,owner,ids)).map((plan:{id:string})=>plan.id));
      return { owner, businessDay:clock.day, zone:clock.zone,
        profiles:profiles.map(row => ({ ...row, shellClass:commercialShellClass(row.product_mode,row.variety_code) })),
        changes:changes.map(change=>redactChange(change,allowed.has(change.payload.planDocument ?? change.approval?.snapshot?.planned?.documentId ?? ''))) };
    });
  }

  planOptions(house:string,date:string,contract:SourceContractVersion,scope:ChangeScope,flockScope?:ChangeScope) {
    return this.db.transaction('REPEATABLE READ',async m => {
      await this.checkNewApplication(m,house,contract,scope);
      return planOptions(m,house,date,sourceScopeFor(scope,contract),flockScope);
    });
  }

  private async checkNewApplication(m:EntityManager, house:string, contract:SourceContractVersion, scope:ChangeScope,
    owner?:EggSourceOwner, lock = false) {
    const current = owner ?? await readEggSourceOwner(m,house);
    assertEggSourceScope(sourceScopeFor(scope,contract),current);
    const policy = await sourceCreatePolicy(m,current,lock);
    if (contract!==policy.version) {
      throw new ConflictException({subcode:'SOURCE_CONTRACT_CHANGED',message:'来源申请口径已变化，请刷新后继续'});
    }
    if (!owner) await readEggSourceOwner(m,house,true);
    const clock = sourceCalendars[current.siteCode] ? await sourceClock(m,current) : null;
    const blocker = policy.blocker ?? await sourceCreationPrerequisite(m,current,clock?.day??null);
    if (blocker) throw new ConflictException({subcode:blocker,message:'当前鸡舍暂不能新建来源变更，请核对工作区'});
    return current;
  }

  async safeLegacyChange<T extends ChangeRow>(row:T, flock?:ChangeScope) {
    const owner={ companyCode:row.company_code,farmCode:row.farm_code,siteCode:row.site_code,houseCode:row.house_code };
    const linked=row.payload.planDocument ?? row.approval?.snapshot?.planned?.documentId;
    const visible=linked && (await authorizedPlans(this.db.manager,flock,owner,[linked])).length>0;
    return redactChange(row,!!visible);
  }

  async preview(input: ChangeInput, scope: ChangeScope, flock?:ChangeScope) {
    const house = sourceText(input.houseCode,'鸡舍',64);
    const date = sourceDate(input.effectiveDate);
    const kind = requireShellClass(input.targetClass);
    const contract = sourceContractVersion(input.contractVersion);
    const payload = normalize(input,contract);
    return this.db.transaction(async m => {
      const owner = await this.checkNewApplication(m,house,contract,scope);
      assertEggSourceScope(sourceScopeFor(scope,contract),owner,payload.warehouseCode);
      const plan=await this.plan(m,owner,date,kind,payload,contract);
      const linkedPlan = payload.planDocument ?? plan.verified.planned?.documentId;
      if (!linkedPlan || (await authorizedPlans(m,flock,owner,[linkedPlan])).length) return plan;
      return { ...plan,payload:{ ...plan.payload,planDocument:null },verified:{ ...plan.verified,planned:null } };
    });
  }

  async precheck(input: ChangeInput, scope: ChangeScope) {
    if (!input || typeof input!=='object' || Array.isArray(input) ||
        (input.planDocument != null && typeof input.planDocument!=='string')) throw new BadRequestException('预检内容无效');
    const house = sourceText(input.houseCode,'鸡舍',64);
    const date = sourceDate(input.effectiveDate);
    const targetClass = requireShellClass(input.targetClass);
    const contract = sourceContractVersion(input.contractVersion);
    const payload = normalize(input,contract);
    return this.db.transaction('REPEATABLE READ',async m => {
      await this.checkNewApplication(m,house,contract,scope);
      return this.runPrecheck(m,house,date,targetClass,payload,scope,contract);
    });
  }

  async precheckDraft(id:string, scope: ChangeScope, actor:string) {
    return this.db.transaction(async m => {
      const initial = await findChange(m,id,scope);
      await readEggSourceOwner(m,initial.house_code,false,true);
      const row = await findChange(m,id,scope,true);
      if (row.created_by!==actor || row.state!=='DRAFT') throw new NotFoundException('来源草稿不存在');
      return this.runPrecheck(m,row.house_code,row.effective_date,row.target_class,row.payload,scope,row.contract_version,row);
    });
  }

  private async runPrecheck(m:EntityManager, house:string, date:string, targetClass:EggShellClass, payload:Payload, scope:ChangeScope,
    contract:SourceContractVersion, draft?:ChangeRow) {
    let owner: EggSourceOwner;
    try {
      owner = await readEggSourceOwner(m,house,false,true);
      if (draft) this.authorizeRow(draft,owner,scope);
      assertEggSourceScope(sourceScopeFor(scope,contract),owner,payload.warehouseCode);
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof ConflictException) throw new ForbiddenException('鸡舍或目标仓不可访问');
      throw error;
    }
    const rows: SourcePrecheckRow[] = [];
    let problems: string[] = [];
    let readiness: {status:string;code?:string}|undefined;
    try {
      try { await readEggSourceOwner(m,house,true); }
      catch (error) {
        if (error instanceof ConflictException) throw new SourcePlanBlocked('INACTIVE_HOUSE','当前鸡舍不可制单');
        throw error;
      }
      if (!sourceCalendars[owner.siteCode]) throw new SourcePlanBlocked('NO_CALENDAR','场站尚未核准产蛋业务日时区');
      const draftPlan = await this.plan(m,owner,date,targetClass,payload,contract,rows);
      if (contract===2 && !rows.some(row=>row.status==='BLOCKED')) {
        const check = await checkHouseInventoryReadiness(m,owner,date,draftPlan.verified.items);
        readiness = check.status==='BLOCKED' ? {status:check.status,code:check.code} : {status:check.status};
      }
    } catch (error) {
      if (!(error instanceof SourcePlanBlocked)) throw error;
      problems = [error.reasonCode];
      rows.push(...payload.requirements.filter(requirement=>!rows.some(row=>row.gradeCode===requirement.gradeCode
        && row.specCode===requirement.specCode)).map(requirement => ({ ...requirement,status:'NOT_CHECKED' as const,issues:[] })));
    }
    return { status:problems.length || rows.some(row => row.status==='BLOCKED') ? 'BLOCKED' : 'READY',
      houseCode:owner.houseCode,warehouseCode:payload.warehouseCode??null,targetClass,effectiveDate:date,problems,rows,readiness };
  }

  async create(input: ChangeInput, scope: ChangeScope, actor: string, refresh?: LiveScope) {
    const house = sourceText(input.houseCode,'鸡舍',64);
    const date = sourceDate(input.effectiveDate);
    const kind = requireShellClass(input.targetClass);
    const key = sourceUuid(input.actionKey,'创建请求号');
    const contract = sourceContractVersion(input.contractVersion);
    return this.db.transaction('READ COMMITTED', async m => {
      await lockEggSourceHouse(m,house);
      const owner = await readEggSourceOwner(m,house,false,true);
      const current = refresh ? await refresh(m) : scope;
      assertEggSourceScope(sourceScopeFor(current,contract),owner);
      const [prior] = await m.query(`SELECT ${changeFields} FROM md_egg_source_changes c
        WHERE company_code=$1 AND request_key=$2 FOR UPDATE`, [owner.companyCode,key]);
      if (prior) {
        this.authorizeRow(prior,owner,current);
        if (prior.contract_version!==contract || prior.created_by !== actor || prior.effective_date !== date || prior.target_class !== kind
          || sourceDigest(prior.payload) !== sourceDigest(normalize(input,prior.contract_version))) throw new ConflictException('创建请求号已经绑定其他申请内容');
        return prior;
      }
      await readEggSourceOwner(m,house,true);
      await this.checkNewApplication(m,house,contract,current,owner,true);
      const payload=normalize(input,contract);
      assertEggSourceScope(sourceScopeFor(current,contract),owner,payload.warehouseCode);
      await this.ensureFuture(m,owner,date);
      if (contract===1 && !await eggSourceWarehouse(m,owner,payload.warehouseCode!)) {
        throw new ConflictException('目标仓须为本公司、适用场站的启用操作仓');
      }
      await this.beginWrite(m,actor,contract);
      const [row] = await m.query(`WITH inserted AS (
        INSERT INTO md_egg_source_changes(id,request_key,company_code,farm_code,site_code,house_code,effective_date,target_class,
          created_by,last_editor,payload,contract_version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11) RETURNING *
        ) SELECT ${changeFields} FROM inserted c`,
      [randomUUID(),key,owner.companyCode,owner.farmCode,owner.siteCode,owner.houseCode,date,kind,actor,JSON.stringify(payload),contract]);
      return row;
    });
  }

  async act(idInput: string, action: Action, input: ActionInput, scope: ChangeScope, actor: string, flock?: LiveFlock, refresh?: LiveScope) {
    const id = sourceUuid(idInput,'申请号');
    const key = sourceUuid(input.actionKey,'操作请求号');
    const version = input.version;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) throw new BadRequestException('申请版本无效');
    const reason = input.reason == null ? null : sourceText(input.reason,'操作依据',2000);
    return this.db.transaction('READ COMMITTED', async m => {
      const [identity] = await m.query('SELECT house_code,contract_version FROM md_egg_source_changes WHERE id=$1',[id]);
      if (!identity) throw new NotFoundException('来源申请不存在');
      // Check access before waiting on another site's workflow, then re-check under the lock.
      const initial = await readEggSourceOwner(m,identity.house_code);
      assertEggSourceScope(sourceScopeFor(scope,identity.contract_version),initial);
      await lockEggSourceHouse(m,identity.house_code);
      const owner = await readEggSourceOwner(m,identity.house_code,false,true);
      const [row]: ChangeRow[] = await m.query(`SELECT ${changeFields} FROM md_egg_source_changes c WHERE id=$1 FOR UPDATE`,[id]);
      const current = refresh ? await refresh(m) : scope;
      this.authorizeRow(row,owner,current);
      if (sourceContractVersion(input.contractVersion)!==row.contract_version) {
        throw new ConflictException('申请口径已变化，请刷新页面核对单据');
      }
      assertEggSourceScope(sourceScopeFor(current,row.contract_version),owner,row.payload.warehouseCode);
      const inputHash = sourceDigest({ action, version, planDigest:input.planDigest ?? null, reason,
        ...(row.contract_version===2 ? {readinessDigest:input.readinessDigest??null} : {}) });
      const [logged] = await m.query(`SELECT action,actor_id,input_sha256,receipt FROM md_egg_source_change_events
        WHERE change_id=$1 AND action_key=$2`,[id,key]);
      if (logged) {
        if (logged.action !== action || logged.actor_id !== actor || logged.input_sha256 !== inputHash) {
          throw new ConflictException('操作请求号已用于其他内容');
        }
        return logged.receipt;
      }
      if (row.version !== version) throw new ConflictException('申请已变化，请重新加载');
      const approvalPlan = row.payload.planDocument ?? row.approval?.snapshot?.planned?.documentId;
      if (action === 'approve' && approvalPlan &&
          !(await authorizedPlans(m,await flock?.(m),owner,[approvalPlan],true)).length) {
        throw new ForbiddenException('批准前须能查看关联鸡群原计划及原鸡舍');
      }
      await this.beginWrite(m,actor,row.contract_version);
      const applied = await this.transition(m,owner,row,actor,action,input.planDigest,reason,input.readinessDigest);
      await m.query(`INSERT INTO md_egg_source_change_events(change_id,action_key,actor_id,action,input_sha256,receipt)
        VALUES ($1,$2,$3,$4,$5,$6)`,[id,key,actor,action,inputHash,JSON.stringify(applied)]);
      return applied;
    });
  }

  private authorizeRow(row: ChangeRow, owner: EggSourceOwner, scope: ChangeScope) {
    if (!canAccessStoredEggSource(sourceScopeFor(scope,row.contract_version),owner,row.contract_version,row.payload.warehouseCode)) {
      throw new ForbiddenException('鸡舍或原目标仓超出当前授权范围');
    }
    if (row.company_code !== owner.companyCode || row.farm_code !== owner.farmCode || row.site_code !== owner.siteCode
        || row.house_code !== owner.houseCode) throw new ConflictException('申请的原组织归属已变化');
  }

  private async beginWrite(m: EntityManager, actor: string, contract:SourceContractVersion) {
    const [gate] = await m.query('SELECT writes_enabled,house_writes_enabled FROM md_egg_source_write_control WHERE id=1 FOR SHARE');
    if (!gate?.writes_enabled || contract===2 && !gate.house_writes_enabled) {
      throw new ConflictException('蛋品来源变更暂时暂停，请先核对原申请或回执');
    }
    await m.query("SELECT set_config('phoenix.egg_source_writer', $1, true),set_config('phoenix.egg_source_contract',$2,true),set_config('phoenix.egg_source_iam_protocol','1',true)",
      [actor,String(contract)]);
  }

  private async profiles(m: EntityManager, owner: EggSourceOwner, lock: boolean): Promise<ProfileRow[]> {
    return m.query(`SELECT ${profileFields} FROM md_egg_source_profiles WHERE company_code=$1 AND house_code=$2
      ORDER BY effective_date,profile_code ${lock ? 'FOR SHARE' : ''}`,[owner.companyCode,owner.houseCode]);
  }

  private async ensureFuture(m: EntityManager, owner: EggSourceOwner, date: string) {
    const clock = await sourceClock(m,owner);
    if (date <= clock.day) throw new SourcePlanBlocked('DATE_NOT_FUTURE','只能在生效日前批准未来整日的来源配置，请重新排期');
    return clock;
  }

  private async plan(m: EntityManager, owner: EggSourceOwner, date: string, targetClass: EggShellClass, payload: Payload, contract:SourceContractVersion, diagnostics?: SourcePrecheckRow[]) {
    const clock = await this.ensureFuture(m,owner,date);
    const [enrolled] = await m.query(`SELECT 1 FROM md_egg_source_profiles WHERE company_code=$1
      AND effective_date <= $2 LIMIT 1`,[owner.companyCode,clock.day]);
    if (!enrolled) throw new SourcePlanBlocked('NOT_ENROLLED','公司尚未完成来源档案切入，请先办理公司级受控切入');
    const profiles = await this.profiles(m,owner,true);
    if (profiles.some(row => row.status === 'ACTIVE' && row.effective_date > clock.day)) {
      throw new SourcePlanBlocked('FUTURE_SCHEDULE_EXISTS','该舍已有未来排期，须先核对现有安排');
    }
    const previous = profiles.find(row => row.status === 'ACTIVE' && row.effective_date <= date
      && (row.expire_date === null || row.expire_date >= date));
    const sameColor = previous && commercialShellClass(previous.product_mode,previous.variety_code) === targetClass;
    const continuation = payload.continuationProfileCode;
    if (continuation && (!sameColor || previous?.profile_code!==continuation || previous.effective_date>clock.day)) {
      throw new SourcePlanBlocked('INVALID_CONTINUATION','只能接续同舍同壳色、当前有效的旧审批档期');
    }
    if (sameColor && !continuation) {
      throw new SourcePlanBlocked('SAME_COLOR','目标壳色与生效日原档相同');
    }
    const blockers = await sourceUseBlockers(m,owner,date);
    if (blockers.length) throw new SourcePlanBlocked('SOURCE_REFERENCED',{ code:'EGG_SOURCE_REFERENCED', blockers:[...new Set(blockers.map((row:{kind:string})=>row.kind))],
      message:'目标日期已有交接、冻结或实际来源事实，请按原单处置' });
    const verified = await verifySourceChangePlan(m,this.skus,owner,date,targetClass,payload.warehouseCode??null,
      payload.requirements,payload.planDocument ?? undefined,diagnostics);
    if (continuation && !diagnostics?.some(row=>row.status==='BLOCKED')) {
      const [original] = await m.query(`SELECT id,effective_date::text,approval FROM md_egg_source_changes
        WHERE new_profile_code=$1 AND contract_version=1 AND state='APPROVED'
          AND company_code=$2 AND house_code=$3 AND NULLIF(payload->>'warehouseCode','') IS NOT NULL FOR SHARE`,
      [continuation,owner.companyCode,owner.houseCode]);
      const old = original?.approval?.snapshot;
      const identity = (items:ReadonlyArray<{gradeCode:string;specCode:string;productCode:string;skuCode:string}>) =>
        items.map(({gradeCode,specCode,productCode,skuCode})=>JSON.stringify([gradeCode,specCode,productCode,skuCode])).sort();
      if (!old?.items?.length || sourceDigest(identity(old.items))!==sourceDigest(identity(verified.items))) {
        throw new SourcePlanBlocked('CONTINUATION_SKU_CHANGED','接续须完整保留旧档批准的产品、等级、规格和SKU');
      }
      if (old.planned) {
        try { await assertApprovedFlock(m,owner,old.planned,original.effective_date,true); }
        catch (error) {
          if (error instanceof ConflictException) throw new SourcePlanBlocked('CONTINUATION_PLAN_CHANGED',error.message);
          throw error;
        }
        verified.planned = {...old.planned,originalEffectiveDate:original.effective_date};
      }
    }
    const frozen = { owner, date, targetClass, payload, timeline:sourceDigest(profiles), previous:previous ?? null, verified };
    return { ...frozen, planDigest:sourceDigest(frozen), businessDay:clock.day, zone:clock.zone };
  }

  private async transition(m: EntityManager, owner: EggSourceOwner, row: ChangeRow, actor: string,
    action: Action, reviewed: unknown, reason: string | null, readinessDigest:unknown) {
    const edit = async (state: string, approval = row.approval, previous = row.previous_profile_code,
      next = row.new_profile_code, approvedBy = row.approved_by) => {
      const [changed] = await m.query(`WITH updated AS (UPDATE md_egg_source_changes SET state=$2,version=version+1,
        approval=$3,previous_profile_code=$4,new_profile_code=$5,approved_by=$6,last_editor=$7,updated_at=clock_timestamp()
        WHERE id=$1 RETURNING *) SELECT ${changeFields} FROM updated c`,
      [row.id,state,approval ? JSON.stringify(approval) : null,previous,next,approvedBy,actor]);
      return { change:changed, action, reason };
    };
    const independent = row.created_by !== actor && row.last_editor !== actor;
    if (action === 'cancel' && ['DRAFT','SUBMITTED'].includes(row.state) && row.created_by === actor) return edit('CANCELLED');
    if (action === 'reject' && row.state === 'SUBMITTED' && independent && reason) return edit('REJECTED');
    if (action === 'decline-revoke' && row.state === 'REVOKE_REQUESTED' && independent && reason) {
      return edit('APPROVED',row.approval);
    }
    if (action === 'submit' && row.state === 'DRAFT' && row.created_by === actor) {
      await lockEggSourcePolicy(m,owner);
      const plan = await this.plan(m,owner,row.effective_date,row.target_class,row.payload,row.contract_version);
      return edit('SUBMITTED',{ priorEndsOn:plan.previous?.expire_date ?? null, planDigest:plan.planDigest, snapshot:plan.verified,
        previousClass:plan.previous ? commercialShellClass(plan.previous.product_mode,plan.previous.variety_code) : null });
    }
    if (!['approve','request-revoke','revoke'].includes(action)) throw new ConflictException('当前状态或人员不能执行该动作');
    if ((action === 'approve' || action === 'revoke') && !independent) throw new ForbiddenException('须由独立人员审核');
    await readEggSourceOwner(m,owner.houseCode,true);
    await lockEggSourcePolicy(m,owner);
    if (action === 'approve' && row.state === 'SUBMITTED' && row.approval) {
      if (reviewed !== row.approval.planDigest) throw new ConflictException('须确认本申请冻结的审核摘要');
      const plan = await this.plan(m,owner,row.effective_date,row.target_class,row.payload,row.contract_version);
      if (plan.planDigest !== reviewed) throw new ConflictException('排期或主数据已变化，请取消并重新申请');
      const readiness = row.contract_version===2 ? await checkHouseInventoryReadiness(m,owner,row.effective_date,plan.verified.items) : undefined;
      if (readiness?.status==='BLOCKED') {
        throw new SourcePlanBlocked(readiness.code,{code:readiness.code,message:'交库准备未就绪，请核对正式库存范围与开账凭证'});
      }
      if (readiness && readinessDigest!==sourceDigest(readiness)) {
        throw new ConflictException('交库准备结果已变化，请重新加载审核详情');
      }
      const previous = plan.previous;
      if (previous) {
        await m.query('SELECT profile_code FROM md_egg_source_profiles WHERE profile_code=$1 FOR UPDATE',[previous.profile_code]);
      }
      const clock = await this.ensureFuture(m,owner,row.effective_date);
      if (previous) await m.query(`UPDATE md_egg_source_profiles SET expire_date=$2::date-1,
        updated_at=clock_timestamp(),updated_by=$3 WHERE profile_code=$1`,[previous.profile_code,row.effective_date,actor]);
      const next = 'ESP-CHANGE-' + row.id;
      const target = SHELL_TYPES[row.target_class];
      await m.query(`INSERT INTO md_egg_source_profiles(profile_code,company_code,farm_code,site_code,house_code,
        product_mode,variety_code,effective_date,expire_date,created_by,updated_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'EGG_SOURCE_APPROVAL','EGG_SOURCE_APPROVAL')`,
      [next,owner.companyCode,owner.farmCode,owner.siteCode,owner.houseCode,target.productMode,target.varietyCode,
        row.effective_date,previous?.expire_date ?? null]);
      const approval = { planDigest:plan.planDigest, priorEndsOn:previous?.expire_date ?? null, approvedAt:clock.instant,
        zone:clock.zone, snapshot:plan.verified, ...(readiness ? {readiness} : {}), previousClass:previous ? commercialShellClass(previous.product_mode,previous.variety_code) : null };
      return edit('APPROVED',approval,previous?.profile_code ?? null,next,actor);
    }
    if (action === 'request-revoke' && row.state === 'APPROVED' && reason && row.approval) {
      await this.ensureFuture(m,owner,row.effective_date);
      return edit('REVOKE_REQUESTED',{ ...row.approval, retractionRequestedBy:actor });
    }
    if (action === 'revoke' && row.state === 'REVOKE_REQUESTED' && row.approval && row.new_profile_code && reason) {
      const blockers = await sourceUseBlockers(m,owner,row.effective_date);
      const profiles = await this.profiles(m,owner,true);
      if (blockers.length || profiles.some(p => p.status === 'ACTIVE' && p.effective_date > row.effective_date)) {
        throw new ConflictException('该排期已有引用或后继配置，须先核对原单');
      }
      const scheduled = profiles.find(p => p.profile_code === row.new_profile_code);
      if (scheduled?.status !== 'ACTIVE') throw new ConflictException('新档案已变化');
      await this.ensureFuture(m,owner,row.effective_date);
      await m.query("UPDATE md_egg_source_profiles SET status='INACTIVE',updated_at=clock_timestamp(),updated_by=$2 WHERE profile_code=$1",
        [row.new_profile_code,actor]);
      if (row.previous_profile_code) {
        const restored = await m.query(`WITH updated AS (UPDATE md_egg_source_profiles SET expire_date=$2,
          updated_at=clock_timestamp(),updated_by=$3 WHERE profile_code=$1 AND status='ACTIVE' AND expire_date=$4::date-1
          RETURNING profile_code) SELECT * FROM updated`,[row.previous_profile_code,row.approval.priorEndsOn,actor,row.effective_date]);
        if (restored.length !== 1) throw new ConflictException('旧档截止日已变化，撤销未生效');
      }
      return edit('REVOKED');
    }
    throw new ConflictException('该动作不适用于当前申请状态');
  }
}
