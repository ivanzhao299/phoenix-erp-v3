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
// 2026-06-06 G5-A：弃用静态 rbac.matrix.ts 路径，改纯走 JWT.permissions (来自
// sys_role_menu_permission 表，登录时由 auth.service 解析合并)。矩阵已通过
// 20260606_g5a_rbac_matrix_backfill.sql 全量 seed 进 DB，自定义角色与老角色等同对待。
// rbac.matrix.ts 文件保留作为开发本机首次部署时的 seed 历史源，不再被守卫调用。
import { isMenuRegistered } from './rbac.matrix';

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

    // 检查 MENU 是否注册（防止裸接口穿越）
    // 注：isMenuRegistered 目前仍读 rbac.matrix.ts。下一步可改读启动期缓存的
    // sys_menu 表使其与 DB 完全同步；但矩阵已通过 g5a backfill 与 DB 数据一致，
    // 当前不阻塞 RBAC 校验，留 G5-A Step 3 处理。
    if (!isMenuRegistered(requirement.menu)) {
      throw new ForbiddenException('MENU_PERMISSION_NOT_REGISTERED');
    }

    // ──────────────────────────────────────────────────────────────────
    // 唯一权威源：JWT.permissions （来自 sys_role_menu_permission 表，
    // 登录时由 auth.service.permissions-resolver 解析合并）。
    // 格式：['MENU_FARM_DATA:V', 'MENU_PROD_INBOUND:V,C,E', '*']
    // - '*' 表示超管全权（admin）
    // - 'MENU_XXX:V,C,E' 表示对该菜单的 V/C/E 操作有权限
    // ──────────────────────────────────────────────────────────────────
    const perms: string[] = Array.isArray(user.permissions) ? user.permissions : [];
    if (perms.includes('*')) return true;
    const entry = perms.find(p => p.startsWith(requirement.menu + ':'));
    if (entry) {
      const granted = (entry.split(':')[1] || '').split(',').map(s => s.trim());
      if (granted.includes(requirement.perm)) return true;
    }

    throw new ForbiddenException('MENU_PERMISSION_DENIED');
  }
}
