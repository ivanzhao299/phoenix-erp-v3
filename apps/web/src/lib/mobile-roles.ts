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

interface MobileMenuPermission {
  write: string[];
  read: string[];
}

// ── 角色常量 ──────────────────────────────────────────────────────────────────

export const R = {
  ADMIN:               'ROLE_ADMIN',
  CEO:                 'ROLE_CEO',
  FARM_MGR:            'ROLE_FARM_MGR',
  VET:                 'ROLE_VET',
  QA_MGR:              'ROLE_QA_MGR',
  WMS_MGR:             'ROLE_WMS_MGR',
  PKG_MGR:             'ROLE_PKG_MGR',
  PKG_OP:              'ROLE_PKG_OP',
  LOG_MGR:             'ROLE_LOG_MGR',
  STORE_MGR:           'ROLE_STORE_MGR',
  FIN_CFO:             'ROLE_FIN_CFO',
  FIN_ACCT:            'ROLE_FIN_ACCT',
  FIN_COST:            'ROLE_FIN_COST',
  AUDITOR:             'ROLE_AUDITOR',
  BREEDER:             'ROLE_BREEDER',
  SALES_REP:           'ROLE_SALES_REP',
  SALES_MGR:           'ROLE_SALES_MGR',
  REGION_MGR:          'ROLE_REGION_MGR',
  PRC_BUYER:           'ROLE_PRC_BUYER',
  DRIVER:              'ROLE_DRIVER',
  CASHIER:             'ROLE_CASHIER',
  // Workflow 2.0 新增角色
  GROUP_FINANCE:       'ROLE_GROUP_FINANCE',
  FACTORY_ACCOUNTANT:  'ROLE_FACTORY_ACCOUNTANT',
  PROJECT_MGR:         'ROLE_PROJECT_MGR',
  SHAREHOLDER_VIEW:    'ROLE_SHAREHOLDER_VIEW',
} as const;

// ── 角色码别名（真实 DB 角色码 → 矩阵规范码）──────────────────────────────────
// 背景：sys_role 实际有 54 个角色码，而本矩阵历史上按"理想名"编写，大量真实角色
//   （ROLE_FARMER / ROLE_FIN_AR / ROLE_SHAREHOLDER_FINANCE / ROLE_*_TREASURER …）
//   不在矩阵里 → 这些用户登录手机端零卡片（白屏）。此表把真实码桥接到语义等价的
//   规范码，使权限按职责正确落位。未列入者交由首页空状态兜底（提示联系管理员）。
// ⚠️ 客户类角色（ROLE_CUSTOMER_*）刻意不桥接——他们不应使用员工版手机端。
export const ROLE_ALIASES: Record<string, string> = {
  // —— 养殖/生产现场 ——
  ROLE_FARMER:                          R.BREEDER,
  ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR: R.FARM_MGR,
  ROLE_PILOT_MANAGER:                   R.FARM_MGR,
  // —— 品控 ——
  ROLE_FARM_QC_INSPECTOR:               R.QA_MGR,
  ROLE_QC_INSPECTOR:                    R.QA_MGR,
  ROLE_QA_STAFF:                        R.QA_MGR,
  // —— 包装/产线 ——
  ROLE_LINE_SUPERVISOR:                 R.PKG_MGR,
  ROLE_FACTORY_MGR:                     R.PKG_MGR,
  ROLE_PDA_OP:                          R.PKG_OP,
  // —— 仓储/物流 ——
  ROLE_WH_CLERK:                        R.WMS_MGR,
  ROLE_WMS_OP:                          R.WMS_MGR,
  ROLE_FARM_SHIPPER:                    R.LOG_MGR,
  // —— 经营高层（BU 总经理）——
  ROLE_BU_AGRI_GM:                      R.CEO,
  ROLE_BU_FOOD_GM:                      R.CEO,
  // —— 销售 ——
  ROLE_B2B_MGR:                         R.SALES_MGR,
  // —— 财务（读级，与矩阵 FIN_* 一致：仅看生产数据/审批，不含敏感录入）——
  ROLE_FIN_AR:                          R.FIN_ACCT,
  ROLE_FINANCE_ANALYST:                 R.FIN_ACCT,
  ROLE_FIN_ACCOUNT_MASTER_MGR:          R.FIN_ACCT,
  ROLE_COST_ACCOUNTING_MANAGER:         R.FIN_COST,
  ROLE_FINANCE_REVIEW_MANAGER:          R.FIN_CFO,
  ROLE_HQ_FINANCE:                      R.GROUP_FINANCE,
  // —— 资金/出纳 ——
  ROLE_CASH:                            R.CASHIER,
  ROLE_FARM_CASHIER:                    R.CASHIER,
  ROLE_TREASURY_MANAGER:                R.CASHIER,
  ROLE_MENGSAI_DONGPENG_TREASURER:      R.CASHIER,
  // —— 股东 ——
  ROLE_SHAREHOLDER_FINANCE:             R.SHAREHOLDER_VIEW,
};

