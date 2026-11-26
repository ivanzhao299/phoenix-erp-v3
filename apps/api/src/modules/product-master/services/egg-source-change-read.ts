import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { OrgOwnershipService } from '../../org/services/org-ownership.service';
import { sourceScopeFor,type Action,type ChangeRow,type ChangeScope, type SourceContractVersion } from './egg-source-change.service';
import { checkHouseInventoryReadiness } from './egg-source-change-facts';
import {
  assertEggSourceScope, canAccessEggSource, commercialShellClass, EggSourceOwner, readEggSourceOwner,
  sourceCalendars, sourceClock, sourceDate, sourceDigest, sourceText, sourceUuid,
} from './egg-source-change-policy';

export type ChangeReader = { scope:ChangeScope; actor:string|null; edit:boolean; approve:boolean;
  editGrants?:readonly ChangeScope[]; approveGrants?:readonly ChangeScope[];
  houseCreateGrants?:readonly ChangeScope[]; houseEditGrants?:readonly ChangeScope[];
  houseApproveGrants?:readonly ChangeScope[]; flock?:ChangeScope;
  warehouseCodes?:readonly string[]; warehouseGlobal?:boolean };
export type ChangeListQuery = { houseCode:string; state?:string; dateFrom?:string; dateTo?:string; changeId?:string; cursor?:string };

const states = ['DRAFT','SUBMITTED','APPROVED','REJECTED','CANCELLED','REVOKE_REQUESTED','REVOKED'];
const fields = `c.*,c.effective_date::text AS effective_date,
  to_char(c.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at`;
const ownerFields = `h.house_code AS "houseCode",h.house_name AS "houseName",h.house_type AS "houseType",
  h.farm_code AS "farmCode",f.farm_name AS "farmName",f.company_code AS "companyCode",
  ${OrgOwnershipService.FARM_SITE_SQL} AS "siteCode",h.status AS "houseStatus",f.status AS "farmStatus"`;
const changeOwnerJoin = `brd_houses h ON h.house_code=c.house_code JOIN ${OrgOwnershipService.FARM_TABLE} f ON f.farm_code=h.farm_code`;
const ownerJoin = `brd_houses h JOIN ${OrgOwnershipService.FARM_TABLE} f ON f.farm_code=h.farm_code`;
const ownerLabels = `(SELECT org_name FROM sys_organizations WHERE org_type='COMPANY'
    AND COALESCE(company_code,org_code)=f.company_code ORDER BY (org_code=f.company_code) DESC,org_code LIMIT 1) AS "companyName",
  (SELECT org_name FROM sys_organizations WHERE org_type='SITE' AND org_code=${OrgOwnershipService.FARM_SITE_SQL}
    AND company_code=f.company_code LIMIT 1) AS "siteName"`;
const houseFilter = `($1::boolean OR f.company_code=ANY($2::text[]) OR h.farm_code=ANY($3::text[])
  OR ${OrgOwnershipService.FARM_SITE_SQL}=ANY($4::text[]))`;
const changeFilter = `c.company_code=$1 AND c.farm_code=$2 AND c.site_code=$3 AND c.house_code=$4
  AND ((c.contract_version=1 AND ($5::boolean OR c.payload->>'warehouseCode'=ANY($6::text[])))
    OR (c.contract_version=2 AND $7::boolean))`;

function ownerArgs(scope: ChangeScope) {
  return [scope.isGlobal,scope.companyCodes??[],scope.farmCodes??[],scope.siteCodes??[]];
}

export function changeArgs(owner: EggSourceOwner, scope: ChangeScope) {
  const grants = scope.viewGrants ?? [scope];
  return [owner.companyCode,owner.farmCode,owner.siteCode,owner.houseCode,
    grants.some(grant => grant.isGlobal && !grant.restrictedWarehouse && canAccessEggSource(grant,owner)),
    [...new Set(grants.flatMap(grant => grant.restrictedWarehouse ? [grant.restrictedWarehouse] : grant.allowedWarehouses ?? []))].filter(code => canAccessEggSource(scope,owner,code)),
    canAccessEggSource(sourceScopeFor(scope,2),owner)];
}

