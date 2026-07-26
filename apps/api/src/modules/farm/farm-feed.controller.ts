import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { FarmFeedService } from './farm-feed.service';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';
import { deriveOrgScope } from './farm.service';

// [Fix Pack 1 — HIGH-2] 替换 AuthGuard → MenuGuard，添加 RequireMenu
// [Phase R1 — HIGH-3] 添加 DataScopeGuard
@Controller('api/farm/feed')
@UseGuards(MenuGuard, DataScopeGuard)
@RequireMenu('MENU_BREEDING', 'V')
export class FarmFeedController {
  constructor(private readonly feedService: FarmFeedService) {}

  /** GET /api/farm/feed/ledger?date=2026-05-16 */
  @Get('ledger')
  async getLedger(@Query('date') date: string) {
    const d = date || new Date().toISOString().slice(0, 10);
    return this.feedService.getLedger(d);
  }

  /** POST /api/farm/feed/ledger  body: { date, items: [...] } */
  @Post('ledger')
  @RequireMenu('MENU_BREEDING', 'E')
  async saveLedger(@Body() body: any, @Req() req: any) {
    const { date } = body;
    // PC feed ledger posts `rows`; retain `items` for mobile/legacy callers.
    const items = Array.isArray(body.items) ? body.items : body.rows;
    if (!date || !Array.isArray(items)) return { code: 400, msg: '缺少 date 或 items' };
    const operator = req.user?.username || req.user?.sub || 'unknown';
    return this.feedService.saveLedger(date, items, operator);
  }

  /** GET /api/farm/feed/ledger-range?start=...&end=... */
  @Get('ledger-range')
  async getLedgerRange(@Query('start') start: string, @Query('end') end: string) {
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
    return this.feedService.getHouses(scope.farmCodes, scope.siteCodes);
  }

  /**
   * POST /api/farm/feed/houses — G109 场长新建本场鸡舍
   *   farm/site/company 由场长 scope 自动派生（不可指定农场）。需 MENU_FARM_DATA:E。
   */
  @Post('houses')
  @RequireMenu('MENU_FARM_DATA', 'E')
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
