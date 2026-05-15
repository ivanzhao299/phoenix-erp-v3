/**
 * 权限合并算法（纯函数，无副作用，便于单测）
 *
 * 输入：raw permission rows from 3 sources（角色直绑 / 角色→权限集 / 用户→权限集）
 * 输出：JWT 携带的 permissions 数组，格式 ["MENU_CODE:V,C,E", ...]
 *
 * 合并规则（按优先级降序执行）：
 *   1. 角色 approval_level 降序：高优先级先决定，低优先级不能撤销已 DENY 的
 *   2. DENY 覆盖 GRANT：任一来源 deny 了，最终结果剔除
 *   3. scope 范围限定：限店/限区/限场 → 暂打 scope 标记，下游接口按 user.storeCode 二次过滤
 *      （为了 JWT 体积，scope 只在合并后保留为额外字段，permissions 主串不带 scope）
 *   4. 通配 '*'：任一来源给 '*' 即拥有该菜单全部 6 个 perm（V/C/E/D/A/X）
 *
 * 业务示例：
 *   role A (priority 100) grants 'V,C,E' on MENU_FIN
 *   role B (priority 50) denies 'E' on MENU_FIN
 *   → 结果 MENU_FIN:V,C （E 被 deny 掉，不管谁先谁后）
 */

export type PermCode = 'V' | 'C' | 'E' | 'D' | 'A' | 'X';
export const ALL_PERM_CODES: PermCode[] = ['V', 'C', 'E', 'D', 'A', 'X'];

/** 一条权限来源记录（无论从角色直绑还是权限集来） */
export interface PermSource {
  menu_code: string;
  perm_codes: string | null;  // 'V,C,E' / '*' / null
  deny_codes: string | null;  // 'E' / '*' / null
  scope_type: string | null;  // 'STORE' | 'REGION' | 'FARM' | null
  scope_value: string | null; // 例 'S001' / null
  approval_level: number;     // 角色优先级；权限集合无角色时填 0
  source: 'role' | 'role_set' | 'user_set'; // 仅审计用
}

/** 解析 perm_codes 字符串到 Set<PermCode>；支持通配 '*' */
function parseCodes(codes: string | null | undefined): Set<PermCode> {
  if (!codes) return new Set();
  const s = codes.trim();
  if (!s) return new Set();
  if (s === '*') return new Set(ALL_PERM_CODES);
  const out = new Set<PermCode>();
  for (const part of s.split(',')) {
    const p = part.trim().toUpperCase();
    if ((ALL_PERM_CODES as string[]).includes(p)) out.add(p as PermCode);
  }
  return out;
}

/** 序列化 Set<PermCode> 回 'V,C,E' 字符串（按 ALL_PERM_CODES 顺序） */
function formatCodes(set: Set<PermCode>): string {
  return ALL_PERM_CODES.filter((c) => set.has(c)).join(',');
}

/**
 * 合并 N 条权限来源，返回 JWT 用的 permissions 数组
 * 注意：仅返回 grants - denies 的最终结果；scope 不进 JWT 主串（下游业务接口自己再过滤）
 */
export function resolvePermissions(sources: PermSource[]): string[] {
  // 按菜单分组
  const byMenu: Record<string, PermSource[]> = {};
  for (const s of sources) {
    if (!byMenu[s.menu_code]) byMenu[s.menu_code] = [];
    byMenu[s.menu_code].push(s);
  }

  const out: string[] = [];
  for (const menuCode of Object.keys(byMenu)) {
    const rows = byMenu[menuCode];
    // 按 approval_level 降序排序（高优先级先处理；同优先级保持稳定）
    rows.sort((a, b) => b.approval_level - a.approval_level);

    // 收集 grants 与 denies；deny 一旦命中即剔除（无论之后是否再次 grant）
    const grants = new Set<PermCode>();
    const denies = new Set<PermCode>();
    for (const r of rows) {
      // deny 先合并：deny 在合并完成后统一从 grants 中剔除
      for (const c of parseCodes(r.deny_codes)) denies.add(c);
      // grants 累加（同菜单多条 grants 取并集）
      for (const c of parseCodes(r.perm_codes)) grants.add(c);
    }
    // 最终：grants - denies
    for (const c of denies) grants.delete(c);

    if (grants.size === 0) continue;
    out.push(`${menuCode}:${formatCodes(grants)}`);
  }

  return out;
}

/** 单独导出测试用 */
export const __testing__ = { parseCodes, formatCodes };