function summary(row: ChangeRow & { warehouse_name?:string|null; applicant_name?:string|null }) {
  return { id:row.id, version:row.version, state:row.state, effectiveDate:row.effective_date,
    targetClass:row.target_class, createdBy:row.created_by, createdByName:row.applicant_name??null,createdAt:row.created_at,
    contractVersion:row.contract_version,warehouseCode:row.payload.warehouseCode??null, warehouseName:row.warehouse_name??null };
}

export async function candidateHouses(m: EntityManager, sourceScope: ChangeScope) {
  const scope = sourceScope.visibilityScope??sourceScope;
  const rows: EggSourceOwner[] = await m.query(`SELECT ${ownerFields} FROM ${ownerJoin} WHERE f.company_code IS NOT NULL
    AND ${OrgOwnershipService.FARM_SITE_SQL} IS NOT NULL AND ${houseFilter}
    ORDER BY f.farm_name,h.house_name,h.house_code`,ownerArgs(scope));
  return rows.filter(owner => canAccessEggSource(scope,owner));
}

export async function candidateWarehouses(m: EntityManager, house: string, scope: ChangeScope) {
  const owner = await readEggSourceOwner(m,house);
  assertEggSourceScope(scope,owner);
  const rows: {code:string}[] = await m.query(`SELECT warehouse_code AS code, COALESCE(warehouse_name_zh,warehouse_name) AS name,
    warehouse_name_en AS "nameEn", warehouse_name_lo AS "nameLo"
    FROM wms_warehouses WHERE company_code=$1 AND status='ACTIVE' AND domain='OPERATIONAL'
    AND ($2::boolean OR warehouse_code=ANY($3::text[]))
    AND (site_code=$4 OR NULLIF(site_code,'') IS NULL) ORDER BY name,warehouse_code`,
  [owner.companyCode,scope.isGlobal,scope.allowedWarehouses??[],owner.siteCode]);
  return rows.filter(row => canAccessEggSource(scope,owner,row.code));
}

export async function candidateOptions(m: EntityManager) {
  const [grades,specs] = await Promise.all([
    m.query(`SELECT grade_code AS code,grade_name AS name,grade_name_lo AS "nameLo" FROM product_grades
      WHERE status='ACTIVE' AND COALESCE(stock_managed,is_storable) IS TRUE ORDER BY sort_order,grade_code`),
    m.query(`SELECT spec_code AS code,spec_name AS name,spec_name_lo AS "nameLo" FROM packaging_specs
      WHERE status='ACTIVE' ORDER BY sort_order,spec_code`),
  ]);
  return { grades,specs };
}

type ProfileRecord = { profile_code:string;product_mode:string;variety_code:string|null;farm_code:string;site_code:string;
  effective_date:string;expire_date:string|null;status:string };
type EventRecord = { action:Action;actor_id:string;actor_name:string|null;created_at:string;receipt?:{ change?:ChangeRow;reason?:string|null } };

async function readProfiles(m: EntityManager, owner: EggSourceOwner, day: string|null) {
  const rows: ProfileRecord[] = await m.query(`SELECT profile_code,product_mode,variety_code,farm_code,site_code,
    effective_date::text,expire_date::text,status FROM md_egg_source_profiles
    WHERE company_code=$1 AND house_code=$2 ORDER BY effective_date,profile_code`,[owner.companyCode,owner.houseCode]);
  const isConsistent = (row:typeof rows[number]) => row.farm_code===owner.farmCode && row.site_code===owner.siteCode
    && !!commercialShellClass(row.product_mode,row.variety_code);
  const active = rows.filter(row => row.status==='ACTIVE' && isConsistent(row));
  const disputed = new Set<string>();
  active.forEach((row,index) => active.slice(index+1).forEach(other => {
    if (!row.expire_date || row.expire_date>=other.effective_date) {
      disputed.add(row.profile_code);
      disputed.add(other.profile_code);
    }
  }));
  return rows.map(row => {
    const shellClass = commercialShellClass(row.product_mode,row.variety_code);
    const status = !isConsistent(row) || disputed.has(row.profile_code) ? 'UNVERIFIED'
      : row.status!=='ACTIVE' ? 'INACTIVE'
      : !day ? 'UNVERIFIED'
      : row.effective_date>day ? 'FUTURE' : row.expire_date && row.expire_date<day ? 'EXPIRED' : 'CURRENT';
    return { profileCode:row.profile_code, shellClass, effectiveDate:row.effective_date, expireDate:row.expire_date,status };
  });
}

