/**
 * Phoenix ERP V3 — Pilot Run Dashboard Controller
 * Pilot Run 1 Execution Center
 *
 * 端点：
 *   GET  /api/uat/pilot-runs/:id/dashboard       — 实时 Dashboard
 *   GET  /api/uat/pilot-runs/:id/score            — 当前评分（快速）
 *   POST /api/uat/pilot-runs/:id/daily-report     — 手动触发日报生成
 *   GET  /api/uat/pilot-runs/:id/daily-reports    — 日报历史列表
 */
import {
  Controller, Get, Post, Param, Query, Body, UseGuards,
  ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { PilotRunDashboardService } from '../services/pilot-run-dashboard.service';

@Controller('api/uat/pilot-runs')
@UseGuards(AuthGuard('jwt'), MenuGuard, DataScopeGuard)
export class PilotRunDashboardController {
  constructor(private readonly dashboardService: PilotRunDashboardService) {}

  /** 实时 Dashboard（所有 KPI + 评分 + 趋势 + 上线准备度） */
  @Get(':id/dashboard')
  @RequireMenu('MENU_UAT', 'V')
  async getDashboard(@Param('id', ParseIntPipe) id: number) {
    return this.dashboardService.getDashboard(id);
  }

  /** 当前评分快速接口（轻量，仅返回分数与状态） */
  @Get(':id/score')
  @RequireMenu('MENU_UAT', 'V')
  async getScore(@Param('id', ParseIntPipe) id: number) {
    return this.dashboardService.getCurrentScore(id);
  }

  /** 手动触发日报生成（可指定日期，默认今日） */
  @Post(':id/daily-report')
  @RequireMenu('MENU_UAT', 'C')
  async generateDailyReport(
    @Param('id', ParseIntPipe) id: number,
    @Body('date') date?: string,
  ) {
    return this.dashboardService.generateDailyReport(id, date);
  }

  /** 日报历史列表（分页，默认最近 14 天） */
  @Get(':id/daily-reports')
  @RequireMenu('MENU_UAT', 'V')
  async getDailyReports(
    @Param('id', ParseIntPipe) id:                                   number,
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page:   number,
    @Query('limit', new DefaultValuePipe(14), ParseIntPipe) limit:  number,
  ) {
    return this.dashboardService.getDailyReports(id, page, limit);
  }
}
