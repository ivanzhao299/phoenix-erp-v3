import { ConflictException, Controller, Post, Get, UseGuards } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import {
  rehydrate,
  getMenuRegistryStats,
} from '../../../common/guards/menu-registry.service';

/**
 * MenuAdminController — menu-registry 管理（G6 收紧 · 2026-06-06）
 * ════════════════════════════════════════════════════════════════════════
 * 业务方在主数据中心新增/启停菜单后，可调 reload 端点立即生效，
 * 无需重启 API 服务。
 */
@Controller('api/sys/menu-registry')
@UseGuards(MenuGuard)
export class MenuAdminController {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  /** GET /api/sys/menu-registry/stats — 调试用，查看当前内存 Set 大小与数据源 */
  @Get('stats')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY', 'V')
  stats() {
    return { code: 200, data: getMenuRegistryStats() };
  }

  /** Explicit catalog install after pilot approval. Does not grant a role, change a period or enable inventory. */
  @Post('install-production-finance-review')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY', 'E')
  async installProductionFinanceReview() {
    const menuCode = 'MENU_PROD_FIN_REVIEW';
    const route = '/breeding/production-finance-review';
    const installed = await this.em.transaction(async m => {
      await m.query("SELECT pg_advisory_xact_lock(hashtext('menu-registry-install'),hashtext($1))",[menuCode]);
      const [existing] = await m.query('SELECT route,domain FROM sys_menu WHERE menu_code=$1',[menuCode]);
      if (existing) {
        if (existing.route !== route || existing.domain !== 'FARM') throw new ConflictException('已有菜单登记与生产财务核签不一致');
        return false;
      }
      await m.query(`INSERT INTO sys_menu(menu_code,menu_name_zh,menu_name_lo,domain,sort_order,route)
        VALUES($1,'生产财务核签','ກວດການເງິນການຜະລິດ','FARM',18,$2)`,[menuCode,route]);
      return true;
    });
    await rehydrate(this.em);
    return { menuCode, installed };
  }

  /** POST /api/sys/menu-registry/reload — 强制重新从 sys_menu 加载 menu_codes */
  @Post('reload')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY', 'E')
  async reload() {
    await rehydrate(this.em);
    return { code: 200, data: getMenuRegistryStats(), message: 'menu-registry reloaded' };
  }
}
