import { Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ROLE_MENU_MATRIX } from './rbac.matrix';

/**
 * MenuRegistry — menu_code 注册查询（G5-A++ 取代 rbac.matrix.ts 的 isMenuRegistered）
 * ════════════════════════════════════════════════════════════════════════
 * 静态单例 + 启动期 hydrate 模式（避免改 AppModule providers）。
 *
 * 用法：
 *   - main.ts 启动后调用 `await hydrateMenuRegistry(dataSource.manager)`
 *   - MenuGuard 直接 `import { isMenuRegistered } from './menu-registry.service'`
 *
 * 数据源优先级：
 *   1. sys_menu 表（业务方维护的真相）
 *   2. rbac.matrix.ts keys（兜底，开发本机/CI 测试库）
 *
 * 业务方在主数据中心新增菜单后调用 `await rehydrate()` 或重启 API 服务。
 */

const logger = new Logger('MenuRegistry');

let registered: Set<string> = new Set(Object.keys(ROLE_MENU_MATRIX));
let lastLoadedAt = 0;
let source: 'sys_menu' | 'matrix-fallback' = 'matrix-fallback';

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
    registered = new Set<string>(Object.keys(ROLE_MENU_MATRIX));
    lastLoadedAt = Date.now();
    source = 'matrix-fallback';
    logger.warn(
      `sys_menu 读取失败 (${(err as Error).message}) — 回退到 rbac.matrix.ts (${registered.size} keys)`,
    );
  }
}

/** MenuGuard 调用：判断 menu_code 是否注册（已知合法菜单） */
export function isMenuRegistered(menuCode: string): boolean {
  return registered.has(menuCode);
}

/** 调试 / 监控用 */
export function getMenuRegistryStats(): { size: number; source: string; lastLoadedAt: number } {
  return { size: registered.size, source, lastLoadedAt };
}
