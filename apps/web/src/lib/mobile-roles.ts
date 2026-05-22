/**
 * mobile-roles.ts — 手机端页面权限矩阵
 *
 * 每个页面定义两组角色：
 *   write : 可查看且可提交/录入数据
 *   read  : 仅可查看（只读模式）
 *
 * 未出现在任一列表中的角色将被拦截（403）。
 */

export type AccessLevel = 'write' | 'read' | 'none';

export interface PagePermission {
  write: string[];
  read:  string[];
}

// ── 角色常量 ──────────────────────────────────────────────────────────────────

export const R = {
  ADMIN:      'ROLE_ADMIN',
  CEO:        'ROLE_CEO',
  FARM_MGR:   'ROLE_FARM_MGR',
  VET:        'ROLE_VET',
  QA_MGR:     'ROLE_QA_MGR',
  WMS_MGR:    'ROLE_WMS_MGR',
  PKG_MGR:    'ROLE_PKG_MGR',
  LOG_MGR:    'ROLE_LOG_MGR',
  STORE_MGR:  'ROLE_STORE_MGR',
  FIN_CFO:    'ROLE_FIN_CFO',
  FIN_ACCT:   'ROLE_FIN_ACCT',
  AUDITOR:    'ROLE_AUDITOR',
  BREEDER:    'ROLE_BREEDER',
  SALES_REP:  'ROLE_SALES_REP',
  SALES_MGR:  'ROLE_SALES_MGR',
} as const;

// ── 管理类角色组（可登录手机端） ──────────────────────────────────────────────

const MGMT = [R.ADMIN, R.CEO, R.FARM_MGR, R.VET, R.QA_MGR, R.WMS_MGR,
              R.PKG_MGR, R.LOG_MGR, R.STORE_MGR, R.FIN_CFO, R.FIN_ACCT,
              R.AUDITOR, R.BREEDER, R.SALES_REP, R.SALES_MGR];

// ── 页面权限矩阵 ──────────────────────────────────────────────────────────────

export const PAGE_PERMS: Record<string, PagePermission> = {

  /** 每日看板：所有管理类角色均可查看 */
  dashboard: {
    write: [],
    read:  MGMT,
  },

  /** 饲料台账：农场相关角色可录入；仓储/管理可查看 */
  feed: {
    write: [R.ADMIN, R.FARM_MGR, R.VET, R.BREEDER],
    read:  [R.CEO, R.WMS_MGR, R.LOG_MGR, R.AUDITOR],
  },

  /** 死淘快录：现场/农场/兽医录入；管理层查看 */
  mortality: {
    write: [R.ADMIN, R.FARM_MGR, R.VET, R.BREEDER],
    read:  [R.CEO, R.QA_MGR, R.AUDITOR],
  },

  /** 产蛋录入：现场/农场/兽医录入；管理层查看 */
  egglog: {
    write: [R.ADMIN, R.FARM_MGR, R.VET, R.BREEDER],
    read:  [R.CEO, R.WMS_MGR, R.QA_MGR, R.FIN_CFO, R.FIN_ACCT, R.AUDITOR],
  },

  /** 存栏日报：农场/兽医/品控/管理层查看 */
  henreport: {
    write: [R.ADMIN, R.FARM_MGR],
    read:  [R.CEO, R.VET, R.QA_MGR, R.WMS_MGR, R.BREEDER, R.AUDITOR],
  },

  /** 生产趋势：管理层 + 农场 + 财务查看 */
  analytics: {
    write: [],
    read:  [R.ADMIN, R.CEO, R.FARM_MGR, R.VET, R.QA_MGR, R.WMS_MGR,
            R.FIN_CFO, R.FIN_ACCT, R.AUDITOR],
  },

  /** 包装统计：包装/品控/管理层 */
  packaging: {
    write: [R.ADMIN, R.FARM_MGR, R.PKG_MGR],
    read:  [R.CEO, R.QA_MGR, R.WMS_MGR, R.LOG_MGR, R.FIN_CFO, R.AUDITOR],
  },

  /** 品质检测：品控/农场/管理层 */
  quality: {
    write: [R.ADMIN, R.FARM_MGR, R.QA_MGR, R.VET],
    read:  [R.CEO, R.PKG_MGR, R.AUDITOR],
  },

  /** 鸡蛋台账：仓储/农场/销售/财务 */
  egg: {
    write: [R.ADMIN, R.FARM_MGR, R.WMS_MGR],
    read:  [R.CEO, R.VET, R.QA_MGR, R.PKG_MGR, R.SALES_MGR, R.SALES_REP,
            R.FIN_CFO, R.FIN_ACCT, R.AUDITOR],
  },

  /** 销售出库：销售/农场/管理层 */
  sales: {
    write: [R.ADMIN, R.FARM_MGR, R.SALES_MGR, R.SALES_REP],
    read:  [R.CEO, R.WMS_MGR, R.LOG_MGR, R.FIN_CFO, R.FIN_ACCT, R.AUDITOR],
  },

  /** 药品台账：兽医/农场录入；管理层/品控查看 */
  medicine: {
    write: [R.ADMIN, R.FARM_MGR, R.VET],
    read:  [R.CEO, R.QA_MGR, R.STORE_MGR, R.AUDITOR],
  },

  /** 配送签收：物流经理录入；仓储/门店/销售/管理层查看 */
  delivery: {
    write: [R.ADMIN, R.LOG_MGR],
    read:  [R.CEO, R.WMS_MGR, R.STORE_MGR, R.SALES_MGR, R.AUDITOR],
  },
};

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

/** 检查角色对某页面的访问级别 */
export function getAccessLevel(pageKey: string, role?: string | null): AccessLevel {
  if (!role) return 'none';
  const perm = PAGE_PERMS[pageKey];
  if (!perm) return 'none';
  if (perm.write.includes(role)) return 'write';
  if (perm.read.includes(role))  return 'read';
  return 'none';
}

/** 检查角色是否可以访问某页面（read 或 write 均算） */
export function canAccess(pageKey: string, role?: string | null): boolean {
  return getAccessLevel(pageKey, role) !== 'none';
}

/** 检查角色是否可以写入某页面 */
export function canWrite(pageKey: string, role?: string | null): boolean {
  return getAccessLevel(pageKey, role) === 'write';
}

/** 某角色在首页应该看到的 card 列表 */
export function getVisiblePages(role?: string | null): string[] {
  if (!role) return [];
  return Object.keys(PAGE_PERMS).filter(page => canAccess(page, role));
}