export async function sourceCreatePolicy(m: EntityManager, owner: EggSourceOwner, lock = false) {
  const [gate] = await m.query(`SELECT writes_enabled,house_writes_enabled,legacy_creates_enabled
    FROM md_egg_source_write_control WHERE id=1 ${lock ? 'FOR SHARE' : ''}`);
  const [rollout] = await m.query(`SELECT enabled FROM md_egg_source_house_rollouts
    WHERE company_code=$1 AND house_code=$2`, [owner.companyCode,owner.houseCode]);
  const version: SourceContractVersion = rollout || !gate?.legacy_creates_enabled ? 2 : 1;
  const blocker = version===2 && !rollout ? 'HOUSE_NOT_OPEN'
    : rollout && !rollout.enabled ? 'HOUSE_PAUSED'
    : !gate?.writes_enabled || version===2 && !gate.house_writes_enabled ? 'WRITES_PAUSED' : null;
  return { version, blocker };
}

export async function sourceCreationPrerequisite(m:EntityManager, owner:EggSourceOwner, businessDay:string|null) {
  if (!businessDay) return 'NO_CALENDAR';
  const [enrolled] = await m.query(`SELECT 1 FROM md_egg_source_profiles
    WHERE company_code=$1 AND effective_date<=$2 LIMIT 1`, [owner.companyCode,businessDay]);
  return enrolled ? null : 'NOT_ENROLLED';
}

export async function workspace(db: DataSource, house: string, reader: ChangeReader) {
  return db.transaction('REPEATABLE READ',async m => {
    const owner = await readEggSourceOwner(m,house);
    assertEggSourceScope(reader.scope.visibilityScope??reader.scope,owner);
    const [labels] = await m.query(`SELECT ${ownerFields},${ownerLabels} FROM ${ownerJoin} WHERE h.house_code=$1`,[house]);
    const clock = sourceCalendars[owner.siteCode] ? await sourceClock(m,owner) : null;
    const profiles = await readProfiles(m,owner,clock?.day??null);
    const [pending] = await m.query(`SELECT count(*) FILTER (WHERE c.state='SUBMITTED' AND ($8::date IS NULL OR c.effective_date>$8))::int AS submitted,
      count(*) FILTER (WHERE c.state='SUBMITTED' AND c.effective_date<=$8::date)::int AS expired,
      count(*) FILTER (WHERE c.state='REVOKE_REQUESTED')::int AS "revokeRequested"
      FROM md_egg_source_changes c WHERE ${changeFilter} AND c.state IN ('SUBMITTED','REVOKE_REQUESTED')`,[...changeArgs(owner,reader.scope),clock?.day??null]);
    const policy = await sourceCreatePolicy(m,owner);
    const createContractVersion = policy.version;
    const createScope = createContractVersion===2
      ? { ...sourceScopeFor(reader.scope,2),actionGrants:reader.houseCreateGrants??[] }
      : { ...reader.scope,actionGrants:reader.editGrants??[] };
    const canCreate = canAccessEggSource(createScope,owner);
    const createBlocker = policy.blocker ?? (!canCreate ? 'NO_EDIT' : labels.houseType!=='LAYER' ? 'NON_LAYER'
      : labels.houseStatus!=='ACTIVE' || labels.farmStatus!=='ACTIVE' ? 'INACTIVE_HOUSE'
      : await sourceCreationPrerequisite(m,owner,clock?.day??null)
        ?? (createContractVersion===1 && !(await candidateWarehouses(m,house,createScope)).length ? 'NO_EDIT' : null));
    const current = createContractVersion===2 && !createBlocker ? profiles.find(profile=>profile.status==='CURRENT') : undefined;
    const [continuation] = current ? await m.query(`SELECT new_profile_code AS "profileCode",target_class AS "targetClass",
      payload->'requirements' AS requirements FROM md_egg_source_changes
      WHERE new_profile_code=$1 AND contract_version=1 AND state='APPROVED'
        AND NULLIF(payload->>'warehouseCode','') IS NOT NULL AND approval->'snapshot' IS NOT NULL`,[current.profileCode]) : [];
    return { owner:{ ...owner,houseName:labels.houseName,farmName:labels.farmName,companyName:labels.companyName,siteName:labels.siteName },
      businessDay:clock?.day??null,zone:clock?.zone??null,profiles,pending,createBlocker,createContractVersion,continuation:continuation??null };
  });
}

