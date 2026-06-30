/**
 * Phoenix ERP V3 — DataScopeGuard
 * RBAC-2 数据范围解析 Guard
 * 只解析范围存入 CLS，不做拦截决策（始终返回 true）
 * 需在 MenuGuard 之后执行：@UseGuards(MenuGuard, DataScopeGuard)
 */
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { DataScopeService } from '../services/data-scope.service';
import { REQUIRE_MENU_KEY } from '../../../common/guards/menu.guard';

@Injectable()
export class DataScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly dataScopeService: DataScopeService,
    private readonly cls: ClsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 读取 @RequireMenu 元数据（MenuGuard 已注册同一 key）
    const requirement = this.reflector.getAllAndOverride<{ menu: string; perm: string } | undefined>(
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
      const scope = await this.dataScopeService.resolve(userId, roles, requirement.menu);
      this.cls.set('dataScope', scope);
      // G125：同时挂到 req，供 farm 模块的纯函数 deriveOrgScope(req) 读取真实数据范围。
      const req = context.switchToHttp().getRequest();
      if (req) req.dataScope = scope;
    } catch (e: any) {
      // 解析失败不抛异常，Service 层降级兜底
      console.warn('[DataScopeGuard] resolve failed, fallback to storeCode:', e?.message);
    }

    return true;
  }
}
