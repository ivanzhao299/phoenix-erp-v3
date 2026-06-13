import { Controller, Get, Post, Put, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { MasterDataTypeGuard } from '../../common/guards/master-data-type.guard';
import { MasterDataRuntimeService } from './master-data-runtime.service';

/**
 * MasterDataRuntimeController — 核心主数据 Runtime API（G3-A）
 * 路由前缀：/api/master-data/runtime/:type
 *   GET    /:type                 列表（?status=&keyword=）
 *   GET    /:type/active          仅 ACTIVE（供 Selector 引用治理）
 *   GET    /:type/:code           详情
 *   POST   /:type                 新增（自动编码 + DRAFT）
 *   PUT    /:type/:code           编辑
 *   POST   /:type/:code/transition  生命周期流转（submit/approve/reject/freeze/archive/restore）
 *
 * 鉴权（G56-B 项级原子）：MasterDataTypeGuard 按 :type 动态解析专属码
 *   MENU_MD_<TYPE>（如 customer→MENU_MD_CUSTOMER），并以 MENU_MASTER_DATA 为超级兜底。
 *   操作码自动推导：GET→V、POST 新增→C、PUT/transition→E。
 */
@Controller('api/master-data/runtime')
@UseGuards(MasterDataTypeGuard)
export class MasterDataRuntimeController {
  constructor(private readonly rt: MasterDataRuntimeService) {}

  private operator(req: any): string {
    return req?.user?.real_name || req?.user?.username || req?.user?.name || 'system';
  }

  @Get(':type')
  list(@Param('type') type: string, @Query('status') status?: string, @Query('keyword') keyword?: string) {
    return this.rt.list(type, { status, keyword });
  }

  @Get(':type/active')
  listActive(@Param('type') type: string) {
    return this.rt.listActive(type);
  }

  @Get(':type/:code')
  get(@Param('type') type: string, @Param('code') code: string) {
    return this.rt.get(type, code);
  }

  @Post(':type')
  create(@Param('type') type: string, @Body() dto: Record<string, any>, @Req() req: any) {
    return this.rt.create(type, dto, this.operator(req));
  }

  /** G91 就地快速新建（直接 ACTIVE，立即可被选择器引用） */
  @Post(':type/quick')
  createQuick(@Param('type') type: string, @Body() dto: Record<string, any>, @Req() req: any) {
    return this.rt.createQuick(type, dto, this.operator(req));
  }

  @Put(':type/:code')
  update(@Param('type') type: string, @Param('code') code: string, @Body() dto: Record<string, any>, @Req() req: any) {
    return this.rt.update(type, code, dto, this.operator(req));
  }

  @Post(':type/:code/transition')
  transition(
    @Param('type') type: string, @Param('code') code: string,
    @Body() body: { action: string; reason?: string }, @Req() req: any,
  ) {
    return this.rt.transition(type, code, body?.action, this.operator(req), body?.reason);
  }
}
