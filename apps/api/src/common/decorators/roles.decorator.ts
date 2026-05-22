import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** 标记路由所需角色，传入空列表表示任意已登录用户均可访问 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
