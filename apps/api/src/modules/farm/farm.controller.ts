import { Controller, Post, Put, Get, Body, Param, Query } from '@nestjs/common';
import { FarmService } from './farm.service';

/**
 * FarmController — 养殖中心 API
 *
 * A6 修正：移除 3 个死代码路由（依赖 FarmDailyEntity 指向不存在的 biz_farm_daily 表）
 *   - POST /daily         (createDailyRecord)   — 死代码
 *   - PUT  /daily/:id     (updateDailyRecord)   — 死代码
 *   - GET  /daily         (listDailyRecords)    — 死代码
 *   - GET  /overview      (空骨架，无实际逻辑)  — 死代码
 * 保留两个真实在用的路由：POST/PUT daily-logs
 */
@Controller('api/v3/farm')
export class FarmController {
  constructor(private readonly farmService: FarmService) {}

  @Post('daily-logs')
  async submitBreedingDailyLog(@Body() body: any) {
    return await this.farmService.submitBreedingDailyLog(body);
  }

  @Put('daily-logs/:id')
  async updateBreedingDailyLog(@Param('id') id: number, @Body() body: any) {
    return await this.farmService.updateBreedingDailyLog(id, body);
  }

  @Get('daily-hen-report')
  async getDailyHenReport(@Query('date') date: string) {
    const d = date || new Date().toISOString().slice(0, 10);
    return await this.farmService.getDailyHenReport(d);
  }

  @Get('trend')
  async getFarmTrend(@Query('days') days: string) {
    return await this.farmService.getFarmTrend(Number(days) || 7);
  }
}
