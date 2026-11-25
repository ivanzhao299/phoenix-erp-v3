import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import type { OrgScope } from '../../farm/farm.service';
import {
  assertEggSourceScope, commercialShellClass, EggShellClass, EggSourceOwner, lockEggSourceHouse, lockEggSourcePolicy,
  readEggSourceOwner, requireShellClass, SHELL_TYPES, sourceClock, sourceDate, sourceDigest, sourceText, sourceUuid,
} from './egg-source-change-policy';
import { sourceUseBlockers, SourceSkuRequirement, verifySourceChangePlan } from './egg-source-change-facts';
import { SkuAvailabilityService } from './sku-availability.service';

type ChangeInput = {
  actionKey?: unknown; houseCode?: unknown; effectiveDate?: unknown; targetClass?: unknown;
  reason?: unknown; warehouseCode?: unknown; requirements?: unknown; planDocument?: unknown;
};
type Payload = { reason:string; warehouseCode:string; requirements:SourceSkuRequirement[]; planDocument:string|null };
type Action = 'submit'|'approve'|'reject'|'cancel'|'request-revoke'|'revoke'|'decline-revoke';
type ChangeScope = OrgScope & { allowedWarehouses?: string[] };
type ActionInput = { actionKey?:unknown; version?:unknown; planDigest?:unknown; reason?:unknown };
type ProfileRow = { profile_code:string; product_mode:string; variety_code:string|null; effective_date:string;
  expire_date:string|null; status:string };
type ChangeRow = { id:string; created_by:string; last_editor:string; approved_by:string|null; version:number;
  state:string; effective_date:string; target_class:EggShellClass; company_code:string; farm_code:string; site_code:string;
  house_code:string; payload:Payload; previous_profile_code:string|null; new_profile_code:string|null;
  approval: { priorEndsOn:string|null; planDigest:string; snapshot?:Awaited<ReturnType<typeof verifySourceChangePlan>>; previousClass?:EggShellClass|null; retractionRequestedBy?:string } | null };

const changeFields = 'c.*,c.effective_date::text AS effective_date,c.created_at::text AS created_at,c.updated_at::text AS updated_at';
const profileFields = 'profile_code, product_mode, variety_code, effective_date::text, expire_date::text, status';

function normalize(input: ChangeInput): Payload {
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
  return {
    reason:sourceText(input.reason,'变更依据',2000), warehouseCode:sourceText(input.warehouseCode,'目标仓库',64), requirements,
    planDocument:input.planDocument ? sourceUuid(input.planDocument,'换群计划') : null,
  };
}

@Injectable()
export class EggSourceChangeService {
  constructor(private readonly db: DataSource, private readonly skus: SkuAvailabilityService) {}

  async timeline(house: string, scope: ChangeScope) {
    return this.db.transaction(async m => {
      const owner = await readEggSourceOwner(m, house);
      assertEggSourceScope(scope, owner);
      const clock = await sourceClock(m, owner);
      const profiles: ProfileRow[] = await this.profiles(m, owner, false);
      const changes: ChangeRow[] = await m.query(`SELECT ${changeFields} FROM md_egg_source_changes c
        WHERE company_code=$1 AND house_code=$2 AND farm_code=$3 AND site_code=$4
        ORDER BY c.created_at DESC LIMIT 100`, [owner.companyCode,owner.houseCode,owner.farmCode,owner.siteCode]);
      return { owner, businessDay:clock.day, zone:clock.zone,
        profiles:profiles.map(row => ({ ...row, shellClass:commercialShellClass(row.product_mode,row.variety_code) })),
        changes:changes.filter(change => scope.isGlobal || scope.allowedWarehouses?.includes(change.payload.warehouseCode)) };
    });
  }

  async planOptions(house:string,dateInput:string,scope:ChangeScope) {
    const owner=await readEggSourceOwner(this.db.manager,house);
    assertEggSourceScope(scope,owner);
    const date=sourceDate(dateInput);
    return this.db.query(`SELECT id,flock_no,kind,status,business_date::text FROM brd_flock_documents
      WHERE company_code=$1 AND business_date=$3 AND status IN ('DRAFT','SUBMITTED','APPROVED','POSTED')
        AND (kind='ADMIT' AND house_code=$2 OR kind='TRANSFER' AND payload->>'targetHouseCode'=$2)
      ORDER BY created_at DESC LIMIT 100`,[owner.companyCode,owner.houseCode,date]);
  }

