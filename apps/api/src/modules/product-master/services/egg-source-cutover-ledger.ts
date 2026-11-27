import { BadRequestException,ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { sourceDigest,sourceUuid } from './egg-source-change-policy';

type Kind='ARCHIVE'|'UNARCHIVE'|'LEGACY_GRANT'|'VERIFY'|'SIGN'|'RETIRE';
export type CutoverRecord<T>={request_id:string;actor_id:string;input_sha256:string;receipt:T;created_at:string};

export function digestInput(value:unknown):string {
  if (typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value)) throw new BadRequestException('核对摘要无效');
  return value;
}

export function cutoverKey(value:unknown) {
  return sourceUuid(value,'操作请求号');
}

export async function cutoverReplay<T>(m:EntityManager,key:string,kind:Kind,actor:string,input:unknown):Promise<T|undefined> {
  await m.query("SELECT pg_advisory_xact_lock(hashtext('phoenix:egg-source-cutover-request'),hashtext($1))",[key]);
  const [existing]=await m.query('SELECT kind,actor_id,input_sha256,receipt FROM md_egg_source_cutover_records WHERE request_id=$1',[key]);
  if (!existing) return undefined;
  if (existing.kind!==kind||existing.actor_id!==actor||existing.input_sha256!==sourceDigest(input)) {
    throw new ConflictException('该请求号已用于其他操作');
  }
  return existing.receipt as T;
}

export async function recordCutover<T extends object>(m:EntityManager,key:string,kind:Kind,actor:string,input:unknown,receipt:T,parent?:string) {
  await m.query("SELECT set_config('phoenix.egg_source_cutover_writer','1',true)");
  await m.query(`INSERT INTO md_egg_source_cutover_records(request_id,kind,actor_id,parent_id,input_sha256,receipt)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,[key,kind,actor,parent??null,sourceDigest(input),JSON.stringify(receipt)]);
  return receipt;
}

// Apply to lists only. Receipts, detailed evidence and runtime source checks still use the original row.
export const notArchived="NOT COALESCE((SELECT a.archived FROM md_egg_source_archive_marks a WHERE a.change_id=c.id ORDER BY a.seq DESC LIMIT 1),false)";
