import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { OrgOwnershipService } from '../../org/services/org-ownership.service';
import type { Action, ChangeRow, ChangeScope } from './egg-source-change.service';
import {
  assertEggSourceScope, canAccessEggSource, commercialShellClass, EggSourceOwner, readEggSourceOwner,
  sourceCalendars, sourceClock, sourceDate, sourceDigest, sourceText, sourceUuid,
} from './egg-source-change-policy';

export type ChangeReader = { scope:ChangeScope; actor:string|null; edit:boolean; approve:boolean; editGrants?:readonly ChangeScope[]; approveGrants?:readonly ChangeScope[]; flock?:ChangeScope };
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
  AND ($5::boolean OR c.payload->>'warehouseCode'=ANY($6::text[]))`;

function ownerArgs(scope: ChangeScope) {
  return [scope.isGlobal,scope.companyCodes??[],scope.farmCodes??[],scope.siteCodes??[]];
}

export function changeArgs(owner: EggSourceOwner, scope: ChangeScope) {
  const grants = scope.viewGrants ?? [scope];
  return [owner.companyCode,owner.farmCode,owner.siteCode,owner.houseCode,
    grants.some(grant => grant.isGlobal && !grant.restrictedWarehouse && canAccessEggSource(grant,owner)),
    [...new Set(grants.flatMap(grant => grant.restrictedWarehouse ? [grant.restrictedWarehouse] : grant.allowedWarehouses ?? []))].filter(code => canAccessEggSource(scope,owner,code))];
}

function summary(row: ChangeRow & { warehouse_name?:string|null; applicant_name?:string|null }) {
  return { id:row.id, version:row.version, state:row.state, effectiveDate:row.effective_date,
    targetClass:row.target_class, createdBy:row.created_by, createdByName:row.applicant_name??null,createdAt:row.created_at,
    warehouseCode:row.payload.warehouseCode, warehouseName:row.warehouse_name??null };
}

export async function candidateHouses(m: EntityManager, scope: ChangeScope) {
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

export async function workspace(db: DataSource, house: string, reader: ChangeReader) {
  return db.transaction('REPEATABLE READ',async m => {
    const owner = await readEggSourceOwner(m,house);
    assertEggSourceScope(reader.scope,owner);
    const [labels] = await m.query(`SELECT ${ownerFields},${ownerLabels} FROM ${ownerJoin} WHERE h.house_code=$1`,[house]);
    const clock = sourceCalendars[owner.siteCode] ? await sourceClock(m,owner) : null;
    const profiles = await readProfiles(m,owner,clock?.day??null);
    const [enrolled] = clock ? await m.query(`SELECT 1 FROM md_egg_source_profiles
      WHERE company_code=$1 AND effective_date<=$2 LIMIT 1`,[owner.companyCode,clock.day]) : [];
    const [pending] = await m.query(`SELECT count(*) FILTER (WHERE c.state='SUBMITTED' AND ($7::date IS NULL OR c.effective_date>$7))::int AS submitted,
      count(*) FILTER (WHERE c.state='SUBMITTED' AND c.effective_date<=$7::date)::int AS expired,
      count(*) FILTER (WHERE c.state='REVOKE_REQUESTED')::int AS "revokeRequested"
      FROM md_egg_source_changes c WHERE ${changeFilter} AND c.state IN ('SUBMITTED','REVOKE_REQUESTED')`,[...changeArgs(owner,reader.scope),clock?.day??null]);
    const [gate] = await m.query('SELECT writes_enabled FROM md_egg_source_write_control WHERE id=1');
    const canEdit = reader.edit && (await candidateWarehouses(m,house,{ ...reader.scope,actionGrants:reader.editGrants })).length>0;
    const createBlocker = !canEdit ? 'NO_EDIT' : !gate?.writes_enabled ? 'WRITES_PAUSED' : labels.houseType!=='LAYER' ? 'NON_LAYER'
      : labels.houseStatus!=='ACTIVE' || labels.farmStatus!=='ACTIVE' ? 'INACTIVE_HOUSE'
      : !clock ? 'NO_CALENDAR' : !enrolled ? 'NOT_ENROLLED' : null;
    return { owner:{ ...owner,houseName:labels.houseName,farmName:labels.farmName,companyName:labels.companyName,siteName:labels.siteName },
      businessDay:clock?.day??null,zone:clock?.zone??null,profiles,pending,createBlocker };
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
  assertEggSourceScope(scope,owner);
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
    WHERE ${changeFilter} AND ($7::text IS NULL OR (c.state=$7 AND ($7<>'SUBMITTED' OR $13::date IS NULL OR c.effective_date>$13))
      OR ($7='EXPIRED' AND c.state='SUBMITTED' AND c.effective_date<=$13::date))
      AND ($8::date IS NULL OR c.effective_date >= $8) AND ($9::date IS NULL OR c.effective_date <= $9)
      AND ($10::uuid IS NULL OR c.id=$10) AND ($11::timestamptz IS NULL OR (c.created_at,c.id)<($11,$12::uuid))
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
    WHERE ${houseFilter} AND c.id=$5 AND c.farm_code=h.farm_code AND c.company_code=f.company_code
      AND c.site_code=${OrgOwnershipService.FARM_SITE_SQL}
      AND ($1::boolean OR c.payload->>'warehouseCode'=ANY($6::text[])) ${lock ? 'FOR SHARE OF c' : ''}`,[...ownerArgs(scope),id,scope.allowedWarehouses??[]]);
  if (!row || !canAccessEggSource(scope,{companyCode:row.company_code,farmCode:row.farm_code,
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
    const [plan] = row.payload.planDocument ? await authorizedPlans(m,reader.flock,owner,[row.payload.planDocument]) : [];
    const frozenPlan = (approved??row).approval?.snapshot?.planned;
    const profiles = await readProfiles(m,owner,clock?.day??null);
    const [gate] = await m.query('SELECT writes_enabled FROM md_egg_source_write_control WHERE id=1');
    const edit = !!gate?.writes_enabled && reader.edit &&
      canAccessEggSource({ ...reader.scope,actionGrants:reader.editGrants },owner,row.payload.warehouseCode);
    const approve = !!gate?.writes_enabled && reader.approve &&
      canAccessEggSource({ ...reader.scope,actionGrants:reader.approveGrants },owner,row.payload.warehouseCode);
    const originalApproval = approved ? {
      previousProfileCode:approved.previous_profile_code,
      newProfileCode:approved.new_profile_code,
      previousClass:approved.approval?.previousClass??null,
      newExpiry:approved.approval?.priorEndsOn??null,
    } : null;
    return {
      ...summary(row),writesPaused:!gate?.writes_enabled,overdue:row.state==='SUBMITTED' && !!clock && !future,owner:{ ...owner,houseName:row.house_name,farmName:row.farm_name,companyName:house.companyName,siteName:house.siteName },
      businessDay:clock?.day??null,zone:clock?.zone??null,reason:row.payload.reason,requirements:row.payload.requirements,
      linkedPlan:!!row.payload.planDocument,plan:plan ? { ...plan,frozenVersion:frozenPlan?.version??null,
        flock_no:frozenPlan?.flockNo??plan.flock_no } : null,originalApproval,previousClass:row.approval?.previousClass??null,
      currentProfiles:profiles.filter(profile => profile.status==='CURRENT' || profile.status==='FUTURE' || profile.status==='UNVERIFIED'),
      planDigest:row.approval?.planDigest??null,
      frozenItems:row.approval?.snapshot?.items?.map(({ productCode,skuCode,gradeCode,specCode,domainId }) =>
        ({ productCode,skuCode,gradeCode,specCode,domainVerified:!!domainId }))??[],
      events:events.map(event => ({ action:event.action,actor:event.actor_id,actorName:event.actor_name,at:event.created_at,reason:event.receipt?.reason??null,
        version:event.receipt?.change?.version??null,state:event.receipt?.change?.state??null }))
        .sort((a,b) => (a.version??Number.MAX_SAFE_INTEGER)-(b.version??Number.MAX_SAFE_INTEGER)),
      allowedActions:allowedActions(row,{ ...reader,edit,approve },future,active,!row.payload.planDocument || !!plan),
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
  if (!canAccessEggSource(scope,owner)) throw missing();
  const [row] = await m.query(`SELECT c.id,c.version,c.state FROM md_egg_source_changes c
    WHERE ${changeFilter} AND c.request_key=$7 AND c.created_by=$8`,[...changeArgs(owner,scope),requestKey,actor]);
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
  if (!visible && row.payload.planDocument) {
    projected.payload = { ...row.payload,planDocument:null };
    const approval = row.approval;
    if (approval?.snapshot) projected.approval = { ...approval,snapshot:{ ...approval.snapshot,planned:null } };
  }
  return projected;
}
