import { ConflictException,ForbiddenException,NotFoundException,UnauthorizedException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { lockEggSourceGrantEditor,requireEggSourceAdministrator,type EggSourceGrantActor } from '../../../auth/egg-source-organization-grants';
import type { EggSourceAccessService,EggSourceAccount } from './egg-source-access.service';
import { lockEggSourceHouse,readEggSourceOwner,sourceCalendars,sourceClock,sourceDigest,sourceText,sourceUuid } from './egg-source-change-policy';
import { sourceCreationPrerequisite } from './egg-source-change-read';
import { cutoverKey,cutoverReplay,digestInput,recordCutover } from './egg-source-cutover-ledger';
import { readEggSourceReleaseEvidence } from './egg-source-cutover-release';
import { OrgOwnershipService } from '../../org/services/org-ownership.service';

type Participants={house:string;maker:string;reviewer:string};
type PublicState={id:string;house:string;expiresAt:string;digest:string;makerSigned:boolean;reviewerSigned:boolean;consumed:boolean};
type Snapshot=Awaited<ReturnType<typeof snapshot>>;
type Challenge=PublicState & {snapshot:Snapshot;participants:Participants;reason:string;bindingVersion?:2};

export async function lockEggSourceRetirementRoster(m:EntityManager) {
  await m.query("SET LOCAL lock_timeout='5s'");
  await m.query(`LOCK TABLE brd_houses,${OrgOwnershipService.FARM_TABLE},md_egg_source_profiles,sys_organizations IN SHARE MODE`);
}

export function eligibleEggSourceHouses(siteParameter:string) {
  return `h.status='ACTIVE' AND h.house_type='LAYER' AND f.status='ACTIVE'
    AND (${OrgOwnershipService.FARM_SITE_SQL}=ANY(${siteParameter}::text[]) OR
      EXISTS (SELECT 1 FROM md_egg_source_profiles p WHERE p.company_code=f.company_code))`;
}

export const eggSourceGovernedSites=Object.keys(sourceCalendars).sort();

function sortedOrigins<T extends {origins:unknown[]}>(account:T) {
  return [...account.origins].sort((a,b)=>sourceDigest(a).localeCompare(sourceDigest(b)));
}

async function snapshot(m:EntityManager,access:EggSourceAccessService,participants:Participants,lock=false) {
  const [gate]=await m.query(`SELECT writes_enabled,house_writes_enabled,legacy_creates_enabled,
    changed_at::text AS revision,house_changed_at::text AS house_revision
    FROM md_egg_source_write_control WHERE id=1 ${lock?'FOR UPDATE':''}`,[]);
  if (!gate?.writes_enabled||!gate.house_writes_enabled||!gate.legacy_creates_enabled) {
    throw new ConflictException('请核对来源总写入、新版写入和旧版新建状态');
  }
  const proof=await readEggSourceReleaseEvidence();
  if (!proof) throw new ConflictException('当前部署缺少有效的隔离验收凭证');
  const owner=await readEggSourceOwner(m,participants.house,true,lock);
  const businessDay=(await sourceClock(m,owner)).day;
  const schedule:{code:string;mode:string;variety:string|null;effective:string;expires:string|null}[]=await m.query(`
    SELECT profile_code AS code,product_mode AS mode,variety_code AS variety,
      effective_date::text AS effective,expire_date::text AS expires
    FROM md_egg_source_profiles WHERE company_code=$1 AND house_code=$2 AND status='ACTIVE'
      AND (expire_date IS NULL OR expire_date>=$3::date) ORDER BY effective_date,profile_code`,
    [owner.companyCode,owner.houseCode,businessDay]);
  const blocker=await sourceCreationPrerequisite(m,owner,businessDay);
  if (blocker) throw new ConflictException({subcode:blocker,message:'请核对公司来源切入和场站业务日'});
  const rollouts:{company_code:string;house_code:string;enabled:boolean|null;revision:string|null}[]=await m.query(`
    SELECT f.company_code,h.house_code,r.enabled,r.changed_at::text AS revision FROM brd_houses h
    JOIN ${OrgOwnershipService.FARM_TABLE} f USING(farm_code)
    LEFT JOIN md_egg_source_house_rollouts r ON r.company_code=f.company_code AND r.house_code=h.house_code
    WHERE ${eligibleEggSourceHouses('$1')}
    ORDER BY f.company_code,h.house_code`,[eggSourceGovernedSites]);
  if (rollouts.some(row=>row.enabled===null)||!rollouts.some(row=>row.company_code===owner.companyCode&&
    row.house_code===owner.houseCode&&row.enabled===true)) throw new ConflictException('请核对所有适用鸡舍的开通或暂停状态');
  const [maker,reviewer]=await Promise.all([access.inspectHouseAccount(m,owner,participants.maker),
    access.inspectHouseAccount(m,owner,participants.reviewer)]);
  if (!maker.accountId||!reviewer.accountId||maker.accountId===reviewer.accountId||
      maker.permissionsVersion===undefined||reviewer.permissionsVersion===undefined||
      !(['V','C','E'] as const).every(action=>maker.actions.includes(action))||
      !(['V','A'] as const).every(action=>reviewer.actions.includes(action))) {
    throw new ConflictException({subcode:'HOUSE_ROLES_NOT_READY',message:'请核对本舍的实名申请岗与独立审核岗有效权限'});
  }
  return {proof,owner,businessDay,gate,rollouts,schedule,
    maker:{id:maker.accountId,version:maker.permissionsVersion,actions:maker.actions,origins:sortedOrigins(maker)},
    reviewer:{id:reviewer.accountId,version:reviewer.permissionsVersion,actions:reviewer.actions,origins:sortedOrigins(reviewer)}};
}

async function lockVerification(m:EntityManager,house:string) {
  await lockEggSourceGrantEditor(m);
  await lockEggSourceHouse(m,house);
}

async function challenge(m:EntityManager,id:string):Promise<Challenge> {
  const [row]=await m.query("SELECT receipt FROM md_egg_source_cutover_records WHERE request_id=$1 AND kind='VERIFY'",[id]);
  if (!row) throw new NotFoundException('未找到切换核验');
  return row.receipt;
}

async function state(m:EntityManager,verification:Challenge):Promise<PublicState> {
  const records:{kind:string;actor_id:string;digest:string}[]=await m.query(`
    SELECT kind,actor_id,receipt->>'digest' AS digest FROM md_egg_source_cutover_records WHERE parent_id=$1`,[verification.id]);
  const has=(id:string)=>records.some(row=>row.kind==='SIGN'&&row.actor_id===id&&row.digest===verification.digest);
  const {id,house,digest,expiresAt}=verification;
  return {id,house,digest,expiresAt,makerSigned:has(verification.snapshot.maker.id),
    reviewerSigned:has(verification.snapshot.reviewer.id),consumed:records.some(row=>row.kind==='RETIRE')};
}

function participant(verification:Challenge,user?:EggSourceAccount) {
  const id=String(user?.userId??'');
  if (user?.impersonatedBy) throw new ForbiddenException('请使用本人账号核验');
  const member=[verification.snapshot.maker,verification.snapshot.reviewer].find(account=>account.id===id);
  if (!member) throw new NotFoundException('未找到切换核验');
  if (member.version!==user?.perms_version) throw new UnauthorizedException({subcode:'PERMS_CHANGED',message:'请重新登录后由管理员重新发起核验'});
  return member;
}

async function validate(m:EntityManager,access:EggSourceAccessService,verification:Challenge,lock=false) {
  const [clock]=await m.query('SELECT clock_timestamp() < $1::timestamptz AS valid',[verification.expiresAt]);
  if (!clock?.valid || verification.bindingVersion!==2 ||
      sourceDigest({ snapshot:await snapshot(m,access,verification.participants,lock), reason:verification.reason })!==verification.digest) {
    throw new ConflictException('开通状态、账号权限、验收版本或核验有效期已变化，请重新发起核验');
  }
}

export async function beginEggSourceVerification(m:EntityManager,access:EggSourceAccessService,user:EggSourceGrantActor,
  raw:{requestId?:unknown;house?:unknown;maker?:unknown;reviewer?:unknown;reason?:unknown}) {
  const id=cutoverKey(raw?.requestId);
  const participants={house:sourceText(raw?.house,'鸡舍',64),maker:sourceText(raw?.maker,'申请账号',64),
    reviewer:sourceText(raw?.reviewer,'审核账号',64)};
  const reason=sourceText(raw?.reason,'切换核验依据',500);
  await lockVerification(m,participants.house);
  const actor=await requireEggSourceAdministrator(m,user);
  const input={participants,reason};
  const replay=await cutoverReplay<Challenge>(m,id,'VERIFY',actor,input);
  if (replay) return state(m,replay);
  const frozen=await snapshot(m,access,participants,true);
  const [clock]=await m.query("SELECT clock_timestamp()+interval '30 minutes' AS expires_at");
  const expiresAt=new Date(Math.min(new Date(clock.expires_at).getTime(),Date.parse(frozen.proof.expiresAt))).toISOString();
  const data:Challenge={id,house:participants.house,expiresAt,digest:sourceDigest({snapshot:frozen,reason}),makerSigned:false,
    reviewerSigned:false,consumed:false,snapshot:frozen,participants,reason,bindingVersion:2};
  await recordCutover(m,id,'VERIFY',actor,input,data);
  return state(m,data);
}

export async function readEggSourceVerification(m:EntityManager,access:EggSourceAccessService,idRaw:unknown,user:EggSourceAccount,admin=false) {
  const data=await challenge(m,sourceUuid(idRaw,'核验号'));
  if (!admin) participant(data,user);
  const status=await state(m,data);
  if (!status.consumed) await validate(m,access,data);
  return {...status,reason:data.reason,businessDay:data.snapshot.businessDay,schedule:data.snapshot.schedule,
    release:data.snapshot.proof.commit,company:data.snapshot.owner.companyCode,site:data.snapshot.owner.siteCode,
    step:admin?null:data.snapshot.maker.id===String(user.userId)?'MAKER':'REVIEWER'};
}

export async function signEggSourceVerification(m:EntityManager,access:EggSourceAccessService,idRaw:unknown,user:EggSourceAccount,
  raw:{requestId?:unknown;digest?:unknown;confirmed?:unknown}) {
  const key=cutoverKey(raw?.requestId);
  const digest=digestInput(raw?.digest);
  if (raw?.confirmed!==true) throw new ConflictException('请确认当前核验内容');
  const data=await challenge(m,sourceUuid(idRaw,'核验号'));
  const {id:actor}=participant(data,user);
  const input={id:data.id,digest};
  await lockVerification(m,data.house);
  const replay=await cutoverReplay(m,key,'SIGN',actor,input);
  if (replay) return state(m,data);
  await validate(m,access,data,true);
  const [existing]=await m.query("SELECT 1 FROM md_egg_source_cutover_records WHERE parent_id=$1 AND kind='SIGN' AND actor_id=$2",
    [data.id,actor]);
  if (digest!==data.digest||existing) throw new ConflictException('核验内容已变化，或该账号已确认');
  await recordCutover(m,key,'SIGN',actor,input,{id:data.id,digest},data.id);
  return state(m,data);
}

export async function verifyRetirementChallenge(m:EntityManager,access:EggSourceAccessService,
  command:{ id:string; digest:string; companyCode:string; houseCode:string; signedReason:string }) {
  const data=await challenge(m,command.id);
  if (data.digest!==command.digest || data.house!==command.houseCode || data.reason!==command.signedReason ||
      data.snapshot.owner.companyCode!==command.companyCode) {
    throw new ConflictException({code:'RETIREMENT_EVIDENCE_CHANGED',message:'所选鸡舍或依据与双岗核验不一致，请重新核对'});
  }
  await validate(m,access,data,true);
  const status=await state(m,data);
  if (!status.makerSigned||!status.reviewerSigned||status.consumed) throw new ConflictException('须由两个独立账号完成同一核验');
  return status;
}
