import {
  Controller, Get, Post, Put, Delete, Param, Body, Req,
  UseGuards, BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { PermissionSetsService, SetItemDto } from './permission-sets.service';

@Controller('api/permission-sets')
@UseGuards(AuthGuard('jwt'), MenuGuard)
export class PermissionSetsController {
  constructor(private readonly svc: PermissionSetsService) {}

  /** GET /api/permission-sets — 全部权限集（含 item/role/user 数量） */
  @Get()
  @RequireMenu('MENU_SETTINGS_IT', 'V')
  async list() { return this.svc.list(); }

  /** GET /api/permission-sets/:code — 单个权限集详情（含 items + 绑定关系） */
  @Get(':code')
  @RequireMenu('MENU_SETTINGS_IT', 'V')
  async get(@Param('code') code: string) { return this.svc.get(code); }

  /** POST /api/permission-sets — 创建 */
  @Post()
  @RequireMenu('MENU_SETTINGS_IT', 'C')
  async create(@Body() body: { set_code: string; set_name_zh: string; set_name_lo?: string; description?: string }, @Req() req: any) {
    if (!body) throw new BadRequestException('body 必填');
    return this.svc.create(body, Number(req.user?.userId) || 0);
  }

  /** PUT /api/permission-sets/:code — 更新元数据 */
  @Put(':code')
  @RequireMenu('MENU_SETTINGS_IT', 'E')
  async update(@Param('code') code: string, @Body() body: any) {
    return this.svc.update(code, body);
  }

  /** DELETE /api/permission-sets/:code — 删除 */
  @Delete(':code')
  @RequireMenu('MENU_SETTINGS_IT', 'D')
  async remove(@Param('code') code: string) { return this.svc.remove(code); }

  /** PUT /api/permission-sets/:code/items — 批量覆盖 items */
  @Put(':code/items')
  @RequireMenu('MENU_SETTINGS_IT', 'E')
  async setItems(@Param('code') code: string, @Body() body: { items: SetItemDto[] }) {
    if (!body || !Array.isArray(body.items)) throw new BadRequestException('body.items 必须是数组');
    return this.svc.setItems(code, body.items);
  }

  /** POST /api/permission-sets/:code/bind-role/:roleCode */
  @Post(':code/bind-role/:roleCode')
  @RequireMenu('MENU_SETTINGS_IT', 'E')
  async bindRole(@Param('code') code: string, @Param('roleCode') roleCode: string) {
    return this.svc.bindRole(code, roleCode);
  }

  /** DELETE /api/permission-sets/:code/bind-role/:roleCode */
  @Delete(':code/bind-role/:roleCode')
  @RequireMenu('MENU_SETTINGS_IT', 'E')
  async unbindRole(@Param('code') code: string, @Param('roleCode') roleCode: string) {
    return this.svc.unbindRole(code, roleCode);
  }

  /** POST /api/permission-sets/:code/bind-user/:userId */
  @Post(':code/bind-user/:userId')
  @RequireMenu('MENU_SETTINGS_IT', 'E')
  async bindUser(@Param('code') code: string, @Param('userId') userId: string, @Req() req: any) {
    const uid = Number(userId);
    if (!uid) throw new BadRequestException('userId 必须是数字');
    return this.svc.bindUser(code, uid, Number(req.user?.userId) || 0);
  }

  /** DELETE /api/permission-sets/:code/bind-user/:userId */
  @Delete(':code/bind-user/:userId')
  @RequireMenu('MENU_SETTINGS_IT', 'E')
  async unbindUser(@Param('code') code: string, @Param('userId') userId: string) {
    const uid = Number(userId);
    if (!uid) throw new BadRequestException('userId 必须是数字');
    return this.svc.unbindUser(code, uid);
  }
}
