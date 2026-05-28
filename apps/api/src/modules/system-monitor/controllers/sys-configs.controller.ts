/**
 * Phoenix ERP V3 — 生产配置 Controller
 * Production Stabilization Phase 1
 *
 * 路由：/api/system/configs/...
 * 安全：查看 MENU_SYS_CONFIG V，修改 MENU_SYS_CONFIG E（仅 ADMIN）
 */
import {
  Controller, Get, Patch, Param, Query, Body, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { SysConfigsService } from '../services/sys-configs.service';
import { ClsService } from 'nestjs-cls';

@Controller('api/system/configs')
@UseGuards(AuthGuard('jwt'), MenuGuard)
export class SysConfigsController {
  constructor(
    private readonly configsService: SysConfigsService,
    private readonly cls: ClsService,
  ) {}

  /** 查询配置列表（按分组） */
  @Get()
  @RequireMenu('MENU_SYS_CONFIG', 'V')
  async list(@Query('group') group?: string) {
    return this.configsService.list(group);
  }

  /** 更新配置值 */
  @Patch(':key')
  @RequireMenu('MENU_SYS_CONFIG', 'E')
  async update(
    @Param('key') key: string,
    @Body('value') value: string,
  ) {
    const user = this.cls.get('user');
    const updatedBy = user?.name ?? user?.username ?? 'ADMIN';
    await this.configsService.update(key, { configValue: value, updatedBy });
    return { ok: true };
  }
}
