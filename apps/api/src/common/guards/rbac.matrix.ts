/**
 * Phoenix ERP V3 — 角色菜单权限矩阵
 * 格式: { [MENU_CODE]: { [ROLE_CODE]: perm[] } }
 * perm: V=查看  C=新增  E=编辑  D=删除  A=审批  X=导出
 */
export const ROLE_MENU_MATRIX: Record<string, Record<string, string[]>> = {

  // ── 养殖生产 ──────────────────────────────────────────────────────────────
  MENU_BREEDING: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_FARM_MGR:    ['V','C','E','D','A','X'],
    ROLE_FARMER:      ['V','C','E'],
    ROLE_VET:         ['V','C','E'],
    ROLE_CEO:         ['V','X'],
    ROLE_REGION_MGR:  ['V','X'],
  },
  MENU_FARM_DATA: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_FARM_MGR:    ['V','C','E','D','A','X'],
    ROLE_FARMER:      ['V','C','E'],
    ROLE_VET:         ['V'],
    ROLE_CEO:         ['V','X'],
    ROLE_REGION_MGR:  ['V','X'],
  },
  MENU_IOT: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_FARM_MGR:    ['V','E','X'],
    ROLE_FARMER:     ['V'],
    ROLE_CEO:         ['V'],
    ROLE_REGION_MGR:  ['V'],
    ROLE_SYSOPS:      ['V','C','E','D'],
  },

  // ── 仓储物流 ─────────────────────────────────────────────────────────────
  MENU_INVENTORY: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_WMS_MGR:     ['V','C','E','D','A','X'],
    ROLE_FARM_MGR:    ['V','C','X'],
    ROLE_FIN_ACCT:    ['V','X'],
    ROLE_CEO:         ['V','X'],
    ROLE_REGION_MGR:  ['V','X'],
  },
  MENU_WMS: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_WMS_MGR:     ['V','C','E','D','A','X'],
    ROLE_FARM_MGR:    ['V','C'],
    ROLE_REGION_MGR:  ['V','X'],
  },
  MENU_PDA: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_WMS_MGR:     ['V','C','E','D'],
    ROLE_FARM_MGR:    ['V','C'],
    ROLE_FARMER:     ['V','C'],
    ROLE_CASHIER:     ['V'],
  },

  // ── 采购 V1 ───────────────────────────────────────────────────────────────
  MENU_PROCUREMENT: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_PRC_BUYER:   ['V','C','E','D','X'],
    ROLE_FARM_MGR:    ['V','C'],
    ROLE_FIN_ACCT:    ['V','X'],
    ROLE_FIN_CFO:     ['V','A','X'],
    ROLE_CEO:         ['V','A','X'],
  },

  // ── 采购 V2 ───────────────────────────────────────────────────────────────
  /** 采购V2 主模块（订单/付款/物流/收货） */
  MENU_PRC2: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_PRC_BUYER:   ['V','C','E','D','X'],
    ROLE_FARM_MGR:    ['V','C'],
    ROLE_FIN_ACCT:    ['V','X'],
    ROLE_FIN_CFO:     ['V','A','X'],
    ROLE_CEO:         ['V','A','X'],
    ROLE_REGION_MGR:  ['V'],
    ROLE_LOG_MGR:     ['V','E'],
  },
  /** 采购V2 主数据（供应商/项目） */
  MENU_PRC2_MASTER: {
    ROLE_ADMIN:          ['V','C','E','D','A','X'],
    ROLE_PRC_BUYER:      ['V','C','E','X'],
    ROLE_FARM_MGR:       ['V'],
    ROLE_FIN_CFO:        ['V'],
    ROLE_CEO:            ['V'],
    ROLE_REGION_MGR:     ['V'],
    ROLE_PROJECT_MGR:    ['V','C','E'], // RBAC-2.5：requests/suppliers 走此 MENU
    ROLE_FACTORY_ACCT:   ['V'],         // RBAC-2.5
  },
  /** 采购V2 付款（敏感） */
  MENU_PRC2_PAYMENT: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_FIN_CFO:     ['V','C','E','A','X'],
    ROLE_FIN_ACCT:    ['V','C','E','X'],
    ROLE_PRC_BUYER:   ['V'],
    ROLE_CEO:         ['V','A','X'],
  },
  /** 采购V2 股东资金（高度敏感） */
  MENU_PRC2_FUND: {
    ROLE_ADMIN:            ['V','C','E','D','A','X'],
    ROLE_FIN_CFO:          ['V','C','E','A','X'],
    ROLE_CEO:              ['V','A','X'],
    ROLE_SHAREHOLDER_VIEW: ['V'],   // RBAC-2.5：只读自己名下股东资金
  },
  /** 采购V2 订单管理（PO） */
  MENU_PRC2_ORDER: {
    ROLE_ADMIN:          ['V','C','E','D','A','X'],
    ROLE_PRC_BUYER:      ['V','C','E','D','X'],
    ROLE_FARM_MGR:       ['V','C'],
    ROLE_FIN_ACCT:       ['V','X'],
    ROLE_FIN_CFO:        ['V','A','X'],
    ROLE_CEO:            ['V','A','X'],
    ROLE_REGION_MGR:     ['V'],
    ROLE_PROJECT_MGR:    ['V','C','E'],   // RBAC-2.5：项目经理（PROJECT scope）
    ROLE_FACTORY_ACCT:   ['V'],           // RBAC-2.5：工厂会计（COMPANY scope，只读）
  },
  /** 采购V2 历史初始化（仅超管） */
  MENU_PRC2_INIT: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
  },
  /** 采购V2 看板 & 报表 */
  MENU_PRC2_DASHBOARD: {
    ROLE_ADMIN:          ['V','X'],
    ROLE_PRC_BUYER:      ['V','X'],
    ROLE_FARM_MGR:       ['V'],
    ROLE_FIN_ACCT:       ['V','X'],
    ROLE_FIN_CFO:        ['V','X'],
    ROLE_CEO:            ['V','X'],
    ROLE_REGION_MGR:     ['V'],
    ROLE_PROJECT_MGR:    ['V'],         // RBAC-2.5
    ROLE_FACTORY_ACCT:   ['V'],         // RBAC-2.5
  },
  /** 采购V2 物流运单 */
  MENU_PRC2_SHIPMENT: {
    ROLE_ADMIN:          ['V','C','E','D','A','X'],
    ROLE_PRC_BUYER:      ['V','C','E','X'],
    ROLE_LOG_MGR:        ['V','C','E','X'],
    ROLE_FARM_MGR:       ['V'],
    ROLE_FIN_ACCT:       ['V','X'],
    ROLE_FIN_CFO:        ['V','X'],
    ROLE_CEO:            ['V','X'],
    ROLE_REGION_MGR:     ['V'],
    ROLE_PROJECT_MGR:    ['V','C','E'], // RBAC-2.5
    ROLE_FACTORY_ACCT:   ['V'],         // RBAC-2.5
  },
  /** 采购V2 收货入库 */
  MENU_PRC2_RECEIPT: {
    ROLE_ADMIN:          ['V','C','E','D','A','X'],
    ROLE_PRC_BUYER:      ['V','C','E','X'],
    ROLE_LOG_MGR:        ['V','C','E','X'],
    ROLE_FARM_MGR:       ['V','C','E'],
    ROLE_FIN_ACCT:       ['V','X'],
    ROLE_FIN_CFO:        ['V','X'],
    ROLE_CEO:            ['V','X'],
    ROLE_REGION_MGR:     ['V'],
    ROLE_PROJECT_MGR:    ['V','C','E'], // RBAC-2.5
    ROLE_FACTORY_ACCT:   ['V'],         // RBAC-2.5
  },

  // ── 财务 ──────────────────────────────────────────────────────────────────
  MENU_FINANCE: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_FIN_CFO:     ['V','C','E','A','X'],
    ROLE_FIN_ACCT:    ['V','C','E','X'],
    ROLE_FIN_AR:      ['V','C','X'],
    ROLE_CEO:         ['V','A','X'],
    ROLE_REGION_MGR:  ['V','X'],
    ROLE_AUDITOR:     ['V','X'],
    ROLE_FARM_MGR:    ['C'],              // RBAC-3.1：费用报销提交
    ROLE_STORE_MGR:   ['V','C'],          // RBAC-3.1：移动端账户查看+现金流录入
    ROLE_CASHIER:     ['V','C'],          // RBAC-3.1：移动端收入登记
  },
  MENU_FIN_CLOSE: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_FIN_CFO:     ['V','A','X'],
    ROLE_FIN_ACCT:    ['V','C','X'],
    ROLE_STORE_MGR:   ['V','C'],
    ROLE_CASHIER:     ['V','C'],
    ROLE_REGION_MGR:  ['V','X'],
  },

  // ── 门店 ──────────────────────────────────────────────────────────────────
  MENU_STORE: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_STORE_MGR:   ['V','C','E','D','X'],
    ROLE_CASHIER:     ['V','C'],
    ROLE_REGION_MGR:  ['V','X'],
    ROLE_FIN_ACCT:    ['V','X'],
  },
  MENU_POS: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_STORE_MGR:   ['V','C','E','D','X'],
    ROLE_CASHIER:     ['V','C','E'],
    ROLE_REGION_MGR:  ['V','X'],
  },

  // ── 终端 ──────────────────────────────────────────────────────────────────
  MENU_PACKAGING: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_FARM_MGR:    ['V','C','E','X'],
    ROLE_FARMER:     ['V','C','E'],
    ROLE_WMS_MGR:     ['V','C'],
  },

  // ── BI 分析 ───────────────────────────────────────────────────────────────
  MENU_ANALYTICS: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_CEO:         ['V','X'],
    ROLE_FIN_CFO:     ['V','X'],
    ROLE_REGION_MGR:  ['V','X'],
    ROLE_FARM_MGR:    ['V'],
    ROLE_AUDITOR:     ['V','X'],
  },

  // ── 系统管理 ──────────────────────────────────────────────────────────────
  MENU_SYSTEM: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_SYSOPS:      ['V','C','E','D'],
    ROLE_HR_ADMIN:    ['V','C','E'],
  },
  MENU_USERS: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_SYSOPS:      ['V','C','E'],
    ROLE_HR_ADMIN:    ['V','C','E','D'],
  },

  // ── 审批 ──────────────────────────────────────────────────────────────────
  MENU_APPROVAL: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_CEO:         ['V','A'],
    ROLE_REGION_MGR:  ['V','A'],
    ROLE_FARM_MGR:    ['V','A'],
    ROLE_FIN_CFO:     ['V','A'],
    ROLE_AUDITOR:     ['V','X'],
  },

  // ── 物流 ──────────────────────────────────────────────────────────────────
  MENU_LOGISTICS: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_LOG_MGR:['V','C','E','D','X'],
    ROLE_DRIVER:      ['V','C'],
    ROLE_REGION_MGR:  ['V','X'],
  },

  // ── 会员/CRM ───────────────────────────────────────────────────────────────
  MENU_CRM: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_STORE_MGR:   ['V','C','E'],
    ROLE_CASHIER:     ['V','C'],
    ROLE_REGION_MGR:  ['V','X'],
  },

  // ── 质检 ──────────────────────────────────────────────────────────────────
  MENU_QA: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_FARM_MGR:    ['V','C','E','X'],
    ROLE_VET:         ['V','C','E'],
    ROLE_REGION_MGR:  ['V','X'],
    ROLE_CEO:         ['V','X'],
    ROLE_AUDITOR:     ['V','X'],
  },

  // ── 订单 ──────────────────────────────────────────────────────────────────
  MENU_ORDERS: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_STORE_MGR:   ['V','C','E','D','X'],
    ROLE_CASHIER:     ['V','C','E'],
    ROLE_SALES_REP:   ['V','C'],
    ROLE_REGION_MGR:  ['V','A','X'],
    ROLE_FIN_ACCT:    ['V','X'],
  },

  // ── 补齐高风险 MENU（RBAC-1 安全加固 2026-05-25）────────────────────────

  // 财务审计（高度敏感）
  MENU_FIN_AUDIT: {
    ROLE_ADMIN:       ['V','X'],
    ROLE_AUDITOR:     ['V','X'],
    ROLE_FIN_CFO:     ['V','X'],
    ROLE_CEO:         ['V','X'],
  },

  // ── Finance V2（重构版，Phase 0+）───────────────────────────────────────
  /** Finance V2 主模块入口 */
  MENU_FIN2: {
    ROLE_ADMIN:               ['V','C','E','D','A','X'],
    ROLE_FIN_CFO:             ['V','C','E','A','X'],
    ROLE_HQ_FINANCE:       ['V','C','E','A','X'],
    ROLE_FACTORY_ACCT:  ['V','C','E','X'],
    ROLE_CEO:                 ['V','A','X'],
    ROLE_AUDITOR:             ['V','X'],
  },
  /** Finance V2 应付账款（AP） */
  MENU_FIN2_AP: {
    ROLE_ADMIN:               ['V','C','E','D','A','X'],
    ROLE_FIN_CFO:             ['V','C','E','A','X'],
    ROLE_HQ_FINANCE:       ['V','C','E','A','X'],
    ROLE_FACTORY_ACCT:  ['V','C','E','X'],
    ROLE_CEO:                 ['V','A','X'],
    ROLE_AUDITOR:             ['V','X'],
    ROLE_PRC_BUYER:           ['V'],             // 采购员可看自己的 AP 状态
  },
  /** Finance V2 应收账款（AR） */
  MENU_FIN2_AR: {
    ROLE_ADMIN:               ['V','C','E','D','A','X'],
    ROLE_FIN_CFO:             ['V','C','E','A','X'],
    ROLE_HQ_FINANCE:       ['V','C','E','A','X'],
    ROLE_FACTORY_ACCT:  ['V','C','E','X'],
    ROLE_CEO:                 ['V','A','X'],
    ROLE_AUDITOR:             ['V','X'],
  },
  /** Finance V2 资金账户（Cash Accounts） */
  MENU_FIN2_CASH: {
    ROLE_ADMIN:               ['V','C','E','D','A','X'],
    ROLE_FIN_CFO:             ['V','C','E','A','X'],
    ROLE_HQ_FINANCE:       ['V','C','E','X'],
    ROLE_FACTORY_ACCT:  ['V','C','X'],
    ROLE_CEO:                 ['V','X'],
    ROLE_AUDITOR:             ['V','X'],
  },
  /** Finance V2 费用管理（Expense） */
  MENU_FIN2_EXPENSE: {
    ROLE_ADMIN:               ['V','C','E','D','A','X'],
    ROLE_FIN_CFO:             ['V','C','E','A','X'],
    ROLE_HQ_FINANCE:       ['V','C','E','A','X'],
    ROLE_FACTORY_ACCT:  ['V','C','E','X'],
    ROLE_CEO:                 ['V','A','X'],
    ROLE_FARM_MGR:            ['V','C'],          // 申请费用
    ROLE_STORE_MGR:           ['V','C'],          // 申请费用
    ROLE_AUDITOR:             ['V','X'],
  },
  /** Finance V2 预算管理（Budget） */
  MENU_FIN2_BUDGET: {
    ROLE_ADMIN:               ['V','C','E','D','A','X'],
    ROLE_FIN_CFO:             ['V','C','E','A','X'],
    ROLE_HQ_FINANCE:       ['V','C','E','A','X'],
    ROLE_CEO:                 ['V','A','X'],
    ROLE_AUDITOR:             ['V','X'],
  },
  /** Finance V2 股东资金（Shareholder Funds） */
  MENU_FIN2_SHAREHOLDER: {
    ROLE_ADMIN:               ['V','C','E','D','A','X'],
    ROLE_FIN_CFO:             ['V','C','E','A','X'],
    ROLE_HQ_FINANCE:       ['V','C','E','A','X'],
    ROLE_CEO:                 ['V','A','X'],
    ROLE_SHAREHOLDER_VIEW:    ['V'],              // 股东仅查看
    ROLE_AUDITOR:             ['V','X'],
  },
  /** Finance V2 财务报告（Reports） */
  MENU_FIN2_REPORT: {
    ROLE_ADMIN:               ['V','X'],
    ROLE_FIN_CFO:             ['V','X'],
    ROLE_HQ_FINANCE:       ['V','X'],
    ROLE_CEO:                 ['V','X'],
    ROLE_AUDITOR:             ['V','X'],
  },

  // 订单管理（BFF 层，原 MENU_ORDERS 的 BFF 补充）
  MENU_ORDER_MGR: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_STORE_MGR:   ['V','C','E','D','X'],
    ROLE_CASHIER:     ['V','C','E'],
    ROLE_SALES_REP:   ['V','C'],
    ROLE_REGION_MGR:  ['V','A','X'],
    ROLE_FIN_ACCT:    ['V','X'],
  },

  // 系统设置（数据层）
  MENU_SETTINGS_DATA: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_SYSOPS:      ['V','C','E','D'],
  },

  // 系统设置（IT层）
  MENU_SETTINGS_IT: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_SYSOPS:      ['V','C','E','D'],
  },

  // 基础主数据
  MENU_MASTER: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_SYSOPS:      ['V','C','E','D'],
    ROLE_HR_ADMIN:    ['V','C','E'],
    ROLE_FARM_MGR:    ['V'],
    ROLE_STORE_MGR:   ['V'],
  },

  // 采购 V1 管理
  MENU_PRC_MGR: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_PRC_BUYER:   ['V','C','E','D','X'],
    ROLE_FIN_CFO:     ['V','A','X'],
    ROLE_CEO:         ['V','A','X'],
  },

  // 采购 V1 主数据
  MENU_PRC_MASTER: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_PRC_BUYER:   ['V','C','E','X'],
    ROLE_FARM_MGR:    ['V'],
  },

  // 质检主数据
  MENU_QA_MASTER: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_FARM_MGR:    ['V','C','E'],
    ROLE_VET:         ['V','C','E'],
    ROLE_REGION_MGR:  ['V'],
  },

  // 物流主数据
  MENU_LOGISTICS_MASTER: {
    ROLE_ADMIN:           ['V','C','E','D','A','X'],
    ROLE_LOG_MGR:   ['V','C','E','D'],
    ROLE_REGION_MGR:      ['V'],
  },

  // ── RBAC-2 组织与数据范围管理 ────────────────────────────────────────────────
  MENU_SYS_ORG: {
    ROLE_ADMIN:    ['V','C','E','D','A','X'],
    ROLE_HR_ADMIN: ['V','C','E','D'],
    ROLE_SYSOPS:   ['V','C','E'],
    ROLE_CEO:      ['V'],
  },

  // ── RBAC-2.5 新增：压测专用菜单（无重复键，仅补充之前未覆盖的菜单）────────────

  /** 采购V2 采购申请（PR） — requests.controller 原使用 MENU_PRC2_MASTER，此条新增精细化 */
  MENU_PRC2_REQUEST: {
    ROLE_ADMIN:          ['V','C','E','D','A','X'],
    ROLE_CEO:            ['V','A','X'],
    ROLE_FIN_CFO:        ['V','A'],
    ROLE_PRC_BUYER:      ['V','C','E','D','X'],
    ROLE_FARM_MGR:       ['V','C','E'],
    ROLE_PROJECT_MGR:    ['V','C','E'],
    ROLE_FACTORY_ACCT:   ['V'],
  },

  /** 采购V2 供应商管理（单独菜单） */
  MENU_PRC2_SUPPLIER: {
    ROLE_ADMIN:          ['V','C','E','D','A','X'],
    ROLE_PRC_BUYER:      ['V','C','E','X'],
    ROLE_FIN_CFO:        ['V','X'],
    ROLE_FARM_MGR:       ['V'],
    ROLE_PROJECT_MGR:    ['V'],
    ROLE_FACTORY_ACCT:   ['V'],
  },

  /** 采购V2 项目管理（单独菜单） */
  MENU_PRC2_PROJECT: {
    ROLE_ADMIN:          ['V','C','E','D','A','X'],
    ROLE_CEO:            ['V','X'],
    ROLE_REGION_MGR:     ['V','X'],
    ROLE_FIN_CFO:        ['V','X'],
    ROLE_PRC_BUYER:      ['V','C','E'],
    ROLE_PROJECT_MGR:    ['V','C','E'],
    ROLE_FACTORY_ACCT:   ['V'],
  },

  // ── Sales V2（重构版，Phase 1+）─────────────────────────────────────────
  /** Sales V2 主模块入口 */
  MENU_SALES2: {
    ROLE_ADMIN:         ['V','C','E','D','A','X'],
    ROLE_CEO:           ['V','X'],
    ROLE_HQ_FINANCE: ['V','X'],
    ROLE_SALES_MGR:     ['V','C','E','D','A','X'],
    ROLE_SALES_REP:     ['V','C','E'],
    ROLE_STORE_MGR:     ['V'],
    ROLE_REGION_MGR:    ['V','X'],
    ROLE_AUDITOR:       ['V','X'],
  },
  /** Sales V2 客户主档（Customer Runtime） */
  MENU_SALES2_CUSTOMER: {
    ROLE_ADMIN:         ['V','C','E','D','A','X'],
    ROLE_CEO:           ['V','X'],
    ROLE_HQ_FINANCE: ['V','X'],
    ROLE_SALES_MGR:     ['V','C','E','D','A','X'],
    ROLE_SALES_REP:     ['V','C','E'],
    ROLE_STORE_MGR:     ['V'],
    ROLE_REGION_MGR:    ['V','X'],
    ROLE_AUDITOR:       ['V','X'],
  },
  /** Sales V2 价格管理（Price Runtime） */
  MENU_SALES2_PRICE: {
    ROLE_ADMIN:         ['V','C','E','D','A','X'],
    ROLE_CEO:           ['V','A','X'],
    ROLE_HQ_FINANCE: ['V','X'],
    ROLE_SALES_MGR:     ['V','C','E','D','A','X'],
    ROLE_SALES_REP:     ['V'],
    ROLE_REGION_MGR:    ['V','X'],
    ROLE_AUDITOR:       ['V','X'],
  },
  /** Sales V2 销售渠道（Channel Runtime） */
  MENU_SALES2_CHANNEL: {
    ROLE_ADMIN:         ['V','C','E','D','A','X'],
    ROLE_CEO:           ['V','X'],
    ROLE_HQ_FINANCE: ['V','X'],
    ROLE_SALES_MGR:     ['V','C','E','D','A','X'],
    ROLE_SALES_REP:     ['V'],
    ROLE_REGION_MGR:    ['V','X'],
    ROLE_AUDITOR:       ['V','X'],
  },
  /** Sales V2 销售订单（Sales Order Runtime） */
  MENU_SALES2_ORDER: {
    ROLE_ADMIN:         ['V','C','E','D','A','X'],
    ROLE_CEO:           ['V','A','X'],
    ROLE_HQ_FINANCE:    ['V','X'],
    ROLE_FIN_CFO:       ['V','A','X'],
    ROLE_SALES_MGR:     ['V','C','E','D','A','X'],
    ROLE_SALES_REP:     ['V','C','E'],
    ROLE_REGION_MGR:    ['V','A','X'],
    ROLE_LOG_MGR:       ['V','E'],
    ROLE_AUDITOR:       ['V','X'],
  },
  /** Sales V2 配送履约（Delivery Runtime） */
  MENU_SALES2_DELIVERY: {
    ROLE_ADMIN:         ['V','C','E','D','A','X'],
    ROLE_CEO:           ['V','X'],
    ROLE_HQ_FINANCE:    ['V','X'],
    ROLE_SALES_MGR:     ['V','C','E','D','A','X'],
    ROLE_SALES_REP:     ['V','C','E'],
    ROLE_LOG_MGR:       ['V','C','E','D','X'],
    ROLE_DRIVER:        ['V','C','E'],
    ROLE_REGION_MGR:    ['V','X'],
    ROLE_AUDITOR:       ['V','X'],
  },
  /** Sales V2 信用控制（Credit Control Runtime — Phase 5） */
  MENU_SALES2_CREDIT: {
    ROLE_ADMIN:         ['V','C','E','D','A','X'],
    ROLE_CEO:           ['V','X'],
    ROLE_HQ_FINANCE:    ['V','X'],
    ROLE_FIN_CFO:       ['V','C','E','A','X'],
    ROLE_SALES_MGR:     ['V','C','E','D','A','X'],
    ROLE_SALES_REP:     ['V'],
    ROLE_REGION_MGR:    ['V','X'],
    ROLE_AUDITOR:       ['V','X'],
  },

  // ── 审批工作流 ──────────────────────────────────────────────────────────
  MENU_WORKFLOW: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_CEO:         ['V','C','E','D','A','X'],   // Phase C：CEO 可管理审批规则
    ROLE_FIN_CFO:     ['V','C','E','D','A','X'],   // Phase C：CFO 可管理审批规则
    ROLE_PRC_BUYER:   ['V','A','X'],
    ROLE_FIN_ACCT:    ['V','X'],
    ROLE_REGION_MGR:  ['V','A'],
    ROLE_FARM_MGR:    ['V'],
    ROLE_STORE_MGR:   ['V'],
    ROLE_PROJECT_MGR: ['V','A'],
    ROLE_SALES_MGR:   ['V','A'],    // 销售主管需审批工作流
    ROLE_SALES_REP:   ['V'],        // 业务员查看自己的审批状态
    ROLE_AUDITOR:     ['V','X'],    // 审计专员查看所有流程历史
    ROLE_HQ_FINANCE:  ['V','A','X'], // 总部财务审批/导出
  },
};

/**
 * 检查指定角色列表是否对某菜单拥有指定权限码
 */
/**
 * 检查 MENU 是否已在矩阵中注册
 * 未注册的 MENU 视为高风险，由 MenuGuard 返回 MENU_PERMISSION_NOT_REGISTERED
 */
export function isMenuRegistered(menuCode: string): boolean {
  return menuCode in ROLE_MENU_MATRIX;
}

/**
 * 检查指定角色列表是否对某菜单拥有指定权限码
 */
export function hasMenuPermission(
  roles: string[],
  menuCode: string,
  requiredPerm: string,
): boolean {
  if (!roles?.length) return false;
  const menuPerms = ROLE_MENU_MATRIX[menuCode];
  if (!menuPerms) {
    // SECURITY: 菜单未在矩阵中注册 → 默认拒绝（严格策略）
    return false;
  }
  for (const role of roles) {
    const perms = menuPerms[role];
    if (perms && (perms.includes(requiredPerm) || perms.includes('*'))) {
      return true;
    }
  }
  return false;
}
