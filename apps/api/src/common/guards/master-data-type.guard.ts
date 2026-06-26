import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ClsService } from 'nestjs-cls';
import { isMenuRegistered } from './menu-registry.service';
import { hasPerm, PermCode } from '../../auth/permissions.util';

/**
 * MasterDataTypeGuard — 主数据 Runtime 的「项级原子」鉴权守卫（G56-B）
 * ════════════════════════════════════════════════════════════════════════
 * 背景：master-data-runtime.controller 的 6 个端点是泛型 /:type，原来统一
 *   @RequireMenu('MENU_MASTER_DATA')，导致「客户主数据管理员」其实能管所有主数据
 *   （per-entity 角色形同虚设）。本守卫按 :type 动态解析专属菜单码做真·项级鉴权。
 *
 * 规则（OR）：
 *   1. JWT 校验 + 写 user 到 CLS（与 MenuGuard 契约一致，供 service 层用）
 *   2. :type → 专属码 MENU_MD_<TYPE>，持有对应操作权 → 放行
 *   3. 持「超级码」MENU_MASTER_DATA（管理全部主数据）→ 放行（向后兼容：现有
 *      MENU_MASTER_DATA 持有者永不受影响）
 *   4. organization/company → MENU_MD_ORG/MENU_MD_COMPANY；dict → MENU_SETTINGS_DATA（走专属域码）
 *   5. 都不满足 → 403
 *
 * 操作码推导：GET→V、PUT→E、POST(.../transition)→E、POST(新增)→C
 */

const SUPER_MENU = 'MENU_MASTER_DATA';

/** :type → 专属菜单码。未列出的类型回退到超级码（向后兼容） */
const TYPE_TO_MENU: Record<string, string> = {
  customer: 'MENU_MD_CUSTOMER',
  supplier: 'MENU_MD_SUPPLIER',
  project: 'MENU_MD_PROJECT',
  product: 'MENU_MD_PRODUCT',
  grade: 'MENU_MD_GRADE',
  spec: 'MENU_MD_PACKAGING',
  sku: 'MENU_MD_SKU',
  warehouse: 'MENU_MD_WAREHOUSE',
  store: 'MENU_MD_STORE',
  driver: 'MENU_MD_DRIVER',
  vehicle: 'MENU_MD_VEHICLE',
  'cash-account': 'MENU_MD_CASH_ACCOUNT',
  'bank-account': 'MENU_MD_BANK_ACCOUNT',
  material: 'MENU_MD_MATERIAL',   // G91：原缺此映射→回退超级码 MENU_MASTER_DATA，持 MENU_MD_MATERIAL 者仍 403
  // 特殊：组织 / 公司 / 字典走各自专属域码
  organization: 'MENU_MD_ORG',
  company: 'MENU_MD_COMPANY',
  dict: 'MENU_SETTINGS_DATA',
};

const TYPE_TO_ALT_MENUS: Record<string, string[]> = {
  organization: ['MENU_ORG_VIEW', 'MENU_ORG_MANAGE'],
  company: ['MENU_MD_ORG'],
};

function deriveOp(method: string, urlPath: string): PermCode {
  if (method === 'GET') return 'V';
  if (method === 'PUT') return 'E';
  if (method === 'POST') return /\/transition\b/.test(urlPath) ? 'E' : 'C';
  return 'V';
}

@Injectable()
export class MasterDataTypeGuard extends AuthGuard('jwt') implements CanActivate {
  constructor(private readonly cls: ClsService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. JWT 校验
    const ok = (await super.canActivate(context)) as boolean;
    if (!ok) return false;

    const req = context.switchToHttp().getRequest();
    // 写 user 到 CLS（与 MenuGuard 一致，供 service 层 cls.get('user.*') 用）
    if (req.user) this.cls.set('user', req.user);

    const user = req.user;
    if (!user) throw new ForbiddenException('User context not found.');

    const type = String(req.params?.type ?? '');
    const op = deriveOp(req.method, String(req.originalUrl || req.url || ''));
    const code = TYPE_TO_MENU[type] ?? SUPER_MENU;

    // 2. 专属码命中
    if (isMenuRegistered(code) && hasPerm(user.permissions, code, op)) return true;
    for (const alt of TYPE_TO_ALT_MENUS[type] ?? []) {
      if (isMenuRegistered(alt) && hasPerm(user.permissions, alt, op)) return true;
    }
    // 3. 超级码 MENU_MASTER_DATA 兜底（管理全部主数据）
    if (isMenuRegistered(SUPER_MENU) && hasPerm(user.permissions, SUPER_MENU, op)) return true;

    throw new ForbiddenException('MENU_PERMISSION_DENIED');
  }
}
