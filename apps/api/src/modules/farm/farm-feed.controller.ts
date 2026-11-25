import { Controller, Get, Post, Body, Query, UseGuards, Req, ForbiddenException, ConflictException, Optional } from '@nestjs/common';
import { FarmFeedService } from './farm-feed.service';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';
import { hasPerm } from '../../auth/permissions.util';
import { DataScopeService } from '../org/services/data-scope.service';
import { deriveOrgScope } from './farm.service';

function scopedFeedMode() {
  const scope = process.env.FARM_FEED_SCOPED_WRITES?.trim() ?? '';
  if (scope === '*') return { phase: 'ACTIVE', scope } as const;
  if (/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(scope)) return { phase: 'PILOT', scope } as const;
  return { phase: 'LEGACY', scope: '' } as const;
}

function scopeCanWrite(mode: ReturnType<typeof scopedFeedMode>, company: unknown, farm: unknown) {
  return mode.phase === 'ACTIVE' ||
    (mode.phase === 'PILOT' && typeof company === 'string' && typeof farm === 'string' && company + '/' + farm === mode.scope);
}

// [Fix Pack 1 — HIGH-2] 替换 AuthGuard → MenuGuard，添加 RequireMenu
// [Phase R1 — HIGH-3] 添加 DataScopeGuard
@Controller('api/farm/feed')
@UseGuards(MenuGuard, DataScopeGuard)
@RequireMenu('MENU_BREEDING', 'V')
export class FarmFeedController {
  constructor(private readonly feedService: FarmFeedService, @Optional() private readonly dataScopes?: DataScopeService) {}

  private warehouseScope(req: any) {
    const user = req.user;
    const viewMenu = ['MENU_WMS_ISSUE', 'MENU_WMS_INOUT', 'MENU_WMS_VIEW'].find(menu => hasPerm(user?.permissions,menu,'V'));
    if (!this.dataScopes || !user || !viewMenu) return { isGlobal: false, allowedWarehouseCodes: [] };
    const userId = String(user.userId ?? user.id ?? user.sub ?? '');
    if (!userId) return { isGlobal: false, allowedWarehouseCodes: [] };
    return this.dataScopes.resolve(userId, user.roles ?? (user.role ? [user.role] : []), viewMenu, user.perms_version);
  }

  @Get('scoped/rollout')
  scopedRollout() {
    return { code: 200, data: { phase: scopedFeedMode().phase } };
  }

  @Get('scoped/farms')
  async scopedFarms(@Req() req: any) {
    const mode = scopedFeedMode();
    const farms = await this.feedService.scopedFarms(req.dataScope);
    return { code: 200, data: farms.map(farm => ({
      ...farm, canWrite: scopeCanWrite(mode, farm.company_code, farm.farm_code),
    })) };
  }

  @Get('scoped/day')
  async scopedDay(@Query() query: Record<string, unknown>, @Req() req: any) {
    return { code: 200, data: await this.feedService.scopedDay(req.dataScope, query, await this.warehouseScope(req)) };
  }

  @Post('scoped/day')
  @RequireMenu('MENU_BREEDING','E')
  async saveScopedDay(@Body() body: Record<string, unknown>, @Req() req: any) {
    if (!scopeCanWrite(scopedFeedMode(), body?.companyCode, body?.farmCode)) {
      throw new ConflictException('该农场的新版现场饲料账尚未开放登记');
    }
    const operator = String(req.user?.userId ?? req.user?.username ?? req.user?.sub ?? 'unknown');
    return { code: 200, data: await this.feedService.saveScopedDay(req.dataScope, body ?? {}, operator, await this.warehouseScope(req)) };
  }

  @Get('ledger')
  async getLedger(@Query('date') date: string, @Req() req: any) {
    const legacy = scopedFeedMode().phase !== 'ACTIVE';
    if (!legacy && !req.dataScope?.isGlobal) throw new ForbiddenException('旧饲料账暂无可核验的场归属，请使用新版按场查询');
    return this.feedService.getLedger(date || new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Singapore' }).format(new Date()), legacy);
  }

  @Post('ledger')
  @RequireMenu('MENU_BREEDING', 'E')
  async saveLedger(@Body() body: Record<string, unknown>, @Req() req: any) {
    if (scopedFeedMode().phase === 'ACTIVE') throw new ConflictException('旧饲料账写入已关闭，请刷新至按场记账页面');
    const items = Array.isArray(body?.items) ? body.items : body?.rows;
    if (typeof body?.date !== 'string' || !body.date || !Array.isArray(items)) return { code: 400, msg: '缺少 date 或 items' };
    const operator = String(req.user?.username ?? req.user?.sub ?? 'unknown');
    return this.feedService.saveLedger(body.date, items, operator);
  }

  @Get('ledger-range')
  async getLedgerRange(@Query('start') start: string, @Query('end') end: string, @Req() req: any) {
    if (scopedFeedMode().phase === 'ACTIVE' && !req.dataScope?.isGlobal) throw new ForbiddenException('旧饲料账暂无可核验的场归属');
    if (!start || !end) return { code: 400, msg: '缺少 start/end' };
    return this.feedService.getLedgerRange(start, end);
  }

  /** GET /api/farm/feed/houses — 返回当前用户所属农场/场区的栋舍列表
   *   G16-2：storeCode 可能是 LPH_*（farm）或 SITE-*（site），过去一律
   *           当 farm_code 比较 → SITE 用户拿不到任何鸡舍，fallback 写错。
   */
  @Get('houses')
  async getHouses(@Req() req: any) {
    const scope = deriveOrgScope(req);
    if (scope.isGlobal) return this.feedService.getHouses();
    const farmCodes = scope.farmCodes ?? [];
    const siteCodes = scope.siteCodes ?? [];
    const companyCodes = scope.companyCodes ?? [];
    if (farmCodes.length === 0 && siteCodes.length === 0 && companyCodes.length === 0) {
      return { code: 200, data: [] };
    }
    return this.feedService.getHouses(farmCodes, siteCodes, companyCodes);
  }

  /**
   * POST /api/farm/feed/houses — G109 场长新建本场鸡舍
   *   farm/site/company 由场长 scope 自动派生（不可指定农场）。
   *   新建动作使用 C；优先使用养殖主档权限，兼容已有的养殖数据创建权限。
   */
  @Post('houses')
  @RequireMenu('MENU_FARM_MASTER', 'C', ['MENU_FARM_DATA'])
  async createHouse(@Body() body: any, @Req() req: any) {
    try {
      return await this.feedService.createHouse(body, deriveOrgScope(req), {
        userId: req.user?.userId ?? req.user?.id ?? req.user?.sub,
        roles: Array.isArray(req.user?.roles) ? req.user.roles : [],
      });
    } catch (e: any) {
      return { code: 400, msg: e?.message || '建鸡舍失败' };
    }
  }
}
