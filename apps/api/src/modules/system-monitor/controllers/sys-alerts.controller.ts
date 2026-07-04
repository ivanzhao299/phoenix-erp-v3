/**
 * Phoenix ERP V3 — 异常告警 Controller
 * Production Stabilization Phase 1
 *
 * 路由：/api/system/alerts/...
 * 安全：查看 MENU_SYS_MONITOR V，处理 MENU_SYS_MONITOR A
 * 约束：不提供 DELETE 接口（append-only）
 */
import {
  Controller, Get, Post, Patch, Param, Query, Body, UseGuards,
  ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { SysAlertsService, ResolveAlertDto } from '../services/sys-alerts.service';
import { ClsService } from 'nestjs-cls';

@Controller('api/system/alerts')
@UseGuards(AuthGuard('jwt'), MenuGuard)
export class SysAlertsController {
  constructor(
    private readonly alertsService: SysAlertsService,
    private readonly cls: ClsService,
  ) {}

  /** 查询未处理告警 */
  @Get('unresolved')
  @RequireMenu('MENU_SYS_MONITOR', 'V')
  async listUnresolved(
    @Query('alertType')                                          alertType?: string,
    @Query('severity')                                           severity?:  string,
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe)     page?:      number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe)     limit?:     number,
  ) {
    return this.alertsService.listUnresolved({ alertType, severity, page, limit });
  }

  /** 查询所有告警（含已处理） */
  @Get()
  @RequireMenu('MENU_SYS_MONITOR', 'V')
  async listAll(
    @Query('alertId')                                            alertId?:   string,
    @Query('alertType')                                          alertType?: string,
    @Query('severity')                                           severity?:  string,
    @Query('resolved')                                           resolved?:  string,
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe)     page?:      number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe)     limit?:     number,
  ) {
    return this.alertsService.listAll({
      alertId: alertId && /^\d+$/.test(alertId) ? Number(alertId) : undefined,
      alertType,
      severity,
      resolved: resolved === 'true' ? true : resolved === 'false' ? false : undefined,
      page,
      limit,
    });
  }

  /** 告警触达链自检：系统告警必须能触达到系统监控值班用户 */
  @Get('delivery-health')
  @RequireMenu('MENU_SYS_MONITOR', 'V')
  async deliveryHealth() {
    return this.alertsService.getDeliveryHealth();
  }

  /** 处理告警（单向操作，无法撤销） */
  @Patch(':id/resolve')
  @RequireMenu('MENU_SYS_MONITOR', 'A')
  async resolve(
    @Param('id', ParseIntPipe) id: number,
    @Body('remark')            remark?: string,
  ) {
    const user = this.cls.get('user');
    const resolvedBy = user?.name ?? user?.username ?? 'ADMIN';
    await this.alertsService.resolveAlert(id, { resolvedBy, resolvedRemark: remark });
    return { ok: true };
  }
}
