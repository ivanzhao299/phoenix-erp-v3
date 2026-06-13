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

  /** 死淘快录：现场/农场/兽医录入；管理层/区域督导/股东查看（G97：股东+高层看每日数据） */
  mortality: {
    write: [R.ADMIN, R.FARM_MGR, R.VET, R.BREEDER],
    read:  [R.CEO, R.QA_MGR, R.AUDITOR, R.REGION_MGR, R.SHAREHOLDER_VIEW],
  },

  /** 产蛋录入：现场/农场/兽医录入；管理层/成本会计/区域督导/股东查看（产量数据是成本核算基础） */
  egglog: {
    write: [R.ADMIN, R.FARM_MGR, R.VET, R.BREEDER],
    read:  [R.CEO, R.WMS_MGR, R.QA_MGR, R.FIN_CFO, R.FIN_ACCT, R.FIN_COST, R.AUDITOR, R.REGION_MGR, R.SHAREHOLDER_VIEW],
  },

  /** 存栏日报：农场录入；管理层/区域督导/股东查看——按舍按日汇总存栏/产蛋/死淘，股东+高层看每日数据的主视图（G97） */
  henreport: {
    write: [R.ADMIN, R.FARM_MGR],
    read:  [R.CEO, R.VET, R.QA_MGR, R.WMS_MGR, R.BREEDER, R.AUDITOR, R.REGION_MGR, R.SHAREHOLDER_VIEW],
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