/** 把用户角色集展开为"自身 + 别名"，去重；用于多角色门控 */
export function expandRoles(roles: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const r of roles) {
    if (!r) continue;
    out.add(r);
    const alias = ROLE_ALIASES[r];
    if (alias) out.add(alias);
  }
  return [...out];
}

// ── 管理类角色组（可登录手机端，至少可见每日看板） ────────────────────────────

const MGMT = [
  R.ADMIN, R.CEO, R.FARM_MGR, R.VET, R.QA_MGR, R.WMS_MGR,
  R.PKG_MGR, R.PKG_OP, R.LOG_MGR, R.STORE_MGR,
  R.FIN_CFO, R.FIN_ACCT, R.FIN_COST,
  R.AUDITOR, R.BREEDER, R.SALES_REP, R.SALES_MGR,
  R.REGION_MGR, R.PRC_BUYER, R.CASHIER,
  // Workflow 2.0 新增
  R.GROUP_FINANCE, R.FACTORY_ACCOUNTANT, R.PROJECT_MGR, R.SHAREHOLDER_VIEW,
];

// ── 页面权限矩阵 ──────────────────────────────────────────────────────────────

export const PAGE_PERMS: Record<string, PagePermission> = {

  /** 每日看板：所有管理类角色 + 司机均可查看（司机需看当日配送安排） */
  dashboard: {
    write: [],
    read:  [...MGMT, R.DRIVER],
  },

  /** 饲料台账：农场相关角色可录入；仓储/物流/采购/成本会计可查看 */
  feed: {
    write: [R.ADMIN, R.FARM_MGR, R.VET, R.BREEDER],
    read:  [R.CEO, R.WMS_MGR, R.LOG_MGR, R.AUDITOR, R.PRC_BUYER, R.FIN_COST],
  },

  /** 死淘快录：现场/农场/兽医录入；管理层/股东查看（G98：区域督导=销售督导，不在生产线，撤回） */
  mortality: {
    write: [R.ADMIN, R.FARM_MGR, R.VET, R.BREEDER],
    read:  [R.CEO, R.QA_MGR, R.AUDITOR, R.SHAREHOLDER_VIEW],
  },

  /** 产蛋录入：现场/农场/兽医录入；管理层/成本会计/股东查看（产量数据是成本核算基础） */
  egglog: {
    write: [R.ADMIN, R.FARM_MGR, R.VET, R.BREEDER],
    read:  [R.CEO, R.WMS_MGR, R.QA_MGR, R.FIN_CFO, R.FIN_ACCT, R.FIN_COST, R.AUDITOR, R.SHAREHOLDER_VIEW],
  },

  /** G109 鸡舍管理：场长建/改本场鸡舍（农场主数据，受 DataScope 限本场）；其余只读 */
  henhouse: {
    write: [R.ADMIN, R.FARM_MGR],
    read:  [R.CEO, R.VET, R.QA_MGR, R.AUDITOR, R.SHAREHOLDER_VIEW],
  },

  /** 存栏日报：农场录入；管理层/股东查看——按舍按日汇总存栏/产蛋/死淘，股东+高层看每日数据的主视图 */
  henreport: {
    write: [R.ADMIN, R.FARM_MGR],
    read:  [R.CEO, R.VET, R.QA_MGR, R.WMS_MGR, R.BREEDER, R.AUDITOR, R.SHAREHOLDER_VIEW],
  },

  /** 生产趋势：管理层 + 农场 + 财务 + 销售 + 区域督导 + 采购 + 物流（运力规划） + 养殖员（看自身产能） + 包装经理（排班依据） */
  analytics: {
    write: [],
    read:  [R.ADMIN, R.CEO, R.FARM_MGR, R.VET, R.QA_MGR, R.WMS_MGR,
            R.FIN_CFO, R.FIN_ACCT, R.FIN_COST, R.AUDITOR,
            R.SALES_MGR, R.REGION_MGR, R.STORE_MGR, R.PRC_BUYER,
            R.LOG_MGR, R.BREEDER, R.PKG_MGR, R.SHAREHOLDER_VIEW],
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

  /** 鸡蛋台账：仓储/农场录入；销售/财务/区域/店长/物流只读（物流需掌握库存量安排配送波次） */
  egg: {
    write: [R.ADMIN, R.FARM_MGR, R.WMS_MGR],
    read:  [R.CEO, R.VET, R.QA_MGR, R.PKG_MGR,
            R.SALES_MGR, R.SALES_REP, R.REGION_MGR, R.STORE_MGR,
            R.FIN_CFO, R.FIN_ACCT, R.FIN_COST, R.AUDITOR, R.LOG_MGR],
  },

  /** 销售出库：销售/农场录入；物流/财务/区域/店长/收银员/品控只读（品控追溯出货品质） */
  sales: {
    write: [R.ADMIN, R.FARM_MGR, R.SALES_MGR, R.SALES_REP],
    read:  [R.CEO, R.WMS_MGR, R.LOG_MGR, R.REGION_MGR, R.STORE_MGR,
            R.FIN_CFO, R.FIN_ACCT, R.FIN_COST, R.CASHIER, R.AUDITOR, R.QA_MGR],
  },

  /** 药品台账：兽医/农场录入；管理层/品控查看（门店经理与用药无关，移除） */
  medicine: {
    write: [R.ADMIN, R.FARM_MGR, R.VET],
    read:  [R.CEO, R.QA_MGR, R.AUDITOR],
  },

  /** 配送签收：物流经理/司机可操作（装车/发车/到达/签收）；仓储/门店/销售/区域/场长/销售员/品控只读 */
  delivery: {
    write: [R.ADMIN, R.LOG_MGR, R.DRIVER],
    read:  [R.CEO, R.WMS_MGR, R.FARM_MGR, R.STORE_MGR, R.SALES_MGR,
            R.REGION_MGR, R.AUDITOR, R.SALES_REP, R.QA_MGR],
  },

  /** 包装作业台终端：仅包装相关操作角色可访问；财务/物流等不应看到此入口 */
  terminal: {
    write: [R.ADMIN, R.PKG_MGR, R.PKG_OP],
    read:  [R.CEO, R.FARM_MGR, R.QA_MGR],
  },

  /** 采购申请发起：场级业务用户提单；采购员/管理层查看审核 */
  prc_request: {
    write: [R.ADMIN, R.FARM_MGR, R.VET, R.BREEDER, R.WMS_MGR, R.PKG_MGR, R.LOG_MGR, R.STORE_MGR, R.PRC_BUYER],
    read:  [R.CEO, R.REGION_MGR, R.AUDITOR],
  },

  /** G96：采购员「转订单」工作台——把已批申请转成采购订单（采购员核心动作，采购员不用电脑故上手机） */
  prc_order: {
    write: [R.ADMIN, R.PRC_BUYER],
    read:  [R.CEO, R.REGION_MGR, R.AUDITOR],
  },

  /**
   * 移动端审批中心 — Workflow 2.0
   * 入口可见性由此控制，真正审批权限由后端 ApprovalEngine.validateApprover() 决定。
   * 几乎所有管理类角色都可查看（待办为空时也无害），不在此矩阵的角色跳过入口显示。
   */
  workflow: {
    write: [
      R.ADMIN, R.CEO, R.REGION_MGR,
      R.FIN_CFO, R.FIN_ACCT, R.FIN_COST,
      R.GROUP_FINANCE, R.FACTORY_ACCOUNTANT,
      R.PRC_BUYER, R.FARM_MGR,
      R.PROJECT_MGR, R.LOG_MGR, R.STORE_MGR,
    ],
    read: [R.AUDITOR, R.SHAREHOLDER_VIEW, R.VET, R.QA_MGR],
  },

  /** 通知中心 — 所有管理角色均可查看自己的通知 */
  notifications: {
    write: [],
    read:  [...MGMT],
  },

  /** G90 费用报销：各业务角色提报本人费用，财务/管理层审核（页面已实现但首页无入口=孤儿，本次挂入） */
  expenses: {
    write: [R.ADMIN, R.FARM_MGR, R.VET, R.BREEDER, R.WMS_MGR, R.PKG_MGR, R.LOG_MGR, R.STORE_MGR, R.PRC_BUYER, R.PROJECT_MGR, R.FIN_ACCT],
    read:  [R.CEO, R.REGION_MGR, R.FIN_CFO, R.AUDITOR],
  },
};

/**
 * 手机端 pageKey → 后台原子菜单码映射。
 *
 * 运行时如果 JWT 已携带 MENU_* 权限快照，则以这里的原子菜单为准；旧角色矩阵只在
 * 没有权限快照时兜底。这样可避免“角色名命中矩阵但该用户未被授予菜单权限”时仍显示
 * 手机端卡片或进入页面。
 */
export const PAGE_MENU_PERMS: Record<string, MobileMenuPermission> = {
  dashboard: {
    write: [],
    read: [
      'MENU_DASHBOARD',
      'MENU_FARM_DATA',
      'MENU_FARM_DAILY',
      'MENU_FARM_VET',
      'MENU_PKG_OP',
      'MENU_PKG_MGR',
      'MENU_QA_OP',
      'MENU_QA_MGR',
      'MENU_QA_MASTER',
      'MENU_MD_QUALITY',
      'MENU_WMS_VIEW',
      'MENU_WMS_INOUT',
      'MENU_SALES2_INVENTORY',
      'MENU_SALES2_DASHBOARD',
      'MENU_DEVICE_MONITOR',
      'MENU_MOBILE_DELIVERY',
      'MENU_SALES2_DELIVERY',
    ],
  },
  feed: {
    write: ['MENU_FARM_DAILY', 'MENU_FARM_DATA'],
    read: ['MENU_FARM_DAILY', 'MENU_FARM_DATA', 'MENU_PRC2_REQUEST', 'MENU_WMS_VIEW'],
  },
  mortality: {
    write: ['MENU_FARM_DAILY', 'MENU_FARM_DATA', 'MENU_FARM_VET'],
    read: ['MENU_FARM_DAILY', 'MENU_FARM_DATA', 'MENU_FARM_VET', 'MENU_QA_OP', 'MENU_QA_MGR'],
  },
  egglog: {
    write: ['MENU_FARM_DAILY', 'MENU_FARM_DATA'],
    read: ['MENU_FARM_DAILY', 'MENU_FARM_DATA', 'MENU_WMS_VIEW', 'MENU_QA_OP', 'MENU_QA_MGR'],
  },
  henhouse: {
    write: ['MENU_FARM_MASTER', 'MENU_FARM_DATA'],
    read: ['MENU_FARM_MASTER', 'MENU_FARM_DATA'],
  },
  henreport: {
    write: ['MENU_FARM_DAILY', 'MENU_FARM_DATA'],
    read: ['MENU_FARM_DAILY', 'MENU_FARM_DATA', 'MENU_DASHBOARD'],
  },
  analytics: {
    write: [],
    read: ['MENU_DASHBOARD', 'MENU_SALES2_DASHBOARD', 'MENU_FIN2_REPORT'],
  },
  packaging: {
    write: ['MENU_PKG_OP', 'MENU_PKG_MGR'],
    read: ['MENU_PKG_OP', 'MENU_PKG_MGR'],
  },
  quality: {
    write: ['MENU_QA_OP', 'MENU_QA_MGR'],
    read: ['MENU_QA_OP', 'MENU_QA_MGR', 'MENU_QA_MASTER', 'MENU_MD_QUALITY'],
  },
  egg: {
    write: ['MENU_WMS_INOUT'],
    read: ['MENU_WMS_VIEW', 'MENU_WMS_INOUT', 'MENU_SALES2_INVENTORY'],
  },
  sales: {
    write: ['MENU_SALES2_ORDER'],
    read: ['MENU_SALES2_ORDER', 'MENU_SALES2_DASHBOARD', 'MENU_SALES2_INVENTORY'],
  },
  medicine: {
    write: ['MENU_FARM_VET'],
    read: ['MENU_FARM_VET', 'MENU_FARM_DATA'],
  },
  delivery: {
    write: ['MENU_MOBILE_DELIVERY', 'MENU_SALES2_DELIVERY'],
    read: ['MENU_MOBILE_DELIVERY', 'MENU_SALES2_DELIVERY'],
  },
  terminal: {
    write: ['MENU_PKG_OP', 'MENU_PKG_MGR'],
    read: ['MENU_PKG_OP', 'MENU_PKG_MGR'],
  },
  prc_request: {
    write: ['MENU_PRC2_REQUEST'],
    read: ['MENU_PRC2_REQUEST'],
  },
  prc_order: {
    write: ['MENU_PRC2_ORDER'],
    read: ['MENU_PRC2_ORDER'],
  },
  workflow: {
    write: ['MENU_WORKFLOW_TODO'],
    read: ['MENU_WORKFLOW_TODO', 'MENU_WORKFLOW_HISTORY'],
  },
  notifications: {
    write: [],
    read: ['MENU_WORKFLOW_NOTIFY', 'MENU_SETTINGS_NOTIFY'],
  },
  expenses: {
    write: ['MENU_FIN2_EXPENSE', 'MENU_FIN2_REIMBURSE'],
    read: ['MENU_FIN2_EXPENSE', 'MENU_FIN2_REIMBURSE'],
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

/** 检查角色是否可以访问某页面（read 或 write 均算）——单角色（兼容旧调用） */
export function canAccess(pageKey: string, role?: string | null): boolean {
  return getAccessLevel(pageKey, role) !== 'none';
}

/** 检查角色是否可以写入某页面 */
export function canWrite(pageKey: string, role?: string | null): boolean {
  return getAccessLevel(pageKey, role) === 'write';
}

// ── 统一手机端门控（JWT 动态权限 + 多角色矩阵 + 别名）─────────────────────────

function hasPermissionEntry(
  permissions: string[],
  menuCode: string,
  actionCodes?: string[],
): boolean {
  if (permissions.includes('*')) return true;
  const entry = permissions.find(p => p.startsWith(`${menuCode}:`));
  if (!entry) return false;
  if (!actionCodes || actionCodes.length === 0) return true;
  const granted = new Set((entry.split(':')[1] ?? '').split(',').map(s => s.trim()).filter(Boolean));
  return actionCodes.some(code => granted.has(code));
}

function hasAnyMenuPermission(
  permissions: string[],
  menuCodes: string[],
  actionCodes?: string[],
): boolean {
  return menuCodes.some(menu => hasPermissionEntry(permissions, menu, actionCodes));
}

/** JWT permissions → 访问级别。优先 MENU_* 原子菜单，兼容旧 MOBILE_<PAGEKEY> */
export function getMobileAccessFromJWT(
  permissions: string[] | undefined | null,
  pageKey: string,
): AccessLevel {
  if (!permissions || permissions.length === 0) return 'none';
  if (permissions.includes('*')) return 'write';            // 超管通配

  const legacyEntry = permissions.find(p => p.startsWith(`MOBILE_${pageKey.toUpperCase()}:`));
  if (legacyEntry) {
    const codes = legacyEntry.split(':')[1] ?? '';
    return (codes.includes('C') || codes.includes('E') || codes.includes('A')) ? 'write' : 'read';
  }

  const menuPerm = PAGE_MENU_PERMS[pageKey];
  if (!menuPerm) return 'none';
  if (hasAnyMenuPermission(permissions, menuPerm.write, ['C', 'E', 'A'])) return 'write';
  if (hasAnyMenuPermission(permissions, [...menuPerm.read, ...menuPerm.write], ['V', 'C', 'E', 'A', 'X'])) return 'read';
  return 'none';
}

/** 多角色矩阵访问级别：取用户所有角色（含别名展开）中的最高级别 */
export function getAccessLevelMulti(pageKey: string, roles: (string | null | undefined)[]): AccessLevel {
  let best: AccessLevel = 'none';
  for (const r of expandRoles(roles)) {
    const lvl = getAccessLevel(pageKey, r);
    if (lvl === 'write') return 'write';
    if (lvl === 'read') best = 'read';
  }
  return best;
}

export interface MobileSubject {
  role?: string | null;
  roles?: string[] | null;
  permissions?: string[] | null;
}

/**
 * 手机端统一访问级别——单一权威入口（首页卡片 + 页面守卫共用）。
 * 优先级：① JWT 动态权限(MENU_* / MOBILE_*) → ② 多角色硬编码矩阵(含别名)。
 * 同时考虑 roles[] 全集与 role 主角色，杜绝"主角色未覆盖→白屏"。
 */
export function getMobileAccessLevel(pageKey: string, subject: MobileSubject): AccessLevel {
  const jwt = getMobileAccessFromJWT(subject.permissions, pageKey);
  if (jwt !== 'none') return jwt;
  if ((subject.permissions?.length ?? 0) > 0 && PAGE_MENU_PERMS[pageKey]) return 'none';
  const all = [...(subject.roles ?? []), subject.role];
  return getAccessLevelMulti(pageKey, all);
}

/** 手机端是否可访问（read/write 均算）——统一入口 */
export function canAccessMobile(pageKey: string, subject: MobileSubject): boolean {
  return getMobileAccessLevel(pageKey, subject) !== 'none';
}

/** 用户在首页应看到的 page 列表（统一入口，多角色+JWT） */
export function getVisibleMobilePages(subject: MobileSubject): string[] {
  return Object.keys(PAGE_PERMS).filter(page => canAccessMobile(page, subject));
}

/** 某角色在首页应该看到的 card 列表（单角色，兼容旧调用） */
export function getVisiblePages(role?: string | null): string[] {
  if (!role) return [];
  return Object.keys(PAGE_PERMS).filter(page => canAccess(page, role));
}
