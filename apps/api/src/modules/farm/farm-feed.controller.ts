import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FarmFeedService } from './farm-feed.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('api/farm/feed')
@UseGuards(AuthGuard('jwt'))
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
  @UseGuards(RolesGuard)
  @Roles('ROLE_ADMIN', 'ROLE_FARM_MGR', 'ROLE_VET', 'ROLE_BREEDER')
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

  /** GET /api/farm/feed/houses */
  @Get('houses')
  async getHouses() {
    return this.feedService.getHouses();
  }
}
