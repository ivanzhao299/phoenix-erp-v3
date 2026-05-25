/**
 * Phoenix ERP V3 — 数据脱敏工具
 * RBAC-1 安全加固 2026-05-25
 *
 * 掩码等级：
 *  FULL   — 原值不变（ROLE_ADMIN、ROLE_FIN_CFO）
 *  PARTIAL — 部分脱敏（ROLE_FIN_ACCT）
 *  STRONG  — 完全遮盖（其他角色）
 */

export type MaskLevel = 'FULL' | 'PARTIAL' | 'STRONG';

// 高权限角色可看完整数据
const FULL_ROLES    = new Set(['ROLE_ADMIN', 'ROLE_FIN_CFO']);
// 财务会计可看部分脱敏数据
const PARTIAL_ROLES = new Set(['ROLE_FIN_ACCT']);

/**
 * 根据角色列表决定脱敏强度
 * 取最宽松级别（多角色取最高权限）
 */
export function getMaskLevel(roles: string[]): MaskLevel {
  if (!roles?.length) return 'STRONG';
  let level: MaskLevel = 'STRONG';
  for (const r of roles) {
    if (FULL_ROLES.has(r)) return 'FULL';       // 直接返回最高级
    if (PARTIAL_ROLES.has(r)) level = 'PARTIAL';
  }
  return level;
}

// ── 单字段脱敏函数 ────────────────────────────────────────────────────────────

/**
 * 银行卡号：前6后4，中间全* → "622202******8888"
 */
export function maskBankAccount(val: string): string {
  if (!val || typeof val !== 'string') return val;
  const s = val.replace(/\s/g, '');
  if (s.length < 10) return '****';
  return s.slice(0, 6) + '*'.repeat(s.length - 10) + s.slice(-4);
}

/**
 * 手机号：前3后4，中间4位* → "138****8888"
 */
export function maskPhone(val: string): string {
  if (!val || typeof val !== 'string') return val;
  const s = val.replace(/\s|-/g, '');
  if (s.length < 7) return '****';
  return s.slice(0, 3) + '****' + s.slice(-4);
}

/**
 * 身份证：前4后4，中间全* → "4201**********1234"
 */
export function maskIdCard(val: string): string {
  if (!val || typeof val !== 'string') return val;
  const s = val.replace(/\s/g, '');
  if (s.length < 8) return '****';
  return s.slice(0, 4) + '*'.repeat(s.length - 8) + s.slice(-4);
}

/**
 * 姓名：保留首字，其余替换为* → "赵*"（汉字1个字符=1个*）
 */
export function maskName(val: string): string {
  if (!val || typeof val !== 'string') return val;
  if (val.length <= 1) return val;
  return val.charAt(0) + '*'.repeat(val.length - 1);
}

// ── 强掩码（STRONG 级别）────────────────────────────────────────────────────
function strongMask(val: string): string {
  return '****';
}

// ── 字段类型映射 ──────────────────────────────────────────────────────────────
type MaskFieldType = 'bank_account' | 'phone' | 'id_card' | 'name';

const PARTIAL_FN: Record<MaskFieldType, (v: string) => string> = {
  bank_account: maskBankAccount,
  phone:        maskPhone,
  id_card:      maskIdCard,
  name:         maskName,
};

export interface MaskFieldDef<T> {
  key: keyof T;
  type: MaskFieldType;
}

/**
 * 对对象（或对象数组）的指定字段按 maskLevel 进行脱敏，返回新对象
 */
export function applyMask<T extends Record<string, any>>(
  obj: T,
  fields: MaskFieldDef<T>[],
  maskLevel: MaskLevel,
): T {
  if (maskLevel === 'FULL') return obj;
  const result: Record<string, any> = { ...obj };
  for (const { key, type } of fields) {
    const k = key as string;
    const val = result[k];
    if (val == null || typeof val !== 'string') continue;
    result[k] = maskLevel === 'PARTIAL' ? PARTIAL_FN[type](val) : strongMask(val);
  }
  return result as T;
}

/**
 * 对数组中每条记录进行脱敏
 */
export function applyMaskList<T extends Record<string, any>>(
  list: T[],
  fields: MaskFieldDef<T>[],
  maskLevel: MaskLevel,
): T[] {
  if (maskLevel === 'FULL') return list;
  return list.map((item) => applyMask(item, fields, maskLevel));
}
