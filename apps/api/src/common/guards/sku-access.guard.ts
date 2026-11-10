import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { hasPerm, PermCode } from '../../auth/permissions.util';
import { isMenuRegistered } from './menu-registry.service';

/** Explicit compatibility: the legacy API used E for both create and edit. */
export function hasSkuPermission(user: { roles?: string[]; role?: string; permissions?: string[] }, op: PermCode): boolean {
  if (user.roles?.includes('ROLE_ADMIN') || user.role === 'ROLE_ADMIN') return true;
  return (isMenuRegistered('MENU_MD_SKU') && hasPerm(user.permissions, 'MENU_MD_SKU', op))
    || (isMenuRegistered('MENU_MASTER_SKU') && hasPerm(user.permissions, 'MENU_MASTER_SKU', op === 'C' ? 'E' : op));
}

/** Active reference lists follow the authenticated lookup convention; management needs explicit SKU rights. */
@Injectable()
export class SkuAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (!req.user) throw new ForbiddenException('User context not found.');
    if (req.method === 'GET' && !req.params?.skuCode && (!req.query?.status || req.query.status === 'ACTIVE')) return true;
    const op = req.method === 'GET' ? 'V' : req.method === 'POST' ? 'C' : 'E';
    if (hasSkuPermission(req.user, op)) return true;
    throw new ForbiddenException('MENU_PERMISSION_DENIED');
  }
}
