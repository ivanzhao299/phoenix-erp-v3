/**
 * Phoenix ERP V3 — DataScopeGuard
 * RBAC-2 数据范围解析 Guard
 * 解析范围存入 CLS；解析失败时拒绝请求。
 * 需在 MenuGuard 之后执行：@UseGuards(MenuGuard, DataScopeGuard)
 */
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { DataScopeService } from '../services/data-scope.service';
import { MenuRequirement, REQUIRE_MENU_KEY } from '../../../common/guards/menu.guard';
import { hasPerm } from '../../../auth/permissions.util';

@Injectable()
export class DataScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly dataScopeService: DataScopeService,
    private readonly cls: ClsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 读取 @RequireMenu 元数据（MenuGuard 已注册同一 key）
    const requirement = this.reflector.getAllAndOverride<MenuRequirement | undefined>(
      REQUIRE_MENU_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 无 @RequireMenu 注解的路由不解析 scope
    if (!requirement) return true;

    const user = this.cls.get('user') as Record<string, unknown> | undefined;
    if (!user) return true; // 未登录（MenuGuard 会拦截，此处静默放行）

    try {
      const roles: string[] = (user['roles'] as string[] | undefined) ?? (user['role'] ? [user['role'] as string] : []);
      const userId = String(user['userId'] ?? user['id'] ?? '');
      const menuForScope = this.resolveMatchedMenu(user, requirement);
      const rawPermsVersion = user['perms_version'];
      const permsVersion = Number.isFinite(Number(rawPermsVersion)) ? Number(rawPermsVersion) : undefined;
      const scope = await this.dataScopeService.resolve(userId, roles, menuForScope, permsVersion);
      this.cls.set('dataScope', scope);
      // G125：同时挂到 req，供 farm 模块的纯函数 deriveOrgScope(req) 读取真实数据范围。
      const req = context.switchToHttp().getRequest();
      if (req) req.dataScope = scope;
    } catch (e: any) {
      // Scope resolution is an authorization boundary: never continue with a guessed scope.
      console.error('[DataScopeGuard] resolve failed; denying request:', e?.message);
      throw new ForbiddenException({ code: 'DATA_SCOPE_UNRESOLVED', message: '数据范围无法解析，拒绝访问' });
    }

    return true;
  }

  private resolveMatchedMenu(user: Record<string, unknown>, requirement: MenuRequirement): string {
    const permissions = user['permissions'] as string[] | undefined;
    if (hasPerm(permissions, requirement.menu, requirement.perm)) return requirement.menu;
    for (const alt of requirement.altMenus ?? []) {
      if (hasPerm(permissions, alt, requirement.perm)) return alt;
    }
    return requirement.menu;
  }
}
