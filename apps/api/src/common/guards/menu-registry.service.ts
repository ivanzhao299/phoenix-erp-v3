import { Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';

/**
 * MenuRegistry — menu_code 注册查询（G6 收紧 · 2026-06-06）
 * ════════════════════════════════════════════════════════════════════════
 * 唯一权威：sys_menu DB 表，启动期一次性加载到内存 Set。
 *
 * 用法：
 *   - main.ts bootstrap 后：await hydrateMenuRegistry(dataSource.manager)
 *   - MenuGuard：import { isMenuRegistered } from './menu-registry.service'
 *   - 业务方加菜单后：调用 await rehydrate(em) 或 重启 API
 *
 * 兜底（仅 CI 测试库 / 本地首次部署）：
 *   sys_menu 表不存在或为空时，用 FALLBACK_MENU_CODES（内置 115 个历史 menu code 列表）。
 *   该列表是 2026-06-06 G6 收紧前 rbac.matrix.ts 的提取 snapshot，
 *   仅作"未注册菜单严格防穿越"用，不参与权限判定。
 */

const logger = new Logger('MenuRegistry');

// G6 fallback：rbac.matrix.ts 已删除，menu_codes 列表内联到此（snapshot 2026-06-06）。
// 业务方在主数据中心新增菜单时无需更新此列表；它仅是 sys_menu 不可用时的最后防穿越屏障。
const FALLBACK_MENU_CODES: readonly string[] = [
  'MENU_BREEDING', 'MENU_FARM_DATA', 'MENU_FARM_DAILY', 'MENU_FARM_MASTER', 'MENU_IOT',
  'MENU_WMS_VIEW', 'MENU_WMS_INOUT', 'MENU_WMS_MASTER', 'MENU_INVENTORY',
  'MENU_WMS', 'MENU_WMS_INBOUND', 'MENU_WMS_OUTBOUND', 'MENU_PDA',
  'MENU_PROCUREMENT', 'MENU_PRC2', 'MENU_PRC2_MASTER', 'MENU_PRC2_PAYMENT',
  'MENU_PRC2_FUND', 'MENU_PRC2_ORDER', 'MENU_PRC2_INIT', 'MENU_PRC2_DASHBOARD',
  'MENU_PRC2_TASK', 'MENU_PRC2_RECEIPT', 'MENU_PRC2_SHIPMENT',  // G84 兜底态防 403（sys_menu 已 seed，此处补齐 fallback 一致性）
  'MENU_INV_LEDGER', 'MENU_INV_BATCH', 'MENU_INV_DAILY',
  'MENU_INV_MANUAL_INBOUND', 'MENU_INV_TRANSFER', 'MENU_INV_ALLOC',
  'MENU_INV_VARIANCE', 'MENU_PKG_ANOMALY', 'MENU_PROD_COLLECTION',
  'MENU_PROD_INBOUND', 'MENU_PKG_HANDOVER', 'MENU_PKG_PRESORT',
  'MENU_PKG_RECEIVE', 'MENU_PKG_GRADING', 'MENU_PKG_PACKING',
  'MENU_PKG_LABEL', 'MENU_PKG_INBOUND', 'MENU_PKG_DASHBOARD', 'MENU_PKG_OP',
  'MENU_PKG_MGR', 'MENU_PACKAGING', 'MENU_QA_OP', 'MENU_QA_MGR',
  'MENU_QA_DASHBOARD', 'MENU_QA_INSPECTION', 'MENU_QA_HACCP', 'MENU_QA_NC',
  'MENU_QA_STATS', 'MENU_FARM_VET', 'MENU_FARM_QA', 'MENU_FARM_FEED',
  'MENU_DEVICE_MONITOR', 'MENU_DEVICE_ALERTS', 'MENU_DEVICE_OPS',
  'MENU_FIN2', 'MENU_FIN2_DASHBOARD', 'MENU_FIN2_CASH', 'MENU_FIN2_AR',
  'MENU_FIN2_AR_LEDGER',  // G41 应收总账（刘杰）
  'MENU_FIN2_AP', 'MENU_FIN2_EXPENSE', 'MENU_FIN2_REIMBURSEMENT',
  'MENU_FIN2_SHAREHOLDER', 'MENU_FIN2_REPORT', 'MENU_FIN2_BUDGET',
  'MENU_FIN2_TAX', 'MENU_FIN2_PRC_PAYMENT', 'MENU_FIN2_ORDER_RECEIPT',
  'MENU_ORDER_FIN', 'MENU_SALES2', 'MENU_SALES2_DASHBOARD',
  'MENU_SALES2_ORDER', 'MENU_SALES2_PRICE', 'MENU_SALES2_DELIVERY',
  'MENU_SALES2_RETURN', 'MENU_B2B_SALE', 'MENU_STORE_MGR', 'MENU_STORE_POS',
  'MENU_LOGISTICS', 'MENU_LOGISTICS_MASTER', 'MENU_CRM', 'MENU_WORKFLOW',
  'MENU_APPROVAL', 'MENU_DASHBOARD', 'MENU_ANALYTICS', 'MENU_AGRI_OVERVIEW',
  'MENU_FOOD_OVERVIEW', 'MENU_BU_AGRI_OVERVIEW', 'MENU_BU_FOOD_OVERVIEW',
  'MENU_GROUP_OVERVIEW', 'MENU_MASTER', 'MENU_MASTER_GRADE',
  'MENU_MASTER_PRODUCT', 'MENU_MASTER_PACKAGING', 'MENU_MASTER_SKU',
  'MENU_MD_CENTER', 'MENU_MD_DICT_CENTER', 'MENU_MD_AUDIT', 'MENU_MD_QUALITY',
  // G56-B 主数据项级原子：每实体专属码
  'MENU_MD_CUSTOMER', 'MENU_MD_SUPPLIER', 'MENU_MD_PROJECT', 'MENU_MD_PRODUCT',
  'MENU_MD_GRADE', 'MENU_MD_PACKAGING', 'MENU_MD_SKU', 'MENU_MD_WAREHOUSE',
  'MENU_MD_STORE', 'MENU_MD_DRIVER', 'MENU_MD_VEHICLE', 'MENU_MD_CASH_ACCOUNT',
  'MENU_MD_MATERIAL',  // G86 采购物料档案
  'MENU_MD_HISTORY', 'MENU_MD_RUNTIME', 'MENU_SYS_ORG', 'MENU_SYS_USER',
  'MENU_SYS_ROLE', 'MENU_SYS_MENU', 'MENU_SYS_PERM', 'MENU_SYS_DICT',
  'MENU_SYS_LOG', 'MENU_SYS_CONFIG', 'MENU_SYS_NOTIFY', 'MENU_HR_USER',
  'MENU_PROD_RUNTIME', 'MENU_PROD_INVENTORY', 'MENU_TRACEABILITY',
  'MENU_ORDER_WH', 'MENU_ORDER_DISPATCH',
];

let registered: Set<string> = new Set(FALLBACK_MENU_CODES);
let lastLoadedAt = 0;
let source: 'sys_menu' | 'fallback-snapshot' = 'fallback-snapshot';

/** 启动期或手动 reload 时调用，从 sys_menu 加载所有 menu_code */
export async function hydrateMenuRegistry(em: EntityManager): Promise<void> {
  try {
    const rows: Array<{ menu_code: string }> = await em.query(
      `SELECT menu_code FROM sys_menu WHERE menu_code IS NOT NULL`,
    );
    if (rows.length === 0) throw new Error('sys_menu empty');
    registered = new Set<string>(rows.map(r => r.menu_code));
    lastLoadedAt = Date.now();
    source = 'sys_menu';
    logger.log(`Hydrated ${registered.size} menu_codes from sys_menu`);
  } catch (err) {
    registered = new Set<string>(FALLBACK_MENU_CODES);
    lastLoadedAt = Date.now();
    source = 'fallback-snapshot';
    logger.warn(
      `sys_menu 不可用 (${(err as Error).message}) → 回退到 G6 内置 snapshot (${registered.size} keys)`,
    );
  }
}

/** 业务方加菜单后手动触发重新加载 */
export const rehydrate = hydrateMenuRegistry;

/** MenuGuard 调用：判断 menu_code 是否合法注册 */
export function isMenuRegistered(menuCode: string): boolean {
  return registered.has(menuCode);
}

/** 监控 / 调试：返回当前状态 */
export function getMenuRegistryStats(): {
  size: number;
  source: typeof source;
  lastLoadedAt: number;
} {
  return { size: registered.size, source, lastLoadedAt };
}