  async preview(input: ChangeInput, scope: ChangeScope) {
    const house = sourceText(input.houseCode,'鸡舍',64);
    const date = sourceDate(input.effectiveDate);
    const kind = requireShellClass(input.targetClass);
    const payload = normalize(input);
    return this.db.transaction(async m => {
      const owner = await readEggSourceOwner(m,house,true);
      assertEggSourceScope(scope,owner);
      this.authorizeWarehouse(scope,payload.warehouseCode);
      return this.plan(m,owner,date,kind,payload);
    });
  }

  async create(input: ChangeInput, scope: ChangeScope, actor: string) {
    const house = sourceText(input.houseCode,'鸡舍',64);
    const date = sourceDate(input.effectiveDate);
    const kind = requireShellClass(input.targetClass);
    const key = sourceUuid(input.actionKey,'创建请求号');
    const payload = normalize(input);
    return this.db.transaction('READ COMMITTED', async m => {
      await lockEggSourceHouse(m,house);
      const owner = await readEggSourceOwner(m,house,true);
      assertEggSourceScope(scope,owner);
      this.authorizeWarehouse(scope,payload.warehouseCode);
      const [prior] = await m.query(`SELECT ${changeFields} FROM md_egg_source_changes c
        WHERE company_code=$1 AND request_key=$2 FOR UPDATE`, [owner.companyCode,key]);
      if (prior) {
        this.authorizeRow(prior,owner,scope);
        if (prior.created_by !== actor || prior.effective_date !== date || prior.target_class !== kind
          || sourceDigest(prior.payload) !== sourceDigest(payload)) throw new ConflictException('创建请求号已经绑定其他申请内容');
        return prior;
      }
      await this.ensureFuture(m,owner,date);
      const [row] = await m.query(`WITH inserted AS (
        INSERT INTO md_egg_source_changes(id,request_key,company_code,farm_code,site_code,house_code,effective_date,target_class,
          created_by,last_editor,payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10) RETURNING *
        ) SELECT ${changeFields} FROM inserted c`,
      [randomUUID(),key,owner.companyCode,owner.farmCode,owner.siteCode,owner.houseCode,date,kind,actor,JSON.stringify(payload)]);
      return row;
    });
  }