function cursorPosition(cursor: string|undefined, fingerprint: string): [string|null,string|null] {
  if (!cursor) return [null,null];
  try {
    if (!/^[\w-]{1,400}$/.test(cursor)) throw new Error();
    const value: unknown = JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));
    if (!Array.isArray(value) || value.length!==3 || value[0]!==fingerprint || typeof value[1]!=='string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value[1])
      || !Number.isFinite(Date.parse(value[1]))) throw new Error();
    return [value[1],sourceUuid(value[2],'分页位置')];
  } catch {
    throw new BadRequestException('分页位置无效，请重新查询');
  }
}

export async function changeList(m: EntityManager, query: ChangeListQuery, scope: ChangeScope) {
  const owner = await readEggSourceOwner(m,query.houseCode);
  assertEggSourceScope(scope.visibilityScope??scope,owner);
  const state = query.state || null;
  if (state && state!=='EXPIRED' && !states.includes(state)) throw new BadRequestException('申请状态无效');
  const from = query.dateFrom ? sourceDate(query.dateFrom) : null;
  const to = query.dateTo ? sourceDate(query.dateTo) : null;
  if (from && to && from>to) throw new BadRequestException('结束日期不能早于开始日期');
  const id = query.changeId ? sourceUuid(query.changeId,'申请号') : null;
  const clock = sourceCalendars[owner.siteCode] ? await sourceClock(m,owner) : null;
  const args = changeArgs(owner,scope);
  const fingerprint = sourceDigest([args,state,from,to,id]);
  const [time,last] = cursorPosition(query.cursor,fingerprint);
  const rows = await m.query(`SELECT ${fields},COALESCE(w.warehouse_name_zh,w.warehouse_name) AS warehouse_name,
      NULLIF(u.real_name,'') AS applicant_name
    FROM md_egg_source_changes c LEFT JOIN wms_warehouses w ON w.company_code=c.company_code
      AND w.warehouse_code=c.payload->>'warehouseCode'
    LEFT JOIN sys_user u ON u.user_id::text=c.created_by
    WHERE ${changeFilter} AND ($8::text IS NULL OR (c.state=$8 AND ($8<>'SUBMITTED' OR $14::date IS NULL OR c.effective_date>$14))
      OR ($8='EXPIRED' AND c.state='SUBMITTED' AND c.effective_date<=$14::date))
      AND ($9::date IS NULL OR c.effective_date >= $9) AND ($10::date IS NULL OR c.effective_date <= $10)
      AND ($11::uuid IS NULL OR c.id=$11) AND ($12::timestamptz IS NULL OR (c.created_at,c.id)<($12,$13::uuid))
    ORDER BY c.created_at DESC,c.id DESC LIMIT 26`,[...args,state,from,to,id,time,last,clock?.day??null]);
  const page = rows.slice(0,25);
  const end = page.at(-1);
  return { items:page.map((row:ChangeRow) => ({ ...summary(row), overdue:row.state==='SUBMITTED' && !!clock && row.effective_date<=clock.day })),nextCursor:rows.length>25 && end
    ? Buffer.from(JSON.stringify([fingerprint,end.created_at,end.id])).toString('base64url') : null };
}

const missing = () => new NotFoundException('来源申请或操作回执不存在');

