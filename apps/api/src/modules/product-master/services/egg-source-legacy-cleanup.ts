import { BadRequestException,ConflictException,NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { EGG_SOURCE_MENU } from '../../../auth/egg-source-permissions';
import { lockEggSourceGrantEditor,requireEggSourceAdministrator,type EggSourceGrantActor } from '../../../auth/egg-source-organization-grants';
import { lockEggSourceHouse,sourceDigest,sourceText,sourceUuid } from './egg-source-change-policy';
import { cutoverKey,cutoverReplay,digestInput,notArchived,recordCutover } from './egg-source-cutover-ledger';

type ArchiveRow={id:string;company_code:string;farm_code:string;site_code:string;house_code:string;state:string;version:number;
  previous_profile_code:string|null;new_profile_code:string|null;approval_seen:boolean;references_seen:boolean;archived:boolean;archive_revision:string|null;warehouse_code:string|null};
type AuthRow={kind:'role'|'set';code:string;perm_codes:string;deny_codes:string|null;scope_type:string|null;scope_value:string|null;subject_id:string;menu_id:string;members:string[]};
const removableActions=['V','E','A'];

function authority(kind:unknown) {
  if (kind==='role') return {kind,table:'sys_role_menu_permission',subjects:'sys_role',key:'role_id',code:'role_code'};
  if (kind==='set') return {kind,table:'sys_permission_set_item',subjects:'sys_permission_set',key:'set_id',code:'set_code'};
  throw new BadRequestException('权限主体类型无效');
}

function archivedStatus(row:ArchiveRow) {
  if (row.previous_profile_code||row.new_profile_code||row.approval_seen||row.references_seen) return 'RETAIN_EVIDENCE';
  if (row.state!=='CANCELLED'&&row.state!=='REJECTED') return 'NEEDS_DISPOSITION';
  return row.archived?'ARCHIVED':'ELIGIBLE';
}

async function archiveRows(m:EntityManager,ids:string[]|null,lock=false):Promise<ArchiveRow[]> {
  return m.query(`SELECT c.id,c.company_code,c.farm_code,c.site_code,c.house_code,c.state,c.version,
    c.previous_profile_code,c.new_profile_code,c.payload->>'warehouseCode' AS warehouse_code,
    c.approved_by IS NOT NULL OR EXISTS (SELECT 1 FROM md_egg_source_change_events e
      WHERE e.change_id=c.id AND e.action IN ('approve','request-revoke','revoke','decline-revoke')) AS approval_seen,
    EXISTS (
      SELECT 1 FROM inv_batches b WHERE b.source_profile_code=COALESCE(c.new_profile_code,'ESP-CHANGE-'||c.id::text)
        OR jsonb_path_exists(b.source_profile_snapshot,'$.** ? (@ == $profile || @ == $approval)',
          jsonb_build_object('profile',COALESCE(c.new_profile_code,'ESP-CHANGE-'||c.id::text),'approval',c.id::text))
      UNION ALL
      SELECT 1 FROM inv_flock_source_links l
      WHERE jsonb_path_exists(l.source_profile_snapshot,'$.** ? (@ == $profile || @ == $approval)',
        jsonb_build_object('profile',COALESCE(c.new_profile_code,'ESP-CHANGE-'||c.id::text),'approval',c.id::text))
      UNION ALL
      SELECT 1 FROM production_cutover_scopes i WHERE i.source_profile_code=COALESCE(c.new_profile_code,'ESP-CHANGE-'||c.id::text)
      UNION ALL
      SELECT 1 FROM production_raw_receipts r WHERE
        r.payload#>>'{profile,profileCode}'=COALESCE(c.new_profile_code,'ESP-CHANGE-'||c.id::text)
        OR r.payload#>>'{profile,approvalId}'=c.id::text
      UNION ALL
      SELECT 1 FROM production_inbound_documents d WHERE
        d.payload#>>'{profile,profileCode}'=COALESCE(c.new_profile_code,'ESP-CHANGE-'||c.id::text)
        OR d.payload#>>'{profile,approvalId}'=c.id::text
    ) AS references_seen,
    NOT (${notArchived}) AS archived,
    (SELECT a.seq::text FROM md_egg_source_archive_marks a WHERE a.change_id=c.id ORDER BY a.seq DESC LIMIT 1) AS archive_revision
    FROM md_egg_source_changes c WHERE contract_version=1 AND ($1::uuid[] IS NULL OR c.id=ANY($1))
    ORDER BY c.id ${lock?'FOR UPDATE OF c':''}`,[ids]);
}

function legacyMembers(a:ReturnType<typeof authority>) {
  const members=a.kind==='role' ? 'SELECT user_id FROM sys_user_role WHERE role_id=p.role_id' :
    `SELECT user_id FROM sys_user_permission_set WHERE set_id=p.set_id UNION
      SELECT ur.user_id FROM sys_user_role ur JOIN sys_role_permission_set ps USING(role_id) WHERE ps.set_id=p.set_id`;
  return `ARRAY(SELECT user_id::text FROM (${members}) member JOIN sys_user u USING(user_id) ORDER BY user_id) AS members`;
}

export async function legacyCleanupInventory(m:EntityManager) {
  const [gate]=await m.query("SELECT writes_enabled,legacy_creates_enabled,changed_at::text AS pause_revision FROM md_egg_source_write_control WHERE id=1");
  const rows=await archiveRows(m,null);
  const grants:AuthRow[]=(await Promise.all((['role','set'] as const).map(async kind=>{
    const a=authority(kind);
    return m.query(`SELECT $2::text AS kind,s.${a.code} AS code,p.perm_codes,p.deny_codes,p.scope_type,p.scope_value,
      p.${a.key}::text AS subject_id,p.menu_id::text AS menu_id,${legacyMembers(a)}
      FROM ${a.table} p JOIN ${a.subjects} s USING(${a.key}) JOIN sys_menu menu USING(menu_id)
      WHERE menu.menu_code=$1 AND NULLIF(p.perm_codes,'') IS NOT NULL ORDER BY s.${a.code}`,[EGG_SOURCE_MENU,kind]);
  }))).flat();
  return {paused:gate?.writes_enabled===false,retired:gate?.legacy_creates_enabled===false,pauseRevision:gate?.pause_revision,rows:rows.map(row=>({...row,classification:archivedStatus(row),digest:sourceDigest(row)})),
    grants:grants.map(row=>({...row,digest:sourceDigest(row)}))};
}

async function requireCleanupPause(m:EntityManager,revision:string,requireRetired=false) {
  const [gate]=await m.query('SELECT writes_enabled,legacy_creates_enabled,changed_at::text AS pause_revision FROM md_egg_source_write_control WHERE id=1 FOR SHARE');
  if (!gate||gate.writes_enabled!==false) throw new ConflictException('请先暂停来源总写入');
  if (gate.pause_revision!==revision) throw new ConflictException('来源写入开关已变化，请重查清理清单');
  if (requireRetired&&gate.legacy_creates_enabled!==false) throw new ConflictException('关闭旧版新建后才能撤回旧版授权');
}

export async function archiveLegacyBatch(m:EntityManager,user:EggSourceGrantActor,raw:{
  requestId?:unknown; confirmed?:unknown; pauseRevision?:unknown; rows?:{id:unknown;digest:unknown}[];reason?:unknown; archived?:unknown
}) {
  const key=cutoverKey(raw?.requestId);
  const reason=sourceText(raw?.reason,'归档依据',500);
  const pauseRevision=sourceText(raw?.pauseRevision,'来源写入暂停版本',64);
  if (raw?.confirmed!==true) throw new BadRequestException('须确认测试单归档或恢复依据');
  if (typeof raw?.archived!=='boolean'||!Array.isArray(raw.rows)||raw.rows.length<1||raw.rows.length>500) {
    throw new BadRequestException('请选择最多 500 张已核对的旧版申请');
  }
  const entries=raw.rows.map(row=>({id:sourceUuid(row?.id,'申请号'),digest:digestInput(row?.digest)})).sort((a,b)=>a.id.localeCompare(b.id));
  const ids=[...new Set(entries.map(row=>row.id))];
  if (entries.length!==ids.length) throw new BadRequestException('申请号重复');
  const actor=await requireEggSourceAdministrator(m,user);
  const kind=raw.archived?'ARCHIVE':'UNARCHIVE';
  const input={reason,entries,pauseRevision};
  const previous=await archiveRows(m,ids);
  for (const house of [...new Set(previous.map(row=>row.house_code))].sort()) await lockEggSourceHouse(m,house);
  const replay=await cutoverReplay(m,key,kind,actor,input);
  if (replay) return replay;
  await requireCleanupPause(m,pauseRevision);
  const rows=await archiveRows(m,ids,true);
  if (rows.length!==entries.length||rows.some((row,index)=>row.id!==entries[index].id||sourceDigest(row)!==entries[index].digest||
      (raw.archived?archivedStatus(row)!=='ELIGIBLE':!row.archived))) {
    throw new ConflictException('有旧单状态、审批证据或归档标记已变化，请重新核对');
  }
  const receipt={requestId:key,archived:raw.archived,ids,reason,beforeRows:rows};
  await recordCutover(m,key,kind,actor,input,receipt);
  await m.query(`INSERT INTO md_egg_source_archive_marks(change_id,batch_id,archived)
    SELECT id,$2,$3 FROM unnest($1::uuid[]) id`,[ids,key,raw.archived]);
  return receipt;
}

export async function withdrawLegacyGrant(m:EntityManager,user:EggSourceGrantActor,kindRaw:unknown,codeRaw:unknown,raw:{
  requestId?:unknown; digest?:unknown; remove?:unknown;reason?:unknown;confirmed?:unknown;pauseRevision?:unknown
}) {
  const a=authority(kindRaw);
  const code=sourceText(codeRaw,'权限主体',64);
  const key=cutoverKey(raw?.requestId);
  const digest=digestInput(raw?.digest);
  const reason=sourceText(raw?.reason,'撤回依据',500);
  const pauseRevision=sourceText(raw?.pauseRevision,'来源写入暂停版本',64);
  if (raw?.confirmed!==true) throw new BadRequestException('须确认旧版授权及留证范围');
  const rawActions=raw?.remove;
  if (!Array.isArray(rawActions)||!rawActions.length||rawActions.some(action=>!removableActions.includes(action))) throw new BadRequestException('请选择需撤回的 V1 动作');
  const remove=[...new Set<string>(rawActions)].sort();
  await lockEggSourceGrantEditor(m);
  const actor=await requireEggSourceAdministrator(m,user);
  const input={kind:a.kind,code,digest,remove,reason,pauseRevision};
  const replay=await cutoverReplay(m,key,'LEGACY_GRANT',actor,input);
  if (replay) return replay;
  await requireCleanupPause(m,pauseRevision,true);
  const [row]=await m.query(`SELECT $3::text AS kind,s.${a.code} AS code,p.perm_codes,p.deny_codes,p.scope_type,p.scope_value,
    p.${a.key}::text AS subject_id,p.menu_id::text AS menu_id,${legacyMembers(a)}
    FROM ${a.table} p JOIN ${a.subjects} s USING (${a.key}) JOIN sys_menu menu USING (menu_id)
    WHERE menu.menu_code=$1 AND s.${a.code}=$2 FOR UPDATE OF p`,[EGG_SOURCE_MENU,code,a.kind]);
  if (!row) throw new NotFoundException('未找到该 V1 授权');
  const {subject_id,menu_id}=row;
  const before:AuthRow=row;
  if (sourceDigest(before)!==digest) throw new ConflictException('旧版授权已变化，请重新读取');
  const [retained]=await m.query(`SELECT 1 FROM md_egg_source_changes c WHERE c.contract_version=1
    AND c.state IN ('DRAFT','SUBMITTED','REVOKE_REQUESTED') AND (${notArchived}) LIMIT 1`,[]);
  if (retained) throw new ConflictException('请先逐笔处置未终结的旧版申请，再撤回旧版授权');
  const current:string[]=before.perm_codes.split(',').map((action:string)=>action.trim()).filter(Boolean);
  if (current.some(value=>!removableActions.includes(value))||remove.some(value=>!current.includes(value))) {
    throw new ConflictException('授权包含异常动作或已变更，请单独复核');
  }
  if (remove.includes('V')) {
    const retained=await archiveRows(m,null);
    if (retained.some(item=>!item.archived&&archivedStatus(item)==='RETAIN_EVIDENCE'&&
        (before.scope_type!=='WAREHOUSE'||!item.warehouse_code||item.warehouse_code===before.scope_value))) {
      throw new ConflictException('该范围仍有旧版留证单，据此保留查看权限');
    }
  }
  const afterCodes=current.filter(action=>!remove.includes(action)).join(',');
  if (a.kind==='role') await m.query("SELECT set_config('phoenix.egg_source_role_editor','1',true)");
  await m.query(`UPDATE ${a.table} SET perm_codes=$3
    WHERE ${a.key}=$1 AND menu_id=$2`,[subject_id,menu_id,afterCodes]);
  const users=await m.query(`WITH changed AS (UPDATE sys_user SET perms_version=COALESCE(perms_version,0)+1
    WHERE user_id=ANY($1::bigint[]) RETURNING user_id) SELECT user_id FROM changed`,[before.members]);
  return recordCutover(m,key,'LEGACY_GRANT',actor,input,{requestId:key,before,reason,after:{...before,perm_codes:afterCodes},affectedAccounts:users.length});
}
