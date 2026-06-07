import { Controller, Post, Put, Get, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { FarmService, OrgScope, deriveOrgScope } from './farm.service';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';

// [Fix Pack 1 — HIGH-2] 替换 AuthGuard → MenuGuard，添加 RequireMenu
// [Phase R1 — HIGH-3] 添加 DataScopeGuard
@Controller('api/v3/farm')
@UseGuards(MenuGuard, DataScopeGuard)
@RequireMenu('MENU_FARM_DATA', 'V')
export class FarmController {
  constructor(private readonly farmService: FarmService) {}

  /** 从 JWT 派生组织作用域 — G16-2 改用 deriveOrgScope，按前缀区分 farmCode/siteCode */
  private getScope(req: any): OrgScope { return deriveOrgScope(req); }

  // 2026-06-06 调整：日报录入应归 MENU_FARM_DAILY（业务字面对齐），不归
  // MENU_FARM_DATA（后者是养殖场/鸡舍/鸡群主数据维护权，业务录入用户不该有 E）。
  @Post('daily-logs')
  @RequireMenu('MENU_FARM_DAILY', 'E')
  async submitBreedingDailyLog(@Body() body: any, @Req() req: any) {
    return await this.farmService.submitBreedingDailyLog(body, this.getScope(req));
  }

  @Put('daily-logs/:id')
  @RequireMenu('MENU_FARM_DAILY', 'E')
  async updateBreedingDailyLog(@Param('id') id: number, @Body() body: any) {
    return await this.farmService.updateBreedingDailyLog(id, body);
  }

  /**
   * GET /api/v3/farm/daily-logs/eggs-breakdown?date=&houseCode=
   * 拉指定日期+鸡舍的"按 9 档分解"产蛋数据，供日产蛋入库页"从今日日报预填"按钮使用。
   * 返回多班次聚合后的 grade → qty 映射（含 saleable + 异常档）。
   */
  @Get('daily-logs/eggs-breakdown')
  @RequireMenu('MENU_FARM_DAILY', 'V')
  async getEggsBreakdown(
    @Query('date') date: string,
    @Query('houseCode') houseCode: string,
    @Req() req: any,
  ) {
    return await this.farmService.getEggsBreakdown(date, houseCode, this.getScope(req));
  }

  @Get('daily-hen-report')
  async getDailyHenReport(@Query('date') date: string, @Req() req: any) {
    const d = date || new Date().toISOString().slice(0, 10);
    return await this.farmService.getDailyHenReport(d, this.getScope(req));
  }

  @Get('trend')
  async getFarmTrend(@Query('days') days: string, @Req() req: any) {
    return await this.farmService.getFarmTrend(Number(days) || 7, this.getScope(req));
  }
}