export async function findChange(m: EntityManager, rawId: string, scope: ChangeScope, lock = false) {
  const id = sourceUuid(rawId,'申请号');
  const [row] = await m.query(`SELECT ${fields},h.house_name,f.farm_name,
    COALESCE(w.warehouse_name_zh,w.warehouse_name) AS warehouse_name,NULLIF(u.real_name,'') AS applicant_name
    FROM md_egg_source_changes c JOIN ${changeOwnerJoin}
    LEFT JOIN wms_warehouses w ON w.company_code=c.company_code AND w.warehouse_code=c.payload->>'warehouseCode'
    LEFT JOIN sys_user u ON u.user_id::text=c.created_by
    WHERE c.id=$1 AND c.farm_code=h.farm_code AND c.company_code=f.company_code
      AND c.site_code=${OrgOwnershipService.FARM_SITE_SQL} ${lock ? 'FOR SHARE OF c' : ''}`,[id]);
  if (!row || (row.contract_version===1 && !scope.isGlobal && !row.payload.warehouseCode)
    || !canAccessEggSource(sourceScopeFor(scope,row.contract_version),{companyCode:row.company_code,farmCode:row.farm_code,
    siteCode:row.site_code,houseCode:row.house_code},row.payload.warehouseCode)) throw missing();
  return row as ChangeRow & { house_name:string;farm_name:string;warehouse_name:string|null;applicant_name:string|null };
}

function allowedActions(row:ChangeRow, reader:ChangeReader, future:boolean, active:boolean, planVisible:boolean) {
  const result: Action[] = [];
  if (reader.actor===null) return result;
  const creator = reader.actor===row.created_by;
  const independent = !creator && reader.actor!==row.last_editor;
  if (reader.edit && creator) {
    if (row.state==='DRAFT' && future) result.push('submit');
    if (['DRAFT','SUBMITTED'].includes(row.state)) result.push('cancel');
  }
  if (reader.edit && row.state==='APPROVED' && future && active && row.approval) result.push('request-revoke');
  if (reader.approve && independent && row.state==='SUBMITTED') {
    if (future && active && planVisible && row.approval?.planDigest) result.push('approve');
    result.push('reject');
  }
  if (reader.approve && independent && row.state==='REVOKE_REQUESTED') {
    if (future && active && row.new_profile_code && row.approval) result.push('revoke');
    result.push('decline-revoke');
  }
  return result;
}