  async act(idInput: string, action: Action, input: ActionInput, scope: ChangeScope, actor: string) {
    const id = sourceUuid(idInput,'申请号');
    const key = sourceUuid(input.actionKey,'操作请求号');
    const version = input.version;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) throw new BadRequestException('申请版本无效');
    const reason = input.reason == null ? null : sourceText(input.reason,'操作依据',2000);
    const inputHash = sourceDigest({ action, version, planDigest:input.planDigest ?? null, reason });
    return this.db.transaction('READ COMMITTED', async m => {
      const [identity] = await m.query('SELECT house_code FROM md_egg_source_changes WHERE id=$1',[id]);
      if (!identity) throw new NotFoundException('来源申请不存在');
      // Check access before waiting on another site's workflow, then re-check under the lock.
      const initial = await readEggSourceOwner(m,identity.house_code);
      assertEggSourceScope(scope,initial);
      await lockEggSourceHouse(m,identity.house_code);
      const owner = await readEggSourceOwner(m,identity.house_code);
      const [row]: ChangeRow[] = await m.query(`SELECT ${changeFields} FROM md_egg_source_changes c WHERE id=$1 FOR UPDATE`,[id]);
      this.authorizeRow(row,owner,scope);
      this.authorizeWarehouse(scope,row.payload.warehouseCode);
      const [logged] = await m.query(`SELECT action,actor_id,input_sha256,receipt FROM md_egg_source_change_events
        WHERE change_id=$1 AND action_key=$2`,[id,key]);
      if (logged) {
        if (logged.action !== action || logged.actor_id !== actor || logged.input_sha256 !== inputHash) {
          throw new ConflictException('操作请求号已用于其他内容');
        }
        return logged.receipt;
      }
      if (row.version !== version) throw new ConflictException('申请已变化，请重新加载');
      const applied = await this.transition(m,owner,row,actor,action,input.planDigest,reason);
      await m.query(`INSERT INTO md_egg_source_change_events(change_id,action_key,actor_id,action,input_sha256,receipt)
        VALUES ($1,$2,$3,$4,$5,$6)`,[id,key,actor,action,inputHash,JSON.stringify(applied)]);
      return applied;
    });
  }

  private authorizeRow(row: ChangeRow, owner: EggSourceOwner, scope: ChangeScope) {
    assertEggSourceScope(scope,owner);
    if (row.company_code !== owner.companyCode || row.farm_code !== owner.farmCode || row.site_code !== owner.siteCode
        || row.house_code !== owner.houseCode) throw new ConflictException('申请的原组织归属已变化');
  }

  private authorizeWarehouse(scope: ChangeScope, warehouse: string) {
    if (!scope.isGlobal && !scope.allowedWarehouses?.includes(warehouse)) {
      throw new ForbiddenException('目标仓库超出当前授权范围');
    }
  }

  private async profiles(m: EntityManager, owner: EggSourceOwner, lock: boolean): Promise<ProfileRow[]> {
    return m.query(`SELECT ${profileFields} FROM md_egg_source_profiles WHERE company_code=$1 AND house_code=$2
      ORDER BY effective_date,profile_code ${lock ? 'FOR SHARE' : ''}`,[owner.companyCode,owner.houseCode]);
  }

  private async ensureFuture(m: EntityManager, owner: EggSourceOwner, date: string) {
    const clock = await sourceClock(m,owner);
    if (date <= clock.day) throw new ConflictException('只能在生效日前批准未来整日的来源配置，请重新排期');
    return clock;
  }

  private async plan(m: EntityManager, owner: EggSourceOwner, date: string, targetClass: EggShellClass, payload: Payload) {
    const clock = await this.ensureFuture(m,owner,date);
    const [enrolled] = await m.query(`SELECT 1 FROM md_egg_source_profiles WHERE company_code=$1
      AND effective_date <= $2 LIMIT 1`,[owner.companyCode,clock.day]);
    if (!enrolled) throw new ConflictException('公司尚未完成来源档案切入，请先办理公司级受控切入');
    const profiles = await this.profiles(m,owner,true);
    if (profiles.some(row => row.status === 'ACTIVE' && row.effective_date > clock.day)) {
      throw new ConflictException('该舍已有未来排期，须先核对现有安排');
    }
    const previous = profiles.find(row => row.status === 'ACTIVE' && row.effective_date <= date
      && (row.expire_date === null || row.expire_date >= date));
    if (previous && commercialShellClass(previous.product_mode,previous.variety_code) === targetClass) {
      throw new ConflictException('目标壳色与生效日原档相同');
    }
    const blockers = await sourceUseBlockers(m,owner,date);
    if (blockers.length) throw new ConflictException({ code:'EGG_SOURCE_REFERENCED', blockers:[...new Set(blockers.map((row:{kind:string})=>row.kind))],
      message:'目标日期已有交接、冻结或实际来源事实，请按原单处置' });
    const verified = await verifySourceChangePlan(m,this.skus,owner,date,targetClass,payload.warehouseCode,
      payload.requirements,payload.planDocument ?? undefined);
    const frozen = { owner, date, targetClass, payload, timeline:sourceDigest(profiles), previous:previous ?? null, verified };
    return { ...frozen, planDigest:sourceDigest(frozen), businessDay:clock.day, zone:clock.zone };
  }

  private async transition(m: EntityManager, owner: EggSourceOwner, row: ChangeRow, actor: string,
    action: Action, reviewed: unknown, reason: string | null) {
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
      const plan = await this.plan(m,owner,row.effective_date,row.target_class,row.payload);
      return edit('SUBMITTED',{ priorEndsOn:plan.previous?.expire_date ?? null, planDigest:plan.planDigest, snapshot:plan.verified,
        previousClass:plan.previous ? commercialShellClass(plan.previous.product_mode,plan.previous.variety_code) : null });
    }
    if (!['approve','request-revoke','revoke'].includes(action)) throw new ConflictException('当前状态或人员不能执行该动作');
    if ((action === 'approve' || action === 'revoke') && !independent) throw new ForbiddenException('须由独立人员审核');
    await readEggSourceOwner(m,owner.houseCode,true);
    await lockEggSourcePolicy(m,owner);
    if (action === 'approve' && row.state === 'SUBMITTED' && row.approval) {
      if (reviewed !== row.approval.planDigest) throw new ConflictException('须确认本申请冻结的审核摘要');
      const plan = await this.plan(m,owner,row.effective_date,row.target_class,row.payload);
      if (plan.planDigest !== reviewed) throw new ConflictException('排期或主数据已变化，请取消并重新申请');
      const clock = await this.ensureFuture(m,owner,row.effective_date);
      const previous = plan.previous;
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
        zone:clock.zone, snapshot:plan.verified, previousClass:previous ? commercialShellClass(previous.product_mode,previous.variety_code) : null };
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
