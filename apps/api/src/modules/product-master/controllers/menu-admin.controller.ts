import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Post, Get, Req, UseGuards } from '@nestjs/common';
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

  @Post('egg-source-write-control')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY', 'E')
  async setEggSourceWriteControl(@Req() req: any,
    @Body() body: { expectedEnabled:boolean; enabled:boolean; reason:string }) {
    const id = String(req.user?.userId??'');
    if (!/^[1-9][0-9]{0,18}$/.test(id) || req.user?.impersonatedBy) throw new ForbiddenException('须由实名系统管理员操作');
    const reason = typeof body?.reason==='string' ? body.reason.trim() : '';
    if (!reason || reason.length>500 || typeof body?.enabled!=='boolean' || typeof body?.expectedEnabled!=='boolean'
      || body.enabled===body.expectedEnabled) throw new BadRequestException('须提供当前状态、目标状态和变更依据');
    return this.em.transaction(async manager=>{
      const [account] = await manager.query(`SELECT u.perms_version FROM sys_user u JOIN sys_user_role ur USING (user_id)
        JOIN sys_role r USING (role_id) WHERE u.user_id=$1 AND u.status=1 AND COALESCE(ur.is_visible,true)
        AND r.role_code='ROLE_ADMIN' AND r.status='ACTIVE' FOR SHARE OF u,ur,r`, [id]);
      if (!account || !Number.isSafeInteger(req.user?.perms_version) || req.user.perms_version!==Number(account.perms_version)) {
        throw new ForbiddenException('须由重新登录的有效系统管理员操作');
      }
      const rows = await manager.query(`WITH changed AS (UPDATE md_egg_source_write_control
        SET writes_enabled=$1,ever_enabled=ever_enabled OR $1,changed_by=$2,change_reason=$3,changed_at=clock_timestamp()
        WHERE id=1 AND writes_enabled=$4 RETURNING writes_enabled,changed_at,changed_by,change_reason)
        SELECT * FROM changed`,[body.enabled,id,reason,body.expectedEnabled]);
      if (!rows.length) throw new ConflictException('蛋品来源写开关状态已变化');
      return { code:200,data:rows[0] };
    });
  }

  /** POST /api/sys/menu-registry/reload — 强制重新从 sys_menu 加载 menu_codes */
  @Post('reload')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY', 'E')
  async reload() {
    await rehydrate(this.em);
    return { code: 200, data: getMenuRegistryStats(), message: 'menu-registry reloaded' };
  }
}
