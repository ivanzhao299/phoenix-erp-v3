import {
  Controller, Get, Post, Put, Patch, Param, Query, Body,
  UseGuards, BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { PermissionsService, RoleMenuPermDto } from './permissions.service';

@Controller('api/permissions')
@UseGuards(AuthGuard('jwt'), MenuGuard)
export class PermissionsController {
  constructor(private readonly svc: PermissionsService) {}

  /**
   * GET /api/permissions/menus
   * 返回按 domain 分组的菜单列表（前端 roles 页面动态加载，不再硬编码 PERM_GROUPS）
   */
  @Get('menus')
  @RequireMenu('MENU_SETTINGS_ROLE', 'V', ['MENU_SETTINGS_IT'])
  async getMenus() {
    const data = await this.svc.getMenusGrouped();
    return { code: 200, data };
  }

  /**
   * GET /api/permissions/conflicts
   * 返回岗位分离冲突规则（RACI 红线）
   */
  @Get('conflicts')
  @RequireMenu('MENU_SETTINGS_ROLE', 'V', ['MENU_SETTINGS_IT'])
  async getConflicts() {
    const data = await this.svc.getConflicts();
    return { code: 200, data };
  }

  /**
   * POST /api/permissions/check-conflicts
   * 检查菜单组合是否违反岗位分离规则
   * body: { menu_codes: string[] }
   */
  @Post('check-conflicts')
  @RequireMenu('MENU_SETTINGS_ROLE', 'V', ['MENU_SETTINGS_IT'])
  async checkConflicts(@Body() body: { menu_codes: string[] }) {
    if (!body || !Array.isArray(body.menu_codes)) {
      throw new BadRequestException('menu_codes 必须是字符串数组');
    }
    const data = await this.svc.checkConflicts(body.menu_codes);
    return { code: 200, data };
  }

  /**
   * GET /api/permissions/matrix
   * 全景矩阵：N 角色 × M 菜单，含 perm_codes（CRUD 三元组）
   */
  @Get('matrix')
  @RequireMenu('MENU_SETTINGS_ROLE', 'V', ['MENU_SETTINGS_IT'])
  async getMatrix() {
    const data = await this.svc.getMatrix();
    return { code: 200, data };
  }

  /**
   * GET /api/permissions/stats
   * 顶部统计：角色数 / 菜单数 / 敏感数 / 冲突规则数 / 每角色用户数
   */
  @Get('stats')
  @RequireMenu('MENU_SETTINGS_ROLE', 'V', ['MENU_SETTINGS_IT'])
  async getStats() {
    const data = await this.svc.getStats();
    return { code: 200, data };
  }

  /**
   * GET /api/permissions/effective-perms/:userId
   * 调试/预览：查询某用户在三路源合并后的最终权限（用于排错）
   */
  @Get('effective-perms/:userId')
  @RequireMenu('MENU_SETTINGS_ROLE', 'V', ['MENU_SETTINGS_IT'])
  async getEffective(@Param('userId') userId: string) {
    const uid = Number(userId);
    if (!uid) throw new BadRequestException('userId 必须是数字');
    return this.svc.getEffectiveUserPerms(uid);
  }

  /**
   * GET /api/permissions/role/:code/users
   * 该角色下的用户列表（删除角色前预警用）
   */
  @Get('role/:code/users')
  @RequireMenu('MENU_SETTINGS_ROLE', 'V', ['MENU_SETTINGS_IT'])
  async getRoleUsers(@Param('code') code: string) {
    const data = await this.svc.getRoleUsers(code);
    return { code: 200, data };
  }

  /**
   * GET /api/permissions/role/:code/perms
   * 该角色的菜单×CRUD 三元组列表（编辑表单展示用）
   */
  @Get('role/:code/perms')
  @RequireMenu('MENU_SETTINGS_ROLE', 'V', ['MENU_SETTINGS_IT'])
  async getRolePerms(@Param('code') code: string) {
    const data = await this.svc.getRolePermissions(code);
    return { code: 200, data };
  }

  /**
   * PUT /api/permissions/role/:code/perms
   * 批量覆盖该角色的菜单×CRUD 三元组（事务：全删 + 全插）
   * body: { perms: [{menu_code, perm_codes}, ...] }
   */
  @Put('role/:code/perms')
  @RequireMenu('MENU_SETTINGS_ROLE', 'E', ['MENU_SETTINGS_IT'])
  async setRolePerms(@Param('code') code: string, @Body() body: { perms: RoleMenuPermDto[] }) {
    if (!body || !Array.isArray(body.perms)) {
      throw new BadRequestException('body.perms 必须是数组');
    }
    try {
      const data = await this.svc.setRolePermissions(code, body.perms);
      return { code: 200, data };
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
  }

  /**
   * GET /api/permissions/who-can?menu=MENU_X&perm=A
   * 反查：有该菜单该操作权限的角色（直绑/权限集）+ 在岗用户。
   */
  @Get('who-can')
  @RequireMenu('MENU_SETTINGS_ROLE', 'V', ['MENU_SETTINGS_IT'])
  async whoCan(@Query('menu') menu: string, @Query('perm') perm: string) {
    if (!menu) throw new BadRequestException('menu 必填');
    return { code: 200, data: await this.svc.whoCan(menu, perm || 'V') };
  }

  /**
   * POST /api/permissions/check-role-combo
   * 角色组合 SoD 校验（授权前拦截）。body: { role_codes: string[] }
   */
  @Post('check-role-combo')
  @RequireMenu('MENU_SETTINGS_ROLE', 'V', ['MENU_SETTINGS_IT'])
  async checkRoleCombo(@Body() body: { role_codes: string[] }) {
    if (!body || !Array.isArray(body.role_codes)) throw new BadRequestException('role_codes 必须是数组');
    return { code: 200, data: await this.svc.checkRoleComboConflicts(body.role_codes) };
  }

  /**
   * PATCH /api/permissions/role/:code/status
   * 角色生命周期：停用(DEPRECATED)/恢复(ACTIVE)。软停用不删数据，从编辑页隐藏。
   * body: { status: 'ACTIVE' | 'DEPRECATED' }
   */
  @Patch('role/:code/status')
  @RequireMenu('MENU_SETTINGS_ROLE', 'E', ['MENU_SETTINGS_IT'])
  async setRoleStatus(@Param('code') code: string, @Body() body: { status: string }) {
    try {
      const data = await this.svc.setRoleStatus(code, body?.status);
      return { code: 200, data };
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
  }
}
