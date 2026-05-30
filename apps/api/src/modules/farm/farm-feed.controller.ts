import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { FarmFeedService } from './farm-feed.service';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';

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
    const { date, items } = body;
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

  /** GET /api/farm/feed/houses — 返回当前用户所属农场的栋舍列表 */
  @Get('houses')
  async getHouses(@Req() req: any) {
    const storeCode: string | undefined = req.user?.storeCode;
    const isGlobal =
      !storeCode ||
      storeCode === 'ALL' ||
      (req.user?.permissions || []).includes('*') ||
      req.user?.username === 'admin';
    return this.feedService.getHouses(isGlobal ? undefined : storeCode);
  }
}
