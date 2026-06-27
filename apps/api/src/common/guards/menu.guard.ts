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
  altMenus?: string[];  // G20-1: 备选 menu code 数组（OR 关系），用于跨域兼容（如 sales2/inventory ↔ wms_view）
}

/** @RequireMenu('MENU_FARM_DATA', 'V')
 *  @RequireMenu('MENU_SALES2_INVENTORY', 'V', ['MENU_WMS_VIEW'])  // G20-1 备选 OR
 */
export const RequireMenu = (menu: string, perm: PermCode, altMenus?: string[]) =>
  SetMetadata(REQUIRE_MENU_KEY, { menu, perm, altMenus });

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
    const requirement = this.reflector.getAllAndOverride<MenuRequirement>(REQUIRE_MENU_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requirement) return true;

    const user = req.user;
    if (!user) throw new ForbiddenException('User context not found.');

    // 4. ROLE_ADMIN 超管直通(2026-06-19 起;2026-06-27 提到注册检查之前):
    //    避免 cookie_token 或精简 JWT 不含 permissions 时合法管理员被锁死。
    //    ⚠️ 必须先于第 5 步注册检查——否则任一 orphan/漏 seed 的 menu_code
    //    (如 MENU_MD_CENTER 漏 seed 事件)会把超管也锁死,生产整块功能不可用。
    //    超管本就应访问一切,跳过注册检查对其无安全影响;注册检查仍对非超管生效。
    if (Array.isArray(user.roles) && user.roles.includes('ROLE_ADMIN')) return true;
    if (user.role === 'ROLE_ADMIN') return true;

    // 5. menu_code 注册检查（防裸接口穿越，源 = sys_menu 启动期缓存；仅对非超管）
    if (!isMenuRegistered(requirement.menu)) {
      throw new ForbiddenException('MENU_PERMISSION_NOT_REGISTERED');
    }

    // 6. RBAC 检查（统一 util） — 主 menu 或 altMenus 任一 OR 通过即放行
    if (hasPerm(user.permissions, requirement.menu, requirement.perm)) return true;
    if (requirement.altMenus && requirement.altMenus.length > 0) {
      for (const alt of requirement.altMenus) {
        if (isMenuRegistered(alt) && hasPerm(user.permissions, alt, requirement.perm)) return true;
      }
    }

    throw new ForbiddenException('MENU_PERMISSION_DENIED');
  }
}
