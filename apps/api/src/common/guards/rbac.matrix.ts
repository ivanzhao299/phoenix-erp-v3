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
    // Navigation Final 2026-05-30: 生产管理合并分级包装+品质追溯，WMS 主管需查看包装入库
    ROLE_WMS_MGR:     ['V'],
    // Phase A 修复：质检/包装角色需要 MENU_FARM_DATA(V) 才能看到「生产管理」一级菜单
    ROLE_QA_MGR:      ['V'],
    ROLE_QA_STAFF:    ['V'],
    ROLE_PKG_MGR:     ['V'],
    ROLE_PKG_OP:      ['V'],
    ROLE_FACTORY_MGR: ['V','C','E','D','A'],  // Phase A 新增角色
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
  // WMS 视图权限（Sidebar: MENU_WMS_VIEW — 看板/台账/查询/临期预警）
  MENU_WMS_VIEW: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_WMS_MGR:     ['V','C','E','D','A','X'],
    ROLE_WMS_OP:      ['V'],              // Phase C-2.1：仓管货员可查看库存
    ROLE_FARM_MGR:    ['V','X'],
    ROLE_FIN_ACCT:    ['V','X'],
    ROLE_CEO:         ['V','X'],
    ROLE_REGION_MGR:  ['V','X'],
    ROLE_AUDITOR:     ['V','X'],
    ROLE_BU_AGRI_GM:  ['V','X'],          // Phase C-2.4：农业事业群总经理
    ROLE_BU_FOOD_GM:  ['V','X'],
    ROLE_FACTORY_MGR: ['V'],              // 场区经理可查看场区库存
  },
  // WMS 出入库操作权限（Sidebar: MENU_WMS_INOUT — 入库/出库/调拨/盘点/日结/报损）
  MENU_WMS_INOUT: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_WMS_MGR:     ['V','C','E','D','A','X'],
    ROLE_WMS_OP:      ['V','C','E'],      // Phase C-2.1：仓管货员核心操作权限
    ROLE_FARM_MGR:    ['V','C','E'],
    ROLE_REGION_MGR:  ['V','X'],
    ROLE_FACTORY_MGR: ['V','C','E'],      // 场区经理出入库操作
  },
  // WMS 主数据权限（Sidebar: MENU_WMS_MASTER — 仓库主档/库区/库位）
  MENU_WMS_MASTER: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_WMS_MGR:     ['V','C','E','D','X'],
    ROLE_REGION_MGR:  ['V','X'],
  },
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
  // WMS 入库子菜单（InboundController 使用）
  MENU_WMS_INBOUND: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_WMS_MGR:     ['V','C','E','D','A','X'],
    ROLE_FARM_MGR:    ['V','C'],
    ROLE_REGION_MGR:  ['V','X'],
  },
  // WMS 出库子菜单（OutboundController 使用）
  MENU_WMS_OUTBOUND: {
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
    ROLE_FARMER:      ['V','C','E'],
    ROLE_WMS_MGR:     ['V','C'],
    // Phase C-2.2：包装角色访问终端 packaging.controller（校验 MENU_PACKAGING）
    ROLE_PKG_MGR:     ['V','C','E','D','A'],
    ROLE_PKG_OP:      ['V','C','E'],      // 包装工人作业台读写
    ROLE_PKG_OPERATOR:['V','C','E'],      // 兼容近义角色
    ROLE_FACTORY_MGR: ['V','C','E','A'],
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
    ROLE_ADMIN:         ['V','C','E','D','A','X'],
    ROLE_CEO:           ['V','A'],
    ROLE_REGION_MGR:    ['V','A'],
    ROLE_FARM_MGR:      ['V','A'],
    ROLE_FIN_CFO:       ['V','A'],
    ROLE_HQ_FINANCE:    ['V','A'],        // Phase A 修复：总部财务可审批
    ROLE_FIN_ACCT:      ['V','A'],        // Phase A 修复：财务会计参与财务审批链
    ROLE_QA_MGR:        ['V','A'],        // Phase A 修复：品控总监可审批质检申请
    ROLE_PKG_MGR:       ['V','A'],        // Phase A 修复：包装主管可审批包装操作
    ROLE_WMS_MGR:       ['V','A'],        // Phase A 修复：仓储经理可审批出入库
    ROLE_LOG_MGR:       ['V','A'],        // Phase A 修复：物流调度可审批配送任务
    ROLE_STORE_MGR:     ['V','A'],        // Phase A 修复：门店店长可审批门店操作
    ROLE_B2B_MGR:       ['V','A'],        // Phase A 修复：大客总监可审批B2B订单
    ROLE_PRC_BUYER:     ['V','A'],        // Phase A 修复：采购专员是采购审批链第1步
    ROLE_VET:           ['V','A'],        // Phase A 修复：兽医是用药审批链第1步
    ROLE_SALES_MGR:     ['V','A'],        // Phase A 新增角色
    ROLE_BU_AGRI_GM:    ['V','A'],        // Phase A 新增角色
    ROLE_BU_FOOD_GM:    ['V','A'],        // Phase A 新增角色
    ROLE_FACTORY_MGR:   ['V','A'],        // Phase A 新增角色
    ROLE_AUDITOR:       ['V','X'],
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
    // ── 财务岗位重构 Phase1（岗位驱动）──
    ROLE_FINANCE_REVIEW_MANAGER: ['V','A','X'],   // 财务审核经理(刘杰)：查看+审批，禁付款/编辑
    ROLE_TREASURY_MANAGER:       ['V'],           // 资金经理(王玮华/朱召安)：仅查看财务总览
    ROLE_FINANCE_ANALYST:        ['V','X'],       // 财务分析经理(刘汉涛)：查看+导出
    ROLE_COST_ACCOUNTING_MANAGER:['V','X'],       // 成本核算经理(刘汉涛)：查看+导出
    ROLE_FIN_CFO:             ['V','C','E','A','X'],
    ROLE_HQ_FINANCE:          ['V','C','E','A','X'],
    ROLE_FACTORY_ACCT:        ['V','C','E','X'],
    ROLE_FIN_ACCT:            ['V','C','E','X'],   // Phase A 修复：财务会计可见财务管理
    ROLE_FIN_AR:              ['V','C','E'],        // Phase A 修复：应收专员可见财务管理
    ROLE_FIN_COST:            ['V'],               // Phase A 修复：成本会计可见财务管理（查看）
    ROLE_CEO:                 ['V','A','X'],
    ROLE_REGION_MGR:          ['V'],               // Phase A 修复：区域督导可查看财务概况
    ROLE_AUDITOR:             ['V','X'],
  },
  /** Finance V2 应付账款（AP） */
  MENU_FIN2_AP: {
    ROLE_ADMIN:               ['V','C','E','D','A','X'],
    ROLE_FINANCE_REVIEW_MANAGER: ['V','A','X'],   // 审核经理：查看应付+审批
    ROLE_TREASURY_MANAGER:       ['V'],           // 资金经理：查看应付
    ROLE_FINANCE_ANALYST:        ['V','X'],       // 分析经理：查看+导出
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
    ROLE_FINANCE_REVIEW_MANAGER: ['V','A','X'],   // 审核经理：查看应收+审批
    ROLE_TREASURY_MANAGER:       ['V'],           // 资金经理：查看应收(收款登记在CASH)
    ROLE_FINANCE_ANALYST:        ['V','X'],       // 分析经理：查看+导出
    ROLE_FIN_CFO:             ['V','C','E','A','X'],
    ROLE_HQ_FINANCE:          ['V','C','E','A','X'],
    ROLE_FACTORY_ACCT:        ['V','C','E','X'],
    ROLE_FIN_ACCT:            ['V','C','E','X'],   // Phase A 修复
    ROLE_FIN_AR:              ['V','C','E','D','X'],// Phase A 修复：应收专员核心权限
    ROLE_CEO:                 ['V','A','X'],
    ROLE_AUDITOR:             ['V','X'],
  },
  /** Finance V2 资金账户（Cash Accounts） */
  MENU_FIN2_CASH: {
    ROLE_ADMIN:               ['V','C','E','D','A','X'],
    ROLE_FINANCE_REVIEW_MANAGER: ['V','X'],       // 审核经理：仅查看资金，【禁止】付款/银行账户操作(无C/E/A)
    ROLE_TREASURY_MANAGER:       ['V','C','E','X'],// 资金经理：资金账户查看+付款单录入(C)+付款执行/银行流水(E)+日报导出 —— 付款人
    // 分析经理【禁止】银行账户操作 → 不授予 CASH
    ROLE_FIN_CFO:             ['V','C','E','A','X'],
    ROLE_HQ_FINANCE:          ['V','X'],            // 财务加固P2：审核者仅查看资金，不执行（职责分离）
    ROLE_CASH:                ['V','E'],            // 财务加固P2：出纳—资金账户查看+付款执行/确认/现金流水
    ROLE_FACTORY_ACCT:  ['V','C','X'],
    ROLE_CEO:                 ['V','X'],
    ROLE_AUDITOR:             ['V','X'],
  },
  /** Finance V2 费用管理（Expense） */
  MENU_FIN2_EXPENSE: {
    ROLE_ADMIN:               ['V','C','E','D','A','X'],
    ROLE_FINANCE_REVIEW_MANAGER: ['V','A','X'],   // 审核经理：费用审核(A)
    ROLE_TREASURY_MANAGER:       ['V'],           // 资金经理：查看费用单(付款依据)
    ROLE_FINANCE_ANALYST:        ['V','X'],       // 分析经理：查看+导出(费用分析)
    ROLE_FIN_CFO:             ['V','C','E','A','X'],
    ROLE_HQ_FINANCE:          ['V','A','X'],       // 财务加固P2：审核者—费用查看+审核+导出（不申请/不编辑）
    ROLE_FIN_ACCT:            ['V','X'],            // 财务加固P2：会计—费用查看+导出（记账经 AR/AP）
    ROLE_FACTORY_ACCT:  ['V','C','E','X'],
    ROLE_CEO:                 ['V','A','X'],
    ROLE_FARM_MGR:            ['V','C'],          // 申请费用（谢继领等场长）
    ROLE_STORE_MGR:           ['V','C'],          // 申请费用
    ROLE_AUDITOR:             ['V','X'],
  },
  /** Finance V2 报销管理（Reimbursement — Phase 2A 独立菜单权限） */
  MENU_FIN2_REIMBURSE: {
    ROLE_ADMIN:               ['V','C','E','D','A','X'],
    ROLE_FINANCE_REVIEW_MANAGER: ['V','A','X'],   // 审核经理：报销审核(A)，【禁止】付款(无E)
    ROLE_TREASURY_MANAGER:       ['V','E'],       // 资金经理：报销付款执行(pay=E)，【禁止】审批(无A) —— 付款人≠审核人
    ROLE_FIN_CFO:             ['V','C','E','A','X'],
    ROLE_HQ_FINANCE:          ['V','A','X'],        // 财务加固P2：审核者—报销查看+审核(A)+导出；【禁止付款】移除 E
    ROLE_CASH:                ['V','E'],             // 财务加固P2：出纳—报销查看+付款执行(pay=E)；【禁止审批】无 A
    ROLE_FIN_ACCT:            ['V','X'],             // 财务加固P2：会计—报销查看+导出；【禁止付款/审批】无 E/A
    ROLE_FACTORY_ACCT:        ['V','C','E','X'],
    ROLE_CEO:                 ['V','A','X'],
    ROLE_FARM_MGR:            ['V','C'],           // 提交报销申请
    ROLE_STORE_MGR:           ['V','C'],           // 提交报销申请
    ROLE_AUDITOR:             ['V','X'],
  },
  /** Finance V2 预算管理（Budget） */
  MENU_FIN2_BUDGET: {
    ROLE_ADMIN:               ['V','C','E','D','A','X'],
    ROLE_FINANCE_REVIEW_MANAGER: ['V','A','X'],   // 审核经理：预算审批
    ROLE_FINANCE_ANALYST:        ['V','X'],       // 分析经理：预算查看+导出
    ROLE_COST_ACCOUNTING_MANAGER:['V','X'],       // 成本核算经理：预算查看+导出
    ROLE_FIN_CFO:             ['V','C','E','A','X'],
    ROLE_HQ_FINANCE:       ['V','C','E','A','X'],
    ROLE_CEO:                 ['V','A','X'],
    ROLE_AUDITOR:             ['V','X'],
  },
  /** Finance V2 股东资金（Shareholder Funds） */
  MENU_FIN2_SHAREHOLDER: {
    ROLE_ADMIN:               ['V','C','E','D','A','X'],
    ROLE_FINANCE_REVIEW_MANAGER: ['V','X'],       // 审核经理：查看股东资金
    ROLE_FINANCE_ANALYST:        ['V','X'],       // 分析经理：查看股东资金+导出
    ROLE_FIN_CFO:             ['V','C','E','A','X'],
    ROLE_HQ_FINANCE:       ['V','C','E','A','X'],
    ROLE_CEO:                 ['V','A','X'],
    ROLE_SHAREHOLDER_VIEW:    ['V'],              // 股东仅查看
    ROLE_AUDITOR:             ['V','X'],
  },
  /** Finance V2 财务报告（Reports） */
  MENU_FIN2_REPORT: {
    ROLE_ADMIN:               ['V','X'],
    ROLE_FINANCE_REVIEW_MANAGER: ['V','X'],       // 审核经理：复核财务报表
    ROLE_FINANCE_ANALYST:        ['V','X'],       // 分析经理：利润/成本/经营报表(核算人核心)
    ROLE_COST_ACCOUNTING_MANAGER:['V','X'],       // 成本核算经理：成本/利润核算报表(核心)
    ROLE_FIN_CFO:             ['V','X'],
    ROLE_HQ_FINANCE:       ['V','X'],
    ROLE_FIN_ACCT:            ['V','X'],            // 财务加固P2：会计可看/导出财务报表
    ROLE_CEO:                 ['V','X'],
    ROLE_AUDITOR:             ['V','X'],
  },

  // ── 股东权益中心（Shareholder Runtime Phase 1）─────────────────────────────
  /** 股东/项目/股权查看 */
  MENU_SHAREHOLDER_VIEW: {
    ROLE_ADMIN:        ['V','C','E','D','A','X'],
    ROLE_FINANCE_REVIEW_MANAGER: ['V','X'],   // 审核经理：查看股东/项目投资
    ROLE_FINANCE_ANALYST:        ['V','X'],   // 分析经理：查看项目投资/股东数据
    ROLE_COST_ACCOUNTING_MANAGER:['V','X'],   // 成本核算经理：查看项目投资/股东数据
    ROLE_CEO:          ['V','X'],
    ROLE_HQ_FINANCE:   ['V','X'],
    ROLE_FIN_ACCT:     ['V','X'],
    ROLE_AUDITOR:      ['V','X'],
  },
  /** 项目/股东/股权管理 */
  MENU_SHAREHOLDER_MANAGE: {
    ROLE_ADMIN:        ['V','C','E','D','A','X'],
    ROLE_CEO:          ['V','C','E','A','X'],
    ROLE_HQ_FINANCE:   ['V','C','E','X'],
    ROLE_FIN_ACCT:     ['V'],
    ROLE_AUDITOR:      ['V','X'],
  },
  /** 出资台账：HQ_FINANCE 确认出资(A)，FIN_ACCT 录入出资(C) */
  MENU_SHAREHOLDER_CONTRIBUTION: {
    ROLE_ADMIN:        ['V','C','E','D','A','X'],
    ROLE_CEO:          ['V','A','X'],
    ROLE_HQ_FINANCE:   ['V','C','E','A','X'],
    ROLE_FIN_ACCT:     ['V','C','X'],
    ROLE_AUDITOR:      ['V','X'],
  },
  /** 股东查看范围授权（敏感，管理层维护）*/
  MENU_SHAREHOLDER_SCOPE: {
    ROLE_ADMIN:        ['V','C','E','D','A','X'],
    ROLE_CEO:          ['V','C','E','D','X'],
    ROLE_HQ_FINANCE:   ['V','C','E','D','X'],
    ROLE_AUDITOR:      ['V'],
  },
  /** 股东驾驶舱：菜单='可打开'，实际可见项目由 shr_shareholder_scopes 控制（无 scope→空）。
   *  下列角色为实际股东所持角色，可打开驾驶舱后按 scope 过滤数据。 */
  MENU_SHAREHOLDER_DASHBOARD: {
    ROLE_ADMIN:           ['V','X'],
    ROLE_FINANCE_REVIEW_MANAGER: ['V','X'],   // 审核经理(刘杰)：查看股东驾驶舱
    ROLE_FINANCE_ANALYST:        ['V','X'],   // 分析经理(刘汉涛)：股东驾驶舱
    ROLE_COST_ACCOUNTING_MANAGER:['V','X'],   // 成本核算经理(刘汉涛)：项目利润/成本驾驶舱
    ROLE_CEO:             ['V','X'],   // 朱兆存
    ROLE_FIN_CFO:         ['V','X'],
    ROLE_HQ_FINANCE:      ['V','X'],
    ROLE_FIN_ACCT:        ['V','X'],
    ROLE_FACTORY_MGR:     ['V','X'],   // 伏强 / 宋雷
    ROLE_CASH:            ['V','X'],   // 朱召安
    ROLE_SHAREHOLDER_VIEW:['V','X'],
    ROLE_SHAREHOLDER_FINANCE: ['V','X'],
    ROLE_AUDITOR:         ['V','X'],
  },
  /** 股东资本流引擎（Phase 3）：录入(SHAREHOLDER_FINANCE) / 审核(HQ_FINANCE) / 批准(CEO） */
  MENU_SHAREHOLDER_CAPITAL: {
    ROLE_ADMIN:               ['V','C','E','D','A','X'],
    ROLE_FINANCE_ANALYST:        ['V','C','E','X'],   // 财务分析经理(刘汉涛)：录入/编辑资本流(分析人录入)，【禁止】审批(无A)
    ROLE_COST_ACCOUNTING_MANAGER:['V','C','E','X'],   // 成本核算经理(刘汉涛)：录入/编辑资本流，【禁止】审批(无A)
    ROLE_FINANCE_REVIEW_MANAGER: ['V','X'],           // 财务审核经理(刘杰)：查看资本流
    ROLE_SHAREHOLDER_FINANCE: ['V','C','E','X'],   // 股东资金管理员：录入/编辑/确认到账/导出
    ROLE_HQ_FINANCE:          ['V','C','E','A','X'],
    ROLE_GROUP_FINANCE:       ['V','A','X'],
    ROLE_CEO:                 ['V','A','X'],
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

  // ── 产品主数据 Phase H2 — 精细化四个权限维度 ─────────────────────────────

  /** 产品档案总入口（主数据中心 → 产品档案 portal 页）*/
  MENU_MASTER_PRODUCT: {
    ROLE_ADMIN:          ['V','C','E','D','A','X'],
    ROLE_PRODUCT_MGR:    ['V','C','E','D','X'],
    ROLE_HQ_FINANCE:     ['V','X'],
    ROLE_AUDITOR:        ['V','X'],
    ROLE_WMS_MGR:        ['V'],
    ROLE_PRC_BUYER:      ['V'],
    ROLE_REGION_MGR:     ['V'],
    ROLE_CEO:            ['V','X'],
  },

  /** 产品等级主数据（product_grades CRUD）*/
  MENU_MASTER_GRADE: {
    ROLE_ADMIN:          ['V','C','E','D','A','X'],
    ROLE_PRODUCT_MGR:    ['V','C','E','D','X'],
    ROLE_HQ_FINANCE:     ['V','X'],
    ROLE_AUDITOR:        ['V','X'],
    ROLE_WMS_MGR:        ['V'],
    ROLE_PKG_MGR:        ['V'],
    ROLE_QC_INSPECTOR:   ['V'],
  },

  /** 包装规格主数据（packaging_specs CRUD）*/
  MENU_MASTER_PACKAGING: {
    ROLE_ADMIN:          ['V','C','E','D','A','X'],
    ROLE_PRODUCT_MGR:    ['V','C','E','D','X'],
    ROLE_HQ_FINANCE:     ['V','X'],
    ROLE_AUDITOR:        ['V','X'],
    ROLE_WMS_MGR:        ['V'],
    ROLE_PKG_MGR:        ['V'],
  },

  /** SKU 主数据（product_skus CRUD）*/
  MENU_MASTER_SKU: {
    ROLE_ADMIN:          ['V','C','E','D','A','X'],
    ROLE_PRODUCT_MGR:    ['V','C','E','D','X'],
    ROLE_HQ_FINANCE:     ['V','X'],
    ROLE_AUDITOR:        ['V','X'],
    ROLE_WMS_MGR:        ['V'],
    ROLE_PRC_BUYER:      ['V'],
    ROLE_REGION_MGR:     ['V'],
    ROLE_CEO:            ['V','X'],
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

  // ── Organization Runtime Phase 1 — /api/organizations/* 端点所需菜单 ──────
  // Fix: MENU_ORG_VIEW / MENU_ORG_MANAGE 在 organization.controller.ts 中使用
  // 但之前未在此矩阵注册，导致 isMenuRegistered() 返回 false →
  // 所有 /api/organizations/* 端点抛 MENU_PERMISSION_NOT_REGISTERED，含管理员
  MENU_ORG_VIEW: {
    ROLE_ADMIN:      ['V','C','E','D','A','X'],
    ROLE_HR_ADMIN:   ['V','C','E','D'],
    ROLE_SYSOPS:     ['V','C','E'],
    ROLE_CEO:        ['V'],
    ROLE_REGION_MGR: ['V'],
    ROLE_FARM_MGR:   ['V'],
    ROLE_STORE_MGR:  ['V'],
  },
  MENU_ORG_MANAGE: {
    ROLE_ADMIN:    ['V','C','E','D','A','X'],
    ROLE_HR_ADMIN: ['V','C','E','D'],
    ROLE_SYSOPS:   ['V','C','E'],
  },
  MENU_ORG_USER_SCOPE: {
    ROLE_ADMIN:    ['V','C','E','D','A','X'],
    ROLE_HR_ADMIN: ['V','C','E','X'],
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
    ROLE_HQ_FINANCE:    ['V','X'],
    ROLE_SALES_MGR:     ['V','C','E','D','A','X'],
    ROLE_SALES_REP:     ['V','C','E'],
    ROLE_STORE_MGR:     ['V'],
    ROLE_REGION_MGR:    ['V','X'],
    ROLE_AUDITOR:       ['V','X'],
    // Phase A 修复：以下角色需要 MENU_SALES2 才能看到「销售管理」一级菜单
    ROLE_B2B_MGR:       ['V','C','E','A'],  // 大客总监
    ROLE_LOG_MGR:       ['V','C','E'],      // 物流调度（配送在销售管理下）
    ROLE_DRIVER:        ['V'],              // 司机（只看配送任务入口）
    ROLE_CASHIER:       ['V'],              // 收银员（POS 在销售管理下）
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
  /** Mobile Delivery Runtime — 配送司机移动端 */
  MENU_MOBILE_DELIVERY: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_DRIVER:      ['V','C','E'],
    ROLE_SALES_MGR:   ['V','C','E','D','A','X'],
    ROLE_LOG_MGR:     ['V','C','E','D','X'],
    ROLE_HQ_OPS:      ['V','X'],
    ROLE_REGION_MGR:  ['V','X'],
    ROLE_AUDITOR:     ['V','X'],
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

  // ── Sales V2 Phase 6 — 销售退货管理 ────────────────────────────────────────
  MENU_SALES2_RETURN: {
    ROLE_ADMIN:         ['V','C','E','D','A','X'],
    ROLE_CEO:           ['V','X'],
    ROLE_HQ_FINANCE:    ['V','X'],
    ROLE_FIN_CFO:       ['V','C','E','A','X'],
    ROLE_SALES_MGR:     ['V','C','E','D','A','X'],
    ROLE_SALES_REP:     ['V','C'],
    ROLE_REGION_MGR:    ['V','A','X'],
    ROLE_AUDITOR:       ['V'],
  },

  // ── Sales V2 Phase 8 — 经营分析报表 ────────────────────────────────────────
  MENU_SALES2_REPORT: {
    ROLE_ADMIN:         ['V','X'],
    ROLE_CEO:           ['V','X'],
    ROLE_HQ_FINANCE:    ['V','X'],
    ROLE_FIN_CFO:       ['V','X'],
    ROLE_SALES_MGR:     ['V','X'],
    ROLE_SALES_REP:     ['V'],
    ROLE_REGION_MGR:    ['V','X'],
    ROLE_AUDITOR:       ['V','X'],
    ROLE_FARM_MGR:      ['V'],
  },

  // ── Sales V2 Phase 7 — 鸡蛋库存管理 ────────────────────────────────────────
  MENU_SALES2_INVENTORY: {
    ROLE_ADMIN:         ['V','C','E','D','A','X'],
    ROLE_CEO:           ['V','X'],
    ROLE_HQ_FINANCE:    ['V','X'],
    ROLE_FIN_CFO:       ['V','X'],
    ROLE_SALES_MGR:     ['V','C','E','A','X'],
    ROLE_SALES_REP:     ['V'],
    ROLE_REGION_MGR:    ['V','X'],
    ROLE_AUDITOR:       ['V','X'],
    ROLE_FARM_MGR:      ['V','C','E'],
  },

  // ── 审批工作流 ──────────────────────────────────────────────────────────
  // H3 修复（RBAC Hardening Phase 1）：
  //   · ROLE_WORKFLOW_ADMIN 独家管理审批规则（C/E/D）
  //   · ROLE_CEO / ROLE_FIN_CFO 收窄为"查看+审批"，不可配置规则
  // Phase C-3：审批链修正 — workflow-task.controller 的 approve/reject 端点
  // 校验 MENU_WORKFLOW 的 'A' 权限（不是 MENU_APPROVAL，后者无任何 controller 使用）。
  // 联合审计验证一：之前 Phase A 把审批权加到 MENU_APPROVAL（无效），此处迁移到正确位置。
  MENU_WORKFLOW: {
    ROLE_ADMIN:            ['V','C','E','D','A','X'],
    ROLE_WORKFLOW_ADMIN:   ['V','C','E','D','A','X'], // 工作流专员：完整规则配置权
    ROLE_CEO:              ['V','A','X'],              // 仅查看+审批，不可配置规则
    ROLE_FIN_CFO:          ['V','A','X'],
    ROLE_PRC_BUYER:        ['V','A','X'],              // 采购审批链第1步
    ROLE_FIN_ACCT:         ['V','A','X'],              // C-3：费用/库存财务步审批人（原仅V,X）
    ROLE_REGION_MGR:       ['V','A'],
    ROLE_FARM_MGR:         ['V','A'],                  // C-3：用药审批链第2步（原仅V）
    ROLE_STORE_MGR:        ['V','A'],                  // C-3：门店折扣审批链第1步（原仅V）
    ROLE_PROJECT_MGR:      ['V','A'],
    ROLE_SALES_MGR:        ['V','A'],                  // 销售主管需审批工作流
    ROLE_SALES_REP:        ['V'],                      // 业务员查看自己的审批状态
    ROLE_AUDITOR:          ['V','X'],                  // 审计专员查看所有流程历史
    ROLE_HQ_FINANCE:       ['V','A','X'],              // 总部财务审批/导出
    // ── C-3 新增审批人（这些角色在内置审批链中被指定为审批节点）──────────────
    ROLE_VET:              ['V','A'],                  // 用药审批链第1步 vet_review
    ROLE_QA_MGR:           ['V','A'],                  // 质量异常审批链第1步
    ROLE_WMS_MGR:          ['V','A'],                  // 库存调整审批链第1步
    ROLE_LOG_MGR:          ['V','A'],                  // 物流异常审批链第1步
    ROLE_PKG_MGR:          ['V','A'],                  // 包装异常审批
    ROLE_SYSOPS:           ['V','A'],                  // 多链审批人
    ROLE_BU_AGRI_GM:       ['V','A'],                  // 农业事业群审批
    ROLE_BU_FOOD_GM:       ['V','A'],                  // 食品事业群审批
    ROLE_FACTORY_MGR:      ['V','A'],                  // 场区级审批
  },
  // ── H5 补充：Sidebar 已使用但矩阵未注册的 MENU（RBAC Hardening Phase 1）──────────

  // 养殖兽医（免疫计划/用药记录）
  MENU_FARM_VET: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_FARM_MGR:    ['V','C','E','D','A','X'],
    ROLE_VET:         ['V','C','E'],
    ROLE_CEO:         ['V','X'],
    ROLE_REGION_MGR:  ['V','X'],
  },

  // 设备监控（IoT/环境预警/设备运维）
  MENU_DEVICE_MONITOR: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_FARM_MGR:    ['V','E','X'],
    ROLE_FARMER:      ['V'],
    ROLE_SYSOPS:      ['V','C','E','D'],
    ROLE_CEO:         ['V'],
    ROLE_REGION_MGR:  ['V'],
  },

  // 分级包装操作（包装管理主视图）
  MENU_PKG_OP: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_FARM_MGR:    ['V','C','E','X'],
    ROLE_FARMER:      ['V','C','E'],
    ROLE_WMS_MGR:     ['V','C'],
    ROLE_PKG_MGR:     ['V','C','E'],    // Phase A 修复：包装主管可操作包装
    ROLE_PKG_OP:      ['V','C'],        // Phase A 修复：包装工人可录入
    ROLE_FACTORY_MGR: ['V','C','E'],    // Phase A 新增角色
  },

  // 分级包装管理（集蛋入库/批次/日报/异常/补打）
  MENU_PKG_MGR: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_FARM_MGR:    ['V','C','E','D','A','X'],
    ROLE_WMS_MGR:     ['V','C','E'],
    ROLE_PKG_MGR:     ['V','C','E','D','A'],  // Phase A 修复：包装主管可管理包装批次
    ROLE_FACTORY_MGR: ['V','C','E','A'],      // Phase A 新增角色
  },

  // 质检操作（总览/场端/成品）
  MENU_QA_OP: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_FARM_MGR:    ['V','C','E','X'],
    ROLE_VET:         ['V','C','E'],
    ROLE_REGION_MGR:  ['V','X'],
    ROLE_CEO:         ['V','X'],
    ROLE_AUDITOR:     ['V','X'],
    ROLE_QA_MGR:      ['V','C','E','A'],  // Phase A 修复：品控总监核心权限
    ROLE_QA_STAFF:    ['V','C','E'],       // Phase A 修复：质检专员录入权限
    ROLE_FACTORY_MGR: ['V','C','E'],       // Phase A 新增角色
  },

  // 质检管理（不合格品处置/正向追溯/反向追溯）
  MENU_QA_MGR: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_FARM_MGR:    ['V','C','E','D','A','X'],
    ROLE_VET:         ['V','C','E'],
    ROLE_REGION_MGR:  ['V','X'],
    ROLE_QA_MGR:      ['V','C','E','D','A'], // Phase A 修复：品控总监管理权限
    ROLE_AUDITOR:     ['V','X'],
  },

  // 门店管理（工作台/收货验收/库存/补货/损耗/日结）
  MENU_STORE_MGR: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_STORE_MGR:   ['V','C','E','D','X'],
    ROLE_CASHIER:     ['V','C'],
    ROLE_REGION_MGR:  ['V','X'],
    ROLE_FIN_ACCT:    ['V','X'],
  },

  // B2B 销售（会员营销/批发管理/分销商）
  MENU_B2B_SALE: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_SALES_MGR:   ['V','C','E','D','A','X'],
    ROLE_SALES_REP:   ['V','C','E'],
    ROLE_REGION_MGR:  ['V','X'],
    ROLE_STORE_MGR:   ['V'],
    ROLE_AUDITOR:     ['V','X'],
  },

  // 数据分析看板（Sidebar analytics 组）
  MENU_DASHBOARD: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_FINANCE_REVIEW_MANAGER: ['V','X'],   // 审核经理：集团财务驾驶舱
    ROLE_FINANCE_ANALYST:        ['V','X'],   // 分析经理：集团经营驾驶舱
    ROLE_COST_ACCOUNTING_MANAGER:['V','X'],   // 成本核算经理：项目利润/成本驾驶舱
    ROLE_TREASURY_MANAGER:       ['V','X'],   // 资金经理：资金驾驶舱概览
    ROLE_CEO:         ['V','X'],
    ROLE_FIN_CFO:     ['V','X'],
    ROLE_HQ_FINANCE:  ['V','X'],
    ROLE_REGION_MGR:  ['V','X'],
    ROLE_FARM_MGR:    ['V'],
    ROLE_SALES_MGR:   ['V','X'],
    ROLE_AUDITOR:     ['V','X'],
  },

  // 用户管理（settings/users）
  MENU_SETTINGS_USER: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_SYSOPS:      ['V','C','E'],
    ROLE_HR_ADMIN:    ['V','C','E','D'],
  },

  // 旧订货系统 — 财务信用台账（已冻结，保留以兼容历史 Token）
  MENU_ORDER_FIN: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_FIN_CFO:     ['V','A','X'],
    ROLE_FIN_ACCT:    ['V','X'],
  },

  // 旧订货系统 — 仓库拣货/装车（已冻结，保留以兼容历史 Token）
  MENU_ORDER_WH: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_WMS_MGR:     ['V','C','E','D'],
    ROLE_FARM_MGR:    ['V','C'],
  },

  // ── Production Ops Runtime（Production Stabilization Phase 1）──────────────

  /** 系统监控看板（错误日志/慢接口/DB连接池/告警概览） */
  MENU_SYS_MONITOR: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_SYSOPS:      ['V','A'],               // 运维人员：查看+处理告警
  },

  /** 生产配置治理（sys_configs 查看/修改） */
  MENU_SYS_CONFIG: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_SYSOPS:      ['V','E'],               // 运维人员：查看+修改（不可删除）
  },

  // ── Store POS Runtime（Sales V2 Phase 9 — 直营店收银作业台）─────────────────
  /** 直营店收银：销售单 / 收款 / 日结交班 / 班次历史 */
  MENU_STORE_POS: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_STORE_MGR:   ['V','C','E','D','A','X'],
    ROLE_CASHIER:     ['V','C','E'],
    ROLE_REGION_MGR:  ['V','X'],
    ROLE_CEO:         ['V','X'],
    ROLE_AUDITOR:     ['V','X'],
    ROLE_HQ_FINANCE:  ['V','X'],
  },

  // ── UAT & Pilot Run（Phase E — 用户验收测试与试运行）──────────────────────
  /** UAT 问题反馈 / 培训记录 / 验收清单 / 试运行 / 上线准备度 / 试运行执行中心 */
  MENU_UAT: {
    ROLE_ADMIN:          ['V','C','E','D','A','X'],
    ROLE_SYSOPS:         ['V','C','E','A'],
    ROLE_CEO:            ['V','X'],
    ROLE_FIN_CFO:        ['V','X'],
    ROLE_HQ_FINANCE:     ['V'],
    ROLE_SALES_MGR:      ['V','C','E'],
    ROLE_WORKFLOW_ADMIN: ['V','C','E'],
    ROLE_AUDITOR:        ['V','X'],
    ROLE_PILOT_MANAGER:  ['V','C','E'],
  },

  // ── Role Runtime Phase A — 新增角色权限矩阵 ────────────────────────────────
  // 新角色：事业群总经理 / 场区经理 / HR经理 / 销售经理
  // 这些角色在 sys_role 中注册后，此处定义其菜单访问权限

  /** 凤凰农业事业群总经理 — BU-AGRI 最高管理角色 */
  MENU_BU_AGRI_OVERVIEW: {
    ROLE_ADMIN:      ['V','C','E','D','A','X'],
    ROLE_BU_AGRI_GM: ['V','C','E','A','X'],
    ROLE_CEO:        ['V','X'],
  },

  /** 凤凰食品事业群总经理 — BU-FOOD 最高管理角色 */
  MENU_BU_FOOD_OVERVIEW: {
    ROLE_ADMIN:      ['V','C','E','D','A','X'],
    ROLE_BU_FOOD_GM: ['V','C','E','A','X'],
    ROLE_CEO:        ['V','X'],
  },

  // ── 生产链路收口 Phase 1 — 权限收口（6 个新权限码）────────────────────────
  // 依据：docs/production-chain-convergence-phase1.md §7
  // 核心：包装完成入库(MENU_PKG_COMPLETE_INVENTORY) 与 手工库存入库(MENU_INV_MANUAL_INBOUND) 彻底分离。

  /** 集蛋记录（生产管理：只记生产事实/集蛋，不形成可售库存） */
  MENU_PROD_COLLECTION: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_FARM_MGR:    ['V','C','E'],
    ROLE_FARMER:      ['V','C'],
    ROLE_PKG_MGR:     ['V','C','E'],
    ROLE_FACTORY_MGR: ['V','C','E'],
    ROLE_CEO:         ['V','X'],
  },

  /** 包装作业（包装作业中心：分级/包装） */
  MENU_PKG_PACKAGING: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_PKG_MGR:     ['V','C','E','A'],
    ROLE_PKG_OP:      ['V','C'],
    ROLE_FACTORY_MGR: ['V','C','E'],
    ROLE_FARM_MGR:    ['V','C','E'],
    ROLE_CEO:         ['V','X'],
  },

  /** 包装完成入库 —— 唯一库存入口（只授包装主管 + 场区经理 + 管理员；与手工入库分离） */
  MENU_PKG_COMPLETE_INVENTORY: {
    ROLE_ADMIN:       ['V','C','E','A','X'],
    ROLE_PKG_MGR:     ['V','C'],
    ROLE_FACTORY_MGR: ['V','C'],
  },

  /** 库存批次（库存管理：成品批次查询/管理） */
  MENU_INV_BATCH: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_WMS_MGR:     ['V','C','E'],
    ROLE_WMS_OP:      ['V'],
    ROLE_SALES_MGR:   ['V'],
    ROLE_CEO:         ['V','X'],
    ROLE_AUDITOR:     ['V','X'],
  },

  /** 库存流水（库存台账，只读为主） */
  MENU_INV_LEDGER: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_WMS_MGR:     ['V','X'],
    ROLE_FIN_ACCT:    ['V','X'],
    ROLE_AUDITOR:     ['V','X'],
    ROLE_CEO:         ['V','X'],
  },

  /** 手工库存入库 —— 仅采购/调拨/手工调整（禁止录包装成品；与包装完成入库分离） */
  MENU_INV_MANUAL_INBOUND: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_WMS_MGR:     ['V','C','E'],
    ROLE_WMS_OP:      ['V','C'],
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
