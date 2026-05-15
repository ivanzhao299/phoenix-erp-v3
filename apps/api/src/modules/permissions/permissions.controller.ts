import {
  Controller, Get, Post, Put, Param, Query, Body,
  UseGuards, BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PermissionsService, RoleMenuPermDto } from './permissions.service';

@Controller('api/permissions')
@UseGuards(AuthGuard('jwt'))
export class PermissionsController {
  constructor(private readonly svc: PermissionsService) {}

  /**
   * GET /api/permissions/menus
   * 返回按 domain 分组的菜单列表（前端 roles 页面动态加载，不再硬编码 PERM_GROUPS）
   */
  @Get('menus')
  async getMenus() {
    const data = await this.svc.getMenusGrouped();
    return { code: 200, data };
  }

  /**
   * GET /api/permissions/conflicts
   * 返回岗位分离冲突规则（RACI 红线）
   */
  @Get('conflicts')
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
  async getMatrix() {
    const data = await this.svc.getMatrix();
    return { code: 200, data };
  }

  /**
   * GET /api/permissions/stats
   * 顶部统计：角色数 / 菜单数 / 敏感数 / 冲突规则数 / 每角色用户数
   */
  @Get('stats')
  async getStats() {
    const data = await this.svc.getStats();
    return { code: 200, data };
  }

  /**
   * GET /api/permissions/effective-perms/:userId
   * 调试/预览：查询某用户在三路源合并后的最终权限（用于排错）
   */
  @Get('effective-perms/:userId')
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
  async getRoleUsers(@Param('code') code: string) {
    const data = await this.svc.getRoleUsers(code);
    return { code: 200, data };
  }

  /**
   * GET /api/permissions/role/:code/perms
   * 该角色的菜单×CRUD 三元组列表（编辑表单展示用）
   */
  @Get('role/:code/perms')
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
}
