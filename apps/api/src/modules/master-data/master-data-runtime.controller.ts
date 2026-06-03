import { Controller, Get, Post, Put, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { MasterDataRuntimeService } from './master-data-runtime.service';

/**
 * MasterDataRuntimeController — 核心主数据 Runtime API（G3-A）
 * 路由前缀：/api/master-data/runtime/:type   （type ∈ customer|supplier|project|cash-account）
 *   GET    /:type                 列表（?status=&keyword=）
 *   GET    /:type/active          仅 ACTIVE（供 Selector 引用治理）
 *   GET    /:type/:code           详情
 *   POST   /:type                 新增（自动编码 + DRAFT）
 *   PUT    /:type/:code           编辑
 *   POST   /:type/:code/transition  生命周期流转（submit/approve/reject/freeze/archive/restore）
 *
 * 权限按主数据类型映射到对应治理菜单（C=新增、E=编辑、A=审批）。
 */
@Controller('api/master-data/runtime')
@UseGuards(AuthGuard('jwt'), MenuGuard)
export class MasterDataRuntimeController {
  constructor(private readonly rt: MasterDataRuntimeService) {}

  private operator(req: any): string {
    return req?.user?.real_name || req?.user?.username || req?.user?.name || 'system';
  }

  @Get(':type')
  @RequireMenu('MENU_MASTER_DATA', 'V')
  list(@Param('type') type: string, @Query('status') status?: string, @Query('keyword') keyword?: string) {
    return this.rt.list(type, { status, keyword });
  }

  @Get(':type/active')
  @RequireMenu('MENU_MASTER_DATA', 'V')
  listActive(@Param('type') type: string) {
    return this.rt.listActive(type);
  }

  @Get(':type/:code')
  @RequireMenu('MENU_MASTER_DATA', 'V')
  get(@Param('type') type: string, @Param('code') code: string) {
    return this.rt.get(type, code);
  }

  @Post(':type')
  @RequireMenu('MENU_MASTER_DATA', 'C')
  create(@Param('type') type: string, @Body() dto: Record<string, any>, @Req() req: any) {
    return this.rt.create(type, dto, this.operator(req));
  }

  @Put(':type/:code')
  @RequireMenu('MENU_MASTER_DATA', 'E')
  update(@Param('type') type: string, @Param('code') code: string, @Body() dto: Record<string, any>, @Req() req: any) {
    return this.rt.update(type, code, dto, this.operator(req));
  }

  @Post(':type/:code/transition')
  @RequireMenu('MENU_MASTER_DATA', 'E')
  transition(
    @Param('type') type: string, @Param('code') code: string,
    @Body() body: { action: string; reason?: string }, @Req() req: any,
  ) {
    return this.rt.transition(type, code, body?.action, this.operator(req), body?.reason);
  }
}