export async function changeDetail(db: DataSource, id: string, reader: ChangeReader) {
  return db.transaction('REPEATABLE READ',async m => {
    const row = await findChange(m,id,reader.scope);
    const owner = { companyCode:row.company_code,farmCode:row.farm_code,siteCode:row.site_code,houseCode:row.house_code };
    const clock = sourceCalendars[owner.siteCode] ? await sourceClock(m,owner) : null;
    const [house] = await m.query(`SELECT ${ownerFields},${ownerLabels} FROM ${ownerJoin} WHERE h.house_code=$1`,[owner.houseCode]);
    const active = house.houseType==='LAYER' && house.houseStatus==='ACTIVE' && house.farmStatus==='ACTIVE';
    const future = !!clock && row.effective_date>clock.day;
    const events: EventRecord[] = await m.query(`SELECT e.action,e.actor_id,NULLIF(u.real_name,'') AS actor_name,
      to_char(e.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,e.receipt
      FROM md_egg_source_change_events e LEFT JOIN sys_user u ON u.user_id::text=e.actor_id
      WHERE e.change_id=$1 ORDER BY e.created_at,e.action_key`,[row.id]);
    const approved = events.find(event => event.action==='approve')?.receipt?.change;
    const frozenPlan = (approved??row).approval?.snapshot?.planned;
    const linkedPlanId = row.payload.planDocument ?? frozenPlan?.documentId;
    const [plan] = linkedPlanId ? await authorizedPlans(m,reader.flock,owner,[linkedPlanId]) : [];
    const profiles = await readProfiles(m,owner,clock?.day??null);
    const [gate] = await m.query('SELECT writes_enabled,house_writes_enabled FROM md_egg_source_write_control WHERE id=1');
    const isHouseContract = row.contract_version===2;
    const writesEnabled = !!gate?.writes_enabled && (!isHouseContract || !!gate.house_writes_enabled);
    const scope = sourceScopeFor(reader.scope,row.contract_version);
    const editGrants = isHouseContract ? reader.houseEditGrants : reader.editGrants;
    const approvalGrants = isHouseContract ? reader.houseApproveGrants : reader.approveGrants;
    const edit = writesEnabled && (isHouseContract ? !!editGrants?.length : reader.edit) &&
      canAccessEggSource({ ...scope,actionGrants:editGrants },owner,row.payload.warehouseCode);
    const approve = writesEnabled && (isHouseContract ? !!approvalGrants?.length : reader.approve) &&
      canAccessEggSource({ ...scope,actionGrants:approvalGrants },owner,row.payload.warehouseCode);
    const items = row.approval?.snapshot?.items;
    const check = isHouseContract && row.state==='SUBMITTED' && future && items?.length
      ? await checkHouseInventoryReadiness(m,owner,row.effective_date,items)
      : isHouseContract ? row.approval?.readiness : undefined;
    const readiness = check?.status==='BLOCKED' ? {status:check.status,code:check.code} : check ? {
      status:check.status,
      warehouseCode:check.scope && (reader.warehouseGlobal || reader.warehouseCodes?.includes(check.scope.warehouse_code))
        ? check.scope.warehouse_code : null,
      digest:row.state==='SUBMITTED' && approve ? sourceDigest(check) : null,
    } : undefined;
    const actions = allowedActions(row,{ ...reader,edit,approve },future,active,!linkedPlanId || !!plan);
    const originalApproval = approved ? {
      previousProfileCode:approved.previous_profile_code,
      newProfileCode:approved.new_profile_code,
      previousClass:approved.approval?.previousClass??null,
      newExpiry:approved.approval?.priorEndsOn??null,
    } : null;
    return {
      ...summary(row),writesPaused:!writesEnabled,overdue:row.state==='SUBMITTED' && !!clock && !future,owner:{ ...owner,houseName:row.house_name,farmName:row.farm_name,companyName:house.companyName,siteName:house.siteName },
      businessDay:clock?.day??null,zone:clock?.zone??null,reason:row.payload.reason,requirements:row.payload.requirements,
      linkedPlan:!!linkedPlanId,plan:plan ? { ...plan,frozenVersion:frozenPlan?.version??null,
        flock_no:frozenPlan?.flockNo??plan.flock_no } : null,originalApproval,previousClass:row.approval?.previousClass??null,
      currentProfiles:profiles.filter(profile => profile.status==='CURRENT' || profile.status==='FUTURE' || profile.status==='UNVERIFIED'),
      planDigest:row.approval?.planDigest??null,readiness,
      frozenItems:row.approval?.snapshot?.items?.map(({ productCode,skuCode,gradeCode,specCode,domainId }) =>
        ({ productCode,skuCode,gradeCode,specCode,domainVerified:!!domainId }))??[],
      events:events.map(event => ({ action:event.action,actor:event.actor_id,actorName:event.actor_name,at:event.created_at,reason:event.receipt?.reason??null,
        version:event.receipt?.change?.version??null,state:event.receipt?.change?.state??null }))
        .sort((a,b) => (a.version??Number.MAX_SAFE_INTEGER)-(b.version??Number.MAX_SAFE_INTEGER)),
      allowedActions:actions.filter(action=>action!=='approve' || !isHouseContract || !!readiness && readiness.status!=='BLOCKED'),
      canPrecheck:edit && reader.actor===row.created_by && row.state==='DRAFT' && active && future,
    };
  });
}

export async function draftReceipt(m: EntityManager, key: string, house: string, scope: ChangeScope, actor: string) {
  const requestKey = sourceUuid(key,'创建请求号');
  const houseCode = sourceText(house,'鸡舍',64);
  const owner = await readEggSourceOwner(m,houseCode).catch(error => {
    if (error instanceof ConflictException) throw missing();
    throw error;
  });
  if (!canAccessEggSource(scope.visibilityScope??scope,owner)) throw missing();
  const [row] = await m.query(`SELECT c.id,c.version,c.state FROM md_egg_source_changes c
    WHERE ${changeFilter} AND c.request_key=$8 AND c.created_by=$9`,[...changeArgs(owner,scope),requestKey,actor]);
  if (!row) throw missing();
  return { ...row,action:'create' };
}

