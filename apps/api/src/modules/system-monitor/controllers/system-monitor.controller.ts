/**
 * Phoenix ERP V3 — 系统监控 Controller
 * Production Stabilization Phase 1
 *
 * 路由：/api/system/monitor/...
 * 安全：所有接口仅 ADMIN / SYSOPS 可访问（MENU_SYS_MONITOR V 权限）
 */
import {
  Controller, Get, Query, UseGuards,
  DefaultValuePipe, ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { SystemMonitorService } from '../services/system-monitor.service';

@Controller('api/system/monitor')
@UseGuards(AuthGuard('jwt'), MenuGuard)
export class SystemMonitorController {
  constructor(private readonly monitorService: SystemMonitorService) {}

  /** 系统整体健康摘要 */
  @Get('health')
  @RequireMenu('MENU_SYS_MONITOR', 'V')
  async getHealth() {
    return this.monitorService.getHealthSummary();
  }

  /** 慢接口统计（最近 1 小时） */
  @Get('slow-apis')
  @RequireMenu('MENU_SYS_MONITOR', 'V')
  async getSlowApis(
    @Query('limitMs', new DefaultValuePipe(1000), ParseIntPipe) limitMs: number,
    @Query('top',     new DefaultValuePipe(20),   ParseIntPipe) top:     number,
  ) {
    return this.monitorService.getSlowApis(limitMs, top);
  }

  /** 最近错误统计（24h 聚合 + 1h 明细） */
  @Get('errors')
  @RequireMenu('MENU_SYS_MONITOR', 'V')
  async getErrors() {
    return this.monitorService.getErrorStats();
  }

  /** 数据库连接池状态 */
  @Get('db-pool')
  @RequireMenu('MENU_SYS_MONITOR', 'V')
  async getDbPool() {
    return this.monitorService.getDbPoolStats();
  }

  /** 高危操作审计汇总（最近 7 天） */
  @Get('operations')
  @RequireMenu('MENU_SYS_MONITOR', 'V')
  async getOperations() {
    return this.monitorService.getOperationStats();
  }
}
