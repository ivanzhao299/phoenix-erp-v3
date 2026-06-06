import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ClsService } from 'nestjs-cls';
import { isMenuRegistered } from './menu-registry.service';
import { hasPerm, PermCode } from '../../auth/permissions.util';

/**
 * MenuGuard — RBAC 权限守卫（G6 收紧 · 2026-06-06）
 * ════════════════════════════════════════════════════════════════════════
 * 唯一权威源：JWT.permissions 字符串数组（来自 sys_role_menu_permission DB 表，
 * auth.service 登录时由 permissions-resolver 合并产出）。
 *
 * 已弃用：编译时 rbac.matrix.ts（G5-A 切动态后整文件 G6 删除）。
 *
 * 流程：
 *   1. @Public()              → 直接放行
 *   2. JWT 失败               → 401
 *   3. 无 @RequireMenu         → 仅需登录即可
 *   4. menu_code 未注册        → 403 MENU_PERMISSION_NOT_REGISTERED
 *   5. JWT.permissions 不含    → 403 MENU_PERMISSION_DENIED
 *   6. 命中 / '*' 通配         → 放行
 */

export const REQUIRE_MENU_KEY = 'require_menu';
export const IS_PUBLIC_KEY = 'is_public';

export interface MenuRequirement {
  menu: string;
  perm: PermCode;
}

/** @RequireMenu('MENU_FARM_DATA', 'V') */
export const RequireMenu = (menu: string, perm: PermCode) =>
  SetMetadata(REQUIRE_MENU_KEY, { menu, perm });

/** @Public() — 无需 Token 的公开接口 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Injectable()
export class MenuGuard extends AuthGuard('jwt') implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly cls: ClsService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. 公开接口直接放行
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // 2. JWT 校验
    const isAuthenticated = await super.canActivate(context);
    if (!isAuthenticated) return false;

    // 写 user 到 CLS 供 service 层 cls.get('user.*') 用
    const req = context.switchToHttp().getRequest();
    if (req.user) this.cls.set('user', req.user);

    // 3. 无 @RequireMenu → 仅需登录
    const requirement = this.reflector.get<MenuRequirement>(REQUIRE_MENU_KEY, context.getHandler());
    if (!requirement) return true;

    const user = req.user;
    if (!user) throw new ForbiddenException('User context not found.');

    // 4. menu_code 注册检查（防裸接口穿越，源 = sys_menu 启动期缓存）
    if (!isMenuRegistered(requirement.menu)) {
      throw new ForbiddenException('MENU_PERMISSION_NOT_REGISTERED');
    }

    // 5. RBAC 检查（统一 util）
    if (hasPerm(user.permissions, requirement.menu, requirement.perm)) return true;

    throw new ForbiddenException('MENU_PERMISSION_DENIED');
  }
}