export async function actionReceipt(m: EntityManager, id: string, key: string, scope: ChangeScope, actor: string) {
  const requestKey = sourceUuid(key,'操作请求号');
  return m.transaction('REPEATABLE READ',async tx => {
    const row = await findChange(tx,id,scope);
    const [event] = await tx.query(`SELECT action,receipt FROM md_egg_source_change_events
      WHERE change_id=$1 AND action_key=$2 AND actor_id=$3`,[row.id,requestKey,actor]);
    if (!event) throw missing();
    return { id:row.id,action:event.action,state:event.receipt?.change?.state??null,version:event.receipt?.change?.version??null };
  });
}

const flockSourceFilter = `d.company_code=f.company_code AND d.farm_code=h.farm_code
  AND d.site_code IS NOT DISTINCT FROM ${OrgOwnershipService.FARM_SITE_SQL}`;
const planFields = 'd.id,d.flock_no,d.kind,d.status,d.version,d.business_date::text';
const planOwnerFields = 'd.company_code AS "companyCode",d.farm_code AS "farmCode",d.site_code AS "siteCode",d.house_code AS "houseCode"';
type ScopedPlan = EggSourceOwner & { id:string; flock_no:string; version:number; kind:string; status:string; business_date:string };
function visiblePlans(rows: ScopedPlan[], flock: ChangeScope) {
  return rows.filter(row=>canAccessEggSource(flock,row)).map(row=>({
    id:row.id,flock_no:row.flock_no,version:row.version,kind:row.kind,status:row.status,business_date:row.business_date,
  }));
}

export async function planOptions(m:EntityManager, house:string, date:string, scope:ChangeScope, flock?:ChangeScope) {
  const owner = await readEggSourceOwner(m,house);
  assertEggSourceScope(scope,owner);
  const day = sourceDate(date);
  if (!flock) return [];
  const rows: ScopedPlan[] = await m.query(`SELECT ${planFields},${planOwnerFields} FROM brd_flock_documents d
    JOIN brd_houses h ON h.house_code=d.house_code JOIN ${OrgOwnershipService.FARM_TABLE} f ON f.farm_code=h.farm_code
    WHERE ${houseFilter} AND ${flockSourceFilter} AND d.company_code=$5 AND d.business_date=$6
      AND d.status IN ('DRAFT','SUBMITTED','APPROVED','POSTED')
      AND (d.kind='ADMIT' AND d.house_code=$7 OR d.kind='TRANSFER' AND d.payload->>'targetHouseCode'=$7)
    ORDER BY d.created_at DESC,d.id DESC LIMIT 100`,[...ownerArgs(flock),owner.companyCode,day,owner.houseCode]);
  return visiblePlans(rows,flock);
}

export async function authorizedPlans(m:EntityManager, flock:ChangeScope|undefined, owner:EggSourceOwner, ids:string[], lock = false) {
  if (!flock || !ids.length) return [];
  const rows: ScopedPlan[] = await m.query(`SELECT ${planFields},${planOwnerFields} FROM brd_flock_documents d
    JOIN brd_houses h ON h.house_code=d.house_code JOIN ${OrgOwnershipService.FARM_TABLE} f ON f.farm_code=h.farm_code
    WHERE ${houseFilter} AND ${flockSourceFilter} AND d.id=ANY($5::text[]) AND d.company_code=$6
      AND (d.kind='ADMIT' AND d.house_code=$7 OR d.kind='TRANSFER' AND d.payload->>'targetHouseCode'=$7)
      ${lock ? 'FOR SHARE OF d,h,f' : ''}`,
  [...ownerArgs(flock),ids,owner.companyCode,owner.houseCode]);
  return visiblePlans(rows,flock);
}

export function redactChange<T extends ChangeRow>(row:T, visible:boolean):Omit<T,'request_key'> {
  const projected:T & { request_key?:string } = { ...row };
  delete projected.request_key;
  const approval = row.approval;
  if (approval?.readiness) {
    const { readiness:_,...visibleApproval } = approval;
    projected.approval = visibleApproval;
  }
  if (!visible && (row.payload.planDocument || approval?.snapshot?.planned)) {
    projected.payload = { ...row.payload,planDocument:null };
    if (projected.approval?.snapshot) {
      projected.approval = { ...projected.approval,snapshot:{ ...projected.approval.snapshot,planned:null } };
    }
  }
  return projected;
}
