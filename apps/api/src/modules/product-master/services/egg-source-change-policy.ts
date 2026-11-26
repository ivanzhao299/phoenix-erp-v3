import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { EntityManager } from 'typeorm';
import type { ChangeScope } from './egg-source-change.service';
import { OrgOwnershipService } from '../../org/services/org-ownership.service';

export const SHELL_TYPES = {
  STANDARD: { productMode: 'STANDARD', varietyCode: null },
  RED: { productMode: 'VARIANT', varietyCode: 'EGG_RED' },
  PINK: { productMode: 'VARIANT', varietyCode: 'EGG_PINK' },
} as const;
export type EggShellClass = keyof typeof SHELL_TYPES;
export type EggSourceOwner = { companyCode: string; farmCode: string; siteCode: string; houseCode: string };

export function commercialShellClass(mode: string, variety: string | null): EggShellClass | null {
  if (mode === 'STANDARD' && variety === null) return 'STANDARD';
  if (mode === 'VARIANT' && variety === 'EGG_RED') return 'RED';
  if (mode === 'VARIANT' && variety === 'EGG_PINK') return 'PINK';
  return null;
}

export function requireShellClass(value: unknown): EggShellClass {
  if (typeof value !== 'string' || !Object.prototype.hasOwnProperty.call(SHELL_TYPES, value)) throw new BadRequestException('请选择普通蛋、红壳蛋或粉壳蛋');
  return value as EggShellClass;
}

export function sourceText(value: unknown, field: string, length = 128): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > length) {
    throw new BadRequestException(`${field} 无效`);
  }
  return value;
}

export function sourceUuid(value: unknown, field: string): string {
  const id = sourceText(value, field, 36);
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) throw new BadRequestException(`${field} 无效`);
  return id.toLowerCase();
}

export function sourceDate(value: unknown): string {
  const date = sourceText(value, '产蛋业务日期', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000') ||
      !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw new BadRequestException('产蛋业务日期无效');
  }
  return date;
}

export function sourceDigest(value: unknown): string {
  function canonical(input: any): any {
    if (Array.isArray(input)) return input.map(canonical);
    if (!input || typeof input !== 'object') return input;
    return Object.fromEntries(Object.keys(input).sort().map(key => [key, canonical(input[key])]));
  }
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function covers(scope: ChangeScope, owner: EggSourceOwner, warehouse?: string): boolean {
  return (!scope.restrictedHouse || scope.restrictedHouse===owner.houseCode)
    && (!scope.restrictedFarm || scope.restrictedFarm === owner.farmCode)
    && (!scope.restrictedCompany || scope.restrictedCompany===owner.companyCode)
    && (!scope.restrictedSite || scope.restrictedSite===owner.siteCode)
    && (!warehouse || !scope.restrictedWarehouse || scope.restrictedWarehouse===warehouse)
    && (scope.isGlobal || (
      (scope.companyCodes?.includes(owner.companyCode) || scope.farmCodes?.includes(owner.farmCode) || scope.siteCodes?.includes(owner.siteCode))
      && (!warehouse || scope.allowedWarehouses?.includes(warehouse))
    )) === true;
}

export function canAccessEggSource(scope: ChangeScope, owner: EggSourceOwner, warehouse?: string): boolean {
  return (scope.viewGrants ?? [scope]).some(grant => covers(grant, owner, warehouse))
    && (!scope.actionGrants || scope.actionGrants.some(grant => covers(grant, owner, warehouse)));
}

export function assertEggSourceScope(scope: ChangeScope, owner: EggSourceOwner, warehouse?: string): void {
  if (!canAccessEggSource(scope, owner, warehouse)) throw new ForbiddenException('鸡舍或目标仓超出当前授权范围');
}

export const sourceWarehouseFilter = "status='ACTIVE' AND domain='OPERATIONAL' AND (site_code=$3 OR NULLIF(site_code,'') IS NULL)";

export async function eggSourceWarehouse(m: EntityManager, owner: EggSourceOwner, warehouse: string): Promise<boolean> {
  const [row] = await m.query(`SELECT 1 FROM wms_warehouses WHERE warehouse_code=$1 AND company_code=$2
    AND ${sourceWarehouseFilter} FOR SHARE`, [warehouse, owner.companyCode, owner.siteCode]);
  return !!row;
}

/** Authoritative ownership. Include inactive houses for evidence reads, not fresh approvals. */
export async function readEggSourceOwner(m: EntityManager, house: string, write = false, lock = write): Promise<EggSourceOwner> {
  const houseCode = sourceText(house, '鸡舍', 64);
  const rows = await m.query(`SELECT h.house_code AS "houseCode", h.farm_code AS "farmCode",
      f.company_code AS "companyCode", ${OrgOwnershipService.FARM_SITE_SQL} AS "siteCode"
    FROM brd_houses h JOIN ${OrgOwnershipService.FARM_TABLE} f ON f.farm_code=h.farm_code
    WHERE h.house_code=$1 ${write ? "AND h.status='ACTIVE' AND f.status='ACTIVE' AND h.house_type='LAYER'" : ''} ${lock ? 'FOR SHARE OF h,f' : ''}`, [houseCode]);
  if (rows.length !== 1 || !rows[0].companyCode || !rows[0].siteCode) throw new ConflictException('鸡舍缺少明确的公司、农场或场站归属');
  return rows[0];
}

export async function lockEggSourceHouse(m: EntityManager, house: string): Promise<void> {
  // Packaging capture/cutover already acquire this common lock before house locks.
  await m.query("SELECT pg_advisory_xact_lock(hashtextextended('packaging-chain:false',0))");
  await m.query("SELECT pg_advisory_xact_lock(hashtext('phoenix:daily-house'),hashtext($1))", [house]);
}

export async function lockEggSourcePolicy(m: EntityManager, owner: EggSourceOwner): Promise<void> {
  await m.query("SELECT pg_advisory_xact_lock(hashtext('phoenix:egg-source-profile'),hashtext($1))",
    [`${owner.companyCode}:${owner.houseCode}`]);
}

// Initial rollout covers the two audited Lao production sites.
export const sourceCalendars: Readonly<Record<string, string>> = {
  'SITE-MENGSAI-LAYER': 'Asia/Vientiane',
  'SITE-DONGPENG-LAYER': 'Asia/Vientiane',
};

export async function sourceClock(m: Pick<EntityManager,'query'>, owner: EggSourceOwner): Promise<{ day: string; instant: string; zone: string }> {
  const zone = sourceCalendars[owner.siteCode];
  if (!zone) throw new ConflictException('场站尚未核准产蛋业务日时区');
  const [clock] = await m.query(`SELECT (t AT TIME ZONE $1)::date::text AS day, t::text AS instant
    FROM (SELECT clock_timestamp() AS t) clock`, [zone]);
  return { ...clock, zone };
}
