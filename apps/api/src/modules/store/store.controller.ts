import { Controller, Post, Put, Get, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { StoreService } from './store.service';
import { StoreDailyCloseEntity } from './entities/store-daily-close.entity';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';

// [Fix Pack 1 — HIGH-3] 添加 DataScopeGuard
@Controller('api/v3/store')
@UseGuards(MenuGuard, DataScopeGuard)
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Post('daily-close')
  @RequireMenu('MENU_FIN_CLOSE', 'C') // 结账操作映射到财务结算相关的菜单权限
  async submitDailyClose(@Body() dto: Partial<StoreDailyCloseEntity>) {
    return await this.storeService.submitDailyClose(dto);
  }

  @Put('daily-close/:id')
  @RequireMenu('MENU_FIN_CLOSE', 'E')
  async updateDailyClose(@Param('id') id: number, @Body() dto: Partial<StoreDailyCloseEntity>) {
    return await this.storeService.updateDailyClose(id, dto);
  }

  @Post('daily-close/:id/close')
  @RequireMenu('MENU_FIN_CLOSE', 'A') // 提交给财务，需要较高权限或者复核权限
  async closeStoreDay(@Param('id') id: number) {
    return await this.storeService.closeStoreDay(id);
  }

  // ─── V2 fidelity: 门店日结双账联动 ────────────────────────────────────────
  // 来源：_archive/phoenix-backend-v2-sqlite/src/routes/dailyClose.js
  // 路径：/api/v3/store/daily-close-v2/* (与现有 entity-based 路由共存)

  /** 日结预览 — 聚合 pos_sales */
  @Get('daily-close-v2/preview')
  @RequireMenu('MENU_FIN_CLOSE', 'V')
  async previewV2DailyClose(@Query() query: any, @Req() req: any) {
    return await this.storeService.previewDailyClose(query, req.user);
  }

  /** 日结提交 — 原子事务 + acc_ledger + fin_transactions */
  @Post('daily-close-v2/submit')
  @RequireMenu('MENU_FIN_CLOSE', 'C')
  async submitV2DailyClose(@Body() body: any, @Req() req: any) {
    return await this.storeService.submitV2DailyClose(body, req.user);
  }

  /** 日结历史 */
  @Get('daily-close-v2')
  @RequireMenu('MENU_FIN_CLOSE', 'V')
  async listV2DailyClose(@Query() query: any, @Req() req: any) {
    return await this.storeService.listDailyClose(query, req.user);
  }
}
