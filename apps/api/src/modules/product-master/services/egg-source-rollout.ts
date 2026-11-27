import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  lockEggSourceGrantEditor, requireEggSourceAdministrator, type EggSourceGrantActor,
} from '../../../auth/egg-source-organization-grants';
import { OrgOwnershipService } from '../../org/services/org-ownership.service';
import type { EggSourceAccessService } from './egg-source-access.service';
import { lockEggSourceHouse, readEggSourceOwner, sourceDigest, sourceText, type EggSourceOwner } from './egg-source-change-policy';
import { houseCreationFacts, sourceCreationPrerequisite } from './egg-source-change-read';
import { cutoverKey, cutoverReplay, digestInput, lockCutoverRequest, recordCutover, sourceOperationKind } from './egg-source-cutover-ledger';

export type RolloutCommand = {
  requestId: unknown;
  expectedEnabled: boolean | null;
  expectedRevision: string | null;
  companyCode: string;
  enabled: boolean;
  reason: string;
  maker?: string;
  reviewer?: string;
  readinessDigest?: unknown;
  cancel?: boolean;
};

const requiredActions = { maker: ['V', 'C', 'E'], reviewer: ['V', 'A'] } as const;

export async function readHouseRollout(m: EntityManager, owner: EggSourceOwner, lock = false) {
  const [row] = await m.query(`SELECT company_code,house_code,enabled,changed_by::text,changed_at,
    changed_at::text AS revision,change_reason FROM md_egg_source_house_rollouts
    WHERE company_code=$1 AND house_code=$2 ${lock ? 'FOR UPDATE' : ''}`, [owner.companyCode, owner.houseCode]);
  return row ?? null;
}

export async function houseRolloutReadiness(
  m: EntityManager, access: EggSourceAccessService, owner: EggSourceOwner,
  accounts: { maker: string; reviewer: string }, current: Awaited<ReturnType<typeof readHouseRollout>>, lock = false,
) {
  const [gate] = await m.query(`SELECT writes_enabled,house_writes_enabled,changed_at::text AS revision,
    house_changed_at::text AS house_revision FROM md_egg_source_write_control WHERE id=1 ${lock ? 'FOR SHARE' : ''}`);
  const facts = await houseCreationFacts(m, owner);
  const prerequisite = await sourceCreationPrerequisite(m, owner, facts.businessDay);
  const inspect = async (side: keyof typeof accounts) => {
    const account = await access.inspectHouseAccount(m, owner, accounts[side], false, lock);
    const required = requiredActions[side];
    const missing = required.filter(action => !account.actions.includes(action));
    return { ...account, username: accounts[side], required, missing };
  };
  const [maker, reviewer] = await Promise.all([inspect('maker'), inspect('reviewer')]);
  const sameAccount = !!maker.accountId && maker.accountId === reviewer.accountId;
  const blockers: string[] = [];
  if (current?.enabled) blockers.push('ROLLOUT_CHANGED');
  if (!gate?.writes_enabled || !gate.house_writes_enabled) blockers.push('WRITES_PAUSED');
  if (facts.house.houseType !== 'LAYER') blockers.push('NON_LAYER');
  if (facts.house.houseStatus !== 'ACTIVE' || facts.house.farmStatus !== 'ACTIVE') blockers.push('INACTIVE_HOUSE');
  if (prerequisite) blockers.push(prerequisite);
  if (sameAccount) blockers.push('ROLLOUT_SAME_ACCOUNT');
  else if (!maker.accountId || !reviewer.accountId || maker.missing.length || reviewer.missing.length) blockers.push('HOUSE_ROLES_NOT_READY');

  const accountSnapshot = (account: typeof maker | typeof reviewer) => ({
    id: account.accountId, version: account.permissionsVersion, actions: account.actions,
    origins: account.origins.map(origin => sourceDigest(origin)).sort(),
  });
  const response = (account: typeof maker | typeof reviewer) => ({
    username: account.username, eligibleAccount: !!account.accountId, actions: account.actions,
    required: account.required, missing: account.missing, origins: account.origins,
    diagnostics: account.diagnostics, denials: account.denials ?? [],
  });
  const digest = sourceDigest({
    owner, gate: gate ?? null, facts, revision: current?.revision ?? null,
    maker: accountSnapshot(maker), reviewer: accountSnapshot(reviewer), blockers,
  });
  return {
    owner, current, businessDay: facts.businessDay, ready: !blockers.length, blockers, digest,
    maker: response(maker), reviewer: response(reviewer),
    verifiedAccounts: { maker: maker.accountId, reviewer: reviewer.accountId },
  };
}

