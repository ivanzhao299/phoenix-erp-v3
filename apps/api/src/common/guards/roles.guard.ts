import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * RolesGuard — JWT 已通过后再校验角色
 *
 * 使用方式：
 *   @UseGuards(AuthGuard('jwt'), RolesGuard)
 *   @Roles('ROLE_ADMIN', 'ROLE_FARM_MGR')
 *   @Post('daily-logs')
 *   async submit(...) { ... }
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // 未标注 @Roles() 则不做角色检查
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('未登录');

    const userRole: string = user.role ?? user.roles?.[0] ?? '';
    if (!required.includes(userRole)) {
      throw new ForbiddenException(`角色 ${userRole} 无权执行此操作`);
    }
    return true;
  }
}
