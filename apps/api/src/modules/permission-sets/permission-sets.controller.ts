import {
  Controller, Get, Post, Patch, Put, Delete, Param, Body, UseGuards, BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { PermissionSetsService } from './permission-sets.service';

/**
 * G118 权限集（PBAC）管理 API。
 * 权限：依赖 MENU_SYS_ROLE（与角色权限同管控面，前端门控）。
 */
@Controller('api/permission-sets')
@UseGuards(AuthGuard('jwt'), MenuGuard)
export class PermissionSetsController {
  constructor(private readonly svc: PermissionSetsService) {}

  @Get()
  @RequireMenu('MENU_SETTINGS_PERMISSION_SET', 'V')
  async list() {
    return { code: 200, data: await this.svc.list() };
  }

  @Get(':code')
  @RequireMenu('MENU_SETTINGS_PERMISSION_SET', 'V')
  async detail(@Param('code') code: string) {
    return { code: 200, data: await this.svc.detail(code) };
  }

  @Post()
  @RequireMenu('MENU_SETTINGS_PERMISSION_SET', 'C')
  async create(@Body() dto: any) {
    return { code: 200, data: await this.svc.create(dto) };
  }

  @Patch(':code')
  @RequireMenu('MENU_SETTINGS_PERMISSION_SET', 'E')
  async update(@Param('code') code: string, @Body() dto: any) {
    return { code: 200, data: await this.svc.update(code, dto) };
  }

  @Delete(':code')
  @RequireMenu('MENU_SETTINGS_PERMISSION_SET', 'D')
  async remove(@Param('code') code: string) {
    return { code: 200, data: await this.svc.remove(code) };
  }

  /** 覆盖明细 body: { items: [{menu_code, perm_codes}] } */
  @Put(':code/items')
  @RequireMenu('MENU_SETTINGS_PERMISSION_SET', 'E')
  async setItems(@Param('code') code: string, @Body() body: { items: Array<{ menu_code: string; perm_codes: string }> }) {
    if (!body || !Array.isArray(body.items)) throw new BadRequestException('body.items 必须是数组');
    return { code: 200, data: await this.svc.setItems(code, body.items) };
  }

  @Post(':code/roles/:roleCode')
  @RequireMenu('MENU_SETTINGS_PERMISSION_SET', 'E')
  async assignRole(@Param('code') code: string, @Param('roleCode') roleCode: string) {
    return { code: 200, data: await this.svc.assignRole(code, roleCode) };
  }

  @Delete(':code/roles/:roleCode')
  @RequireMenu('MENU_SETTINGS_PERMISSION_SET', 'E')
  async unassignRole(@Param('code') code: string, @Param('roleCode') roleCode: string) {
    return { code: 200, data: await this.svc.unassignRole(code, roleCode) };
  }

  @Post(':code/users/:userId')
  @RequireMenu('MENU_SETTINGS_PERMISSION_SET', 'E')
  async assignUser(@Param('code') code: string, @Param('userId') userId: string) {
    const uid = Number(userId);
    if (!uid) throw new BadRequestException('userId 必须是数字');
    return { code: 200, data: await this.svc.assignUser(code, uid) };
  }

  @Delete(':code/users/:userId')
  @RequireMenu('MENU_SETTINGS_PERMISSION_SET', 'E')
  async unassignUser(@Param('code') code: string, @Param('userId') userId: string) {
    const uid = Number(userId);
    if (!uid) throw new BadRequestException('userId 必须是数字');
    return { code: 200, data: await this.svc.unassignUser(code, uid) };
  }
}