export async function applyHouseRollout(
  m: EntityManager, access: EggSourceAccessService, user: EggSourceGrantActor & { username?: string },
  house: string, raw: RolloutCommand,
) {
  const requestId = cutoverKey(raw?.requestId);
  const houseCode = sourceText(house, '鸡舍', 64);
  const companyCode = sourceText(raw.companyCode, '确认公司', 64);
  const reason = sourceText(raw.reason, '鸡舍切换依据', 500);
  const { enabled, expectedEnabled, expectedRevision } = raw;
  if (typeof enabled !== 'boolean' || (expectedEnabled !== null && typeof expectedEnabled !== 'boolean') ||
      expectedEnabled === enabled || (expectedEnabled === null ? expectedRevision !== null : typeof expectedRevision !== 'string' || !expectedRevision)) {
    throw new BadRequestException('须提供当前状态、登记版本和目标状态');
  }
  const accounts = enabled ? {
    maker: sourceText(raw.maker, '申请账号', 64), reviewer: sourceText(raw.reviewer, '审核账号', 64),
  } : null;
  const readinessDigest = enabled ? digestInput(raw.readinessDigest) : null;
  const input = { houseCode, companyCode, reason, enabled, expectedEnabled, expectedRevision, accounts, readinessDigest };

  await lockEggSourceGrantEditor(m);
  const actor = await requireEggSourceAdministrator(m, user);
  await lockEggSourceHouse(m, houseCode);
  type Receipt = { requestId: string; status: 'RECORDED' | 'CANCELLED'; rollout: Awaited<ReturnType<typeof readHouseRollout>> };
  const prior = await cutoverReplay<Receipt>(m, requestId, 'HOUSE_ROLLOUT', actor, input);
  if (prior) return prior;
  if (raw.cancel === true) {
    return recordCutover<Receipt>(m, requestId, 'HOUSE_ROLLOUT', actor, input, {
      requestId, status: 'CANCELLED', rollout: null,
    });
  }

  if (enabled) {
    await m.query("SET LOCAL lock_timeout='5s'");
    await m.query(`LOCK TABLE ${OrgOwnershipService.FARM_TABLE},sys_organizations IN SHARE MODE`);
  }
  const owner = await readEggSourceOwner(m, houseCode, enabled, true, !enabled);
  if (owner.companyCode !== companyCode) {
    throw new ConflictException({ code: 'ROLLOUT_CHANGED', message: '鸡舍所属公司已变化，请重新选择' });
  }
  const before = await readHouseRollout(m, owner, true);
  if ((before?.enabled ?? null) !== expectedEnabled || (before?.revision ?? null) !== expectedRevision) {
    throw new ConflictException({ code: 'ROLLOUT_CHANGED', message: '鸡舍开放状态已变化，请刷新' });
  }
  const readiness = accounts ? await houseRolloutReadiness(m, access, owner, accounts, before, true) : null;
  if (readiness && (!readiness.ready || readiness.digest !== readinessDigest)) {
    throw new ConflictException({
      code: readiness.blockers[0] ?? 'ROLLOUT_READINESS_CHANGED', message: '开放条件已变化，请重新核对本舍的实名岗位与写入状态',
    });
  }
  await m.query("SELECT set_config('phoenix.egg_source_rollout_editor','1',true)");
  await m.query(`INSERT INTO md_egg_source_house_rollouts(company_code,house_code,enabled,changed_by,change_reason)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(company_code,house_code) DO UPDATE SET enabled=EXCLUDED.enabled,
      changed_by=EXCLUDED.changed_by,change_reason=EXCLUDED.change_reason,changed_at=clock_timestamp()`,
  [owner.companyCode, owner.houseCode, enabled, actor, reason]);
  const rollout = await readHouseRollout(m, owner);
  await m.query(`INSERT INTO sys_audit_log(user_id,user_name,action,entity_type,entity_id,before_value,after_value)
    VALUES ($1,$2,'EGG_SOURCE_HOUSE_ROLLOUT','EGG_SOURCE_HOUSE',$3,$4::jsonb,$5::jsonb)`,
  [actor, user.username?.slice(0, 64) ?? actor, houseCode, JSON.stringify(before),
    JSON.stringify({ ...rollout, requestId, verifiedAccounts: readiness?.verifiedAccounts })]);
  return recordCutover<Receipt>(m, requestId, 'HOUSE_ROLLOUT', actor, input, { requestId, status: 'RECORDED', rollout });
}

export async function readSourceOperationReceipt(m: EntityManager, user: EggSourceGrantActor, idRaw: unknown) {
  const actor = await requireEggSourceAdministrator(m, user, false);
  const [row] = await m.query(`SELECT kind,receipt,created_at FROM md_egg_source_cutover_records
    WHERE request_id=$1 AND actor_id=$2 AND kind IN ('HOUSE_ROLLOUT','RETIRE_PILOT','RETIRE','OPERATION_CANCELLED')`, [cutoverKey(idRaw), actor]);
  if (!row) throw new NotFoundException('未找到本账号的操作回执');
  return row;
}

export async function cancelSourceOperation(m:EntityManager,user:EggSourceGrantActor,idRaw:unknown,operation:unknown) {
  if (operation!=='rollout'&&operation!=='retire') throw new BadRequestException('操作类型无效');
  const requestId=cutoverKey(idRaw);
  await lockEggSourceGrantEditor(m);
  const actor=await requireEggSourceAdministrator(m,user);
  await lockCutoverRequest(m,requestId);
  const [existing]=await m.query('SELECT kind,actor_id,receipt FROM md_egg_source_cutover_records WHERE request_id=$1',[requestId]);
  if (existing) {
    const existingOperation=existing.kind==='OPERATION_CANCELLED' ? existing.receipt.operation : sourceOperationKind(existing.kind);
    if (existing.actor_id!==actor||existingOperation!==operation) throw new ConflictException('该请求号已用于其他操作');
    return existing.receipt;
  }
  return recordCutover(m,requestId,'OPERATION_CANCELLED',actor,{operation},{
    requestId,operation,status:'CANCELLED',rollout:null,
  });
}
