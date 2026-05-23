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
import { hasMenuPermission } from './rbac.matrix';

// === Decorators ===
export const REQUIRE_MENU_KEY = 'require_menu';
export const IS_PUBLIC_KEY = 'is_public';

export interface MenuRequirement {
  menu: string;
  perm: 'V' | 'C' | 'E' | 'D' | 'A' | 'X';
}

/** @RequireMenu('MENU_FARM_DATA', 'V') */
export const RequireMenu = (menu: string, perm: MenuRequirement['perm']) =>
  SetMetadata(REQUIRE_MENU_KEY, { menu, perm });

/** @Public() — 无需 Token 的公开接口 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// === Guard ===
@Injectable()
export class MenuGuard extends AuthGuard('jwt') implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly cls: ClsService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 公开接口直接放行
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // JWT 校验
    const isAuthenticated = await super.canActivate(context);
    if (!isAuthenticated) return false;

    // 将已验证的用户写入 CLS，使 Service 层可通过 cls.get('user.*') 读取
    const req = context.switchToHttp().getRequest();
    if (req.user) this.cls.set('user', req.user);

    // 无 @RequireMenu → 仅需登录
    const requirement = this.reflector.get<MenuRequirement>(REQUIRE_MENU_KEY, context.getHandler());
    if (!requirement) return true;

    const user = req.user;
    if (!user) throw new ForbiddenException('User context not found.');

    // 超级管理员特权通道
    const userRoles: string[] = user.roles || (user.role ? [user.role] : []);
    const userPerms: string[] = user.permissions || [];
    if (userRoles.includes('ROLE_ADMIN') || user.username === 'admin' || userPerms.includes('*')) {
      return true;
    }

    // 静态 RBAC 矩阵校验（零 DB 查询）
    const allowed = hasMenuPermission(userRoles, requirement.menu, requirement.perm);
    if (!allowed) {
      throw new ForbiddenException(
        `Access Denied: [${userRoles.join(',')}] lacks '${requirement.perm}' on '${requirement.menu}'`,
      );
    }

    return true;
  }
}
