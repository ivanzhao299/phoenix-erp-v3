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
    ROLE_BREEDER:     ['V','C','E'],
    ROLE_VET:         ['V','C','E'],
    ROLE_CEO:         ['V','X'],
    ROLE_REGION_MGR:  ['V','X'],
  },
  MENU_FARM_DATA: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_FARM_MGR:    ['V','C','E','D','A','X'],
    ROLE_BREEDER:     ['V','C','E'],
    ROLE_VET:         ['V'],
    ROLE_CEO:         ['V','X'],
    ROLE_REGION_MGR:  ['V','X'],
  },
  MENU_IOT: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_FARM_MGR:    ['V','E','X'],
    ROLE_BREEDER:     ['V'],
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
    ROLE_BREEDER:     ['V','C'],
    ROLE_CASHIER:     ['V'],
  },

  // ── 采购 ──────────────────────────────────────────────────────────────────
  MENU_PROCUREMENT: {
    ROLE_ADMIN:       ['V','C','E','D','A','X'],
    ROLE_PRC_BUYER:   ['V','C','E','D','X'],
    ROLE_FARM_MGR:    ['V','C'],
    ROLE_FIN_ACCT:    ['V','X'],
    ROLE_FIN_CFO:     ['V','A','X'],
    ROLE_CEO:         ['V','A','X'],
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
    ROLE_BREEDER:     ['V','C','E'],
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
    ROLE_LOGISTICS_MGR:['V','C','E','D','X'],
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
};

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
    // 菜单未在矩阵中注册 → 默认仅需登录即可访问（宽松策略）
    return true;
  }
  for (const role of roles) {
    const perms = menuPerms[role];
    if (perms && (perms.includes(requiredPerm) || perms.includes('*'))) {
      return true;
    }
  }
  return false;
}
