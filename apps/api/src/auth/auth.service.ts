import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { SysUserEntity } from './entities/sys-user.entity';
import { resolvePermissions, PermSource } from './permissions-resolver';

const JWT_SECRET = process.env.JWT_SECRET || 'DEV_ONLY_INSECURE_FALLBACK_KEY_DO_NOT_USE_IN_PROD';
// 双密钥并行 — 用于无感轮换：
//   - 签发：始终用 JWT_SECRET（新）
//   - 校验：先试 JWT_SECRET（新）；失败再试 JWT_SECRET_PREV（旧），都失败才拒
//   - 轮换流程：把旧 secret 移到 JWT_SECRET_PREV，新 secret 写入 JWT_SECRET → 重启
//                 7 天后（>24h * 2 防夜班 buffer）删除 JWT_SECRET_PREV
const JWT_SECRET_PREV = process.env.JWT_SECRET_PREV || '';
const JWT_EXPIRES_IN: jwt.SignOptions['expiresIn'] = (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'];  // 7天：企业运营系统不应频繁踢出，可通过 JWT_EXPIRES_IN 环境变量覆盖

/**
 * 双密钥校验：先用 JWT_SECRET 试，失败回退到 JWT_SECRET_PREV（若已配置）。
 * 仅用于校验路径；签发始终用主 secret。
 */
function verifyWithRotation(token: string, options?: jwt.VerifyOptions): any {
  try {
    return jwt.verify(token, JWT_SECRET, options);
  } catch (err) {
    if (JWT_SECRET_PREV) {
      try { return jwt.verify(token, JWT_SECRET_PREV, options); }
      catch { /* fall through to throw original */ }
    }
    throw err;
  }
}

/**
 * 复刻 V2.0 phoenix-backend/src/models/init.js 的 hashPwd 算法
 * crypto.scryptSync(pwd, salt, 64).toString('hex')
 */
function hashPwd(pwd: string, salt: string): string {
  return crypto.scryptSync(pwd || '123456', salt, 64).toString('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(SysUserEntity)
    private readonly userRepo: Repository<SysUserEntity>,
  ) {}

  /**
   * POST /api/auth/login
   * 完全兼容 V2.0 phoenix-backend/src/routes/auth.js 的返回格式
   */
  async login(
    username: string,
    password: string,
    ip?: string,
    opts?: { bypassPassword?: boolean; impersonatedBy?: { id: number; username: string } },
  ) {
    try {
    // DEV-ONLY 快捷通道：在 DB 查询之前短路，不依赖 admin 是否在 sys_user 中
    //   条件：NODE_ENV !== 'production' && ENABLE_DEV_LOGIN=true && admin/admin123
    const devLoginEnabled =
      process.env.NODE_ENV !== 'production' &&
      process.env.ENABLE_DEV_LOGIN === 'true';
    if (devLoginEnabled && username === 'admin' && password === 'admin123') {
      this.logger.warn('[DEV] admin quick-login used — disable ENABLE_DEV_LOGIN in staging/prod');
      const payload = {
        userId: 999999999,
        username: 'admin',
        realNameZh: '超级管理员',
        realNameLo: '',
        role: 'ROLE_ADMIN',
        roleNameZh: '集团超级管理员',
        roleNameLo: '',
        storeCode: 'ALL',
        permissions: ['*'] as string[],
        roles: ['ROLE_ADMIN'],
        store_code: 'ALL',
        locale: 'zh-CN',
        sub: 999999999,
        perms_version: 1,
      };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
      const cookieToken = jwt.sign({
        userId: payload.userId, sub: payload.sub, username: payload.username,
        role: payload.role, roles: payload.roles, storeCode: payload.storeCode,
        locale: payload.locale, perms_version: payload.perms_version,
      }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
      return { code: 200, token, cookie_token: cookieToken, user_info: payload };
    }

    // 查用户 + 角色信息（关联 sys_user_role 和 sys_role）
    // V3 架构中角色是多对多，所以使用 array_agg 或 json_agg 聚合角色
    const result = await this.userRepo.query(
      `SELECT
         u.user_id as id, u.username, u.password_hash, u.real_name as real_name_zh,
         u.store_code, u.status, u.locale, u.perms_version,
         COALESCE(
           (SELECT json_agg(
                     json_build_object(
                       'role_code', r.role_code,
                       'role_name_zh', r.role_name_zh,
                       'role_type', r.role_type,
                       'is_primary', ur.is_primary,
                       'is_visible', COALESCE(ur.is_visible, true)
                     )
                     ORDER BY ur.is_primary DESC, r.approval_level DESC NULLS LAST, r.role_id ASC
                   )
            FROM sys_user_role ur
            JOIN sys_role r ON r.role_id = ur.role_id
            WHERE ur.user_id = u.user_id),
           '[]'::json
         ) as roles_info,
         -- 主组织（用于"所属组织"显示）
         (SELECT json_build_object('org_code', o.org_code, 'org_name', o.org_name_cn, 'org_type', o.org_type)
            FROM sys_user_orgs uo
            JOIN sys_organizations o ON o.id = uo.org_id
           WHERE uo.user_id = u.user_id AND uo.is_primary = true
           LIMIT 1) AS primary_org,
         -- 绑定的生产场站（brd_farms.farm_code）
         COALESCE(
           (SELECT json_agg(ufs.farm_code) FROM sys_user_farm_scopes ufs WHERE ufs.user_id = u.user_id),
           '[]'::json
         ) AS bound_farm_codes,
         -- 绑定 SITE 类型组织（生产站点；store_code 字段可能存的是 SITE 代码）
         COALESCE(
           (SELECT json_agg(json_build_object('site_code', o.org_code, 'site_name', o.org_name_cn))
              FROM sys_user_orgs uo
              JOIN sys_organizations o ON o.id = uo.org_id
             WHERE uo.user_id = u.user_id AND o.org_type='SITE'),
           '[]'::json
         ) AS bound_sites
       FROM sys_user u
       WHERE u.username = $1 AND u.status = 1
       LIMIT 1`,
      [username],
    );

    const user = result[0];
    if (!user) {
      throw new UnauthorizedException('账号不存在或已禁用');
    }

    // ── 密码验证 ──────────────────────────────────────────────────────────────
    let isPasswordValid = false;

    if (user.password_hash) {
      // bcrypt 验证（所有 V3 用户密码以 bcrypt $2b$ 格式存储）
      try {
        const bcrypt = await import('bcrypt');
        isPasswordValid = await bcrypt.compare(password, user.password_hash);
      } catch {
        // bcrypt 不可用时降级到 scrypt V2 验证
        const crypto = require('crypto');
        const salt = user.password_hash.split(':')[0];
        if (salt) {
          const hash = crypto.scryptSync(password, salt, 64).toString('hex');
          isPasswordValid = (`${salt}:${hash}` === user.password_hash);
        }
      }
    }

    // opts.bypassPassword 仅供内部 impersonate 调用（HTTP 登录端点永不传入），跳过密码校验
    if (!opts?.bypassPassword && !isPasswordValid) {
      throw new UnauthorizedException('密码错误');
    }


    // 取出主角色（兼容 V2 的单角色机制）
    // roles_info 已按 is_primary DESC, approval_level DESC 排序，[0] 即最高优先角色
    const rolesInfo = user.roles_info || [];
    // 用于前台显示文案：仅 is_visible=true 的角色（不影响权限计算）
    const visibleRoles = rolesInfo.filter((r: any) => r.is_visible !== false);
    // 优先取 is_primary=true 且可见的角色；其次取首个可见；再 fallback 全量首个
    const primaryRoleInfo =
      visibleRoles.find((r: any) => r.is_primary) ??
      visibleRoles[0] ??
      rolesInfo.find((r: any) => r.is_primary) ??
      rolesInfo[0];
    const primaryRole = primaryRoleInfo?.role_code ?? 'ROLE_ADMIN';
    const roleNameZh  = primaryRoleInfo?.role_name_zh ?? '管理员';

    // 是否含超管角色（无论多少个角色，只要有 ROLE_ADMIN 就视为超管）
    const isAdminUser = rolesInfo.some((r: any) => r.role_code === 'ROLE_ADMIN') || username === 'admin';

    // ── V3 RBAC 完整方案：三路权限源合并（按优先级冲突解决）─────────────────
    // 来源 1：sys_user_role → sys_role → sys_role_menu_permission  （角色直绑权限）
    // 来源 2：sys_user_role → sys_role → sys_role_permission_set → sys_permission_set_item （角色带的权限集）
    // 来源 3：sys_user_permission_set → sys_permission_set_item    （用户直绑权限集）
    // 合并：resolvePermissions 函数按 approval_level 降序处理；DENY > GRANT
    let permissions: string[] = [];
    if (isAdminUser) {
      permissions = ['*']; // 超管通配
    } else {
      try {
        const permRows: PermSource[] = await this.userRepo.query(
          `
          -- ① 角色直绑权限
          SELECT
            m.menu_code,
            rmp.perm_codes, rmp.deny_codes, rmp.scope_type, rmp.scope_value,
            COALESCE(r.approval_level, 0) AS approval_level,
            'role'::text AS source
          FROM sys_user_role ur
          JOIN sys_role r                  ON r.role_id = ur.role_id
          JOIN sys_role_menu_permission rmp ON rmp.role_id = r.role_id
          JOIN sys_menu m                  ON m.menu_id = rmp.menu_id
          WHERE ur.user_id = $1

          UNION ALL

          -- ② 角色 → 权限集 → 权限集 item
          SELECT
            m.menu_code,
            psi.perm_codes, psi.deny_codes, psi.scope_type, psi.scope_value,
            COALESCE(r.approval_level, 0) AS approval_level,
            'role_set'::text AS source
          FROM sys_user_role ur
          JOIN sys_role r                       ON r.role_id = ur.role_id
          JOIN sys_role_permission_set rps      ON rps.role_id = r.role_id
          JOIN sys_permission_set_item psi      ON psi.set_id = rps.set_id
          JOIN sys_menu m                       ON m.menu_id = psi.menu_id
          WHERE ur.user_id = $1

          UNION ALL

          -- ③ 用户直绑权限集（绕开角色路径）
          SELECT
            m.menu_code,
            psi.perm_codes, psi.deny_codes, psi.scope_type, psi.scope_value,
            0 AS approval_level,  -- 直绑无角色优先级，默认最低；DENY 仍然生效
            'user_set'::text AS source
          FROM sys_user_permission_set ups
          JOIN sys_permission_set_item psi ON psi.set_id = ups.set_id
          JOIN sys_menu m                  ON m.menu_id = psi.menu_id
          WHERE ups.user_id = $1
          `,
          [user.id],
        );
        permissions = resolvePermissions(permRows);
      } catch (e: any) {
        // 降级：表/列缺失时静默回退（兼容未升级的库）
        console.warn('[AUTH][WARN] Permission query failed:', e?.message);
        permissions = [];
      }
    }

    // 构建 JWT payload（完全兼容 V2.0 格式，并新增 V3.0 字段）
    // 注意：roles 数组用 rolesInfo（全量），权限计算依然按全部已绑角色；
    //       仅 role/roleNameZh（前台显示用）走 visibleRoles 过滤。
    // 判定用户类型：用于前端区分"绑定生产站点"vs"绑定门店"等文案
    // 优先级：visibleRoles[0].role_type → 全量 rolesInfo[0].role_type
    const primaryRoleType: string = primaryRoleInfo?.role_type ?? '';
    const isProductionUser = ['PRODUCTION', 'PACKAGING', 'QUALITY', 'FIELD']
      .includes(primaryRoleType);
    const isStoreUser = ['STORE', 'SALES'].includes(primaryRoleType);
    const userKind: 'production' | 'store' | 'office' =
      isProductionUser ? 'production' : isStoreUser ? 'store' : 'office';

    const payload = {
      userId: user.id,
      username: user.username,
      realNameZh: user.real_name_zh,
      realNameLo: '', // V3 schema 中没有 lo
      role: primaryRole,
      roleNameZh: roleNameZh,
      roleNameLo: '',
      roleType: primaryRoleType,
      userKind,
      storeCode: user.store_code,
      permissions,
      // V3.0 新增字段（向后兼容）
      roles: rolesInfo.map((r: any) => r.role_code),
      // 可见角色列表（前台显示用，权限不变）
      visibleRoles: visibleRoles.map((r: any) => ({
        role_code: r.role_code, role_name_zh: r.role_name_zh, role_type: r.role_type, is_primary: r.is_primary,
      })),
      store_code: user.store_code,
      // 组织 / 场站绑定（个人中心展示用）
      primaryOrg: user.primary_org || null,
      boundFarmCodes: user.bound_farm_codes || [],
      boundSites: user.bound_sites || [],
      locale: user.locale || 'zh-CN',
      sub: user.id,
      // V3 完整方案：JWT 失效机制
      // JwtStrategy.validate 时对账 sys_user.perms_version；版本落后 → 401 强制重登
      perms_version: Number(user.perms_version) || 1,
      // 影子登录标记（仅 impersonate 时存在）：前端据此显示"以 XXX 身份查看"横幅，可追溯
      ...(opts?.impersonatedBy ? { impersonatedBy: opts.impersonatedBy } : {}),
    };


    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    // 瘦身 cookie token：仅供 Next.js 中间件做页面级鉴权（不含 permissions 大数组）。
    // 背景：多角色用户（如刘杰 4 财务角色 / 78 权限）完整 JWT 超 4096B cookie 上限 →
    //   浏览器丢弃 cookie → 中间件读不到 token → 登录后被弹回 /login。
    //   完整 token 仍走 localStorage + Authorization 头，后端 MenuGuard 鉴权不受影响。
    const cookieToken = jwt.sign({
      userId: payload.userId, sub: payload.sub, username: payload.username,
      role: payload.role, roles: payload.roles, roleType: payload.roleType,
      userKind: payload.userKind, storeCode: payload.storeCode,
      locale: payload.locale, perms_version: payload.perms_version,
    }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    return {
      code: 200,
      token,
      cookie_token: cookieToken,
      user_info: payload,
    };
    } catch (err: any) {
      this.logger.error(`[login] failed for user="${username}" — ${err?.message}`, err?.stack);
      throw err;
    }
  }

  /**
   * POST /api/auth/impersonate — 影子登录（仅超管）
   * 为目标用户签发与其真实登录完全一致的会话（权限/数据范围一致），
   * 仅用于 QA/客服排障：以该用户身份查看真实界面、走真实流程。
   * 安全：调用方必须是超管（控制器层校验）；token 带 impersonatedBy 标记；写审计。
   */
  async impersonate(targetUsername: string, adminUser: { userId: number; username: string }, ip?: string) {
    const target = (targetUsername || '').trim();
    if (!target) throw new BadRequestException('目标用户名必填');
    if (target === adminUser.username) throw new BadRequestException('无需以自己的身份查看');
    const targetRoles = await this.userRepo.query(
      `SELECT r.role_code
         FROM sys_user u
         JOIN sys_user_role ur ON ur.user_id = u.user_id
         JOIN sys_role r ON r.role_id = ur.role_id
        WHERE u.username = $1 AND u.status = 1`,
      [target],
    );
    if (targetRoles.some((row: any) => row.role_code === 'ROLE_ADMIN')) {
      throw new ForbiddenException('不允许以超级管理员身份查看');
    }
    // 复用 login 全部解析逻辑（bypassPassword），保证权限/数据范围与真实登录一致
    const session = await this.login(target, '', ip, {
      bypassPassword: true,
      impersonatedBy: { id: adminUser.userId, username: adminUser.username },
    });
    // 审计：谁、以谁身份、何时、来源 IP
    this.logger.warn(`[IMPERSONATE] admin=${adminUser.username}(#${adminUser.userId}) → user=${target} ip=${ip || '-'}`);
    try {
      await this.userRepo.query(
        `INSERT INTO sys_audit_log (user_id, user_name, action, entity_type, entity_id, ip_addr, created_at)
         VALUES ($1, $2, 'IMPERSONATE', 'AUTH', $3, $4, NOW())`,
        [adminUser.userId, adminUser.username, target, ip || null],
      );
    } catch (e: any) {
      this.logger.warn(`[IMPERSONATE] audit log skipped: ${e?.message}`);
    }
    return session;
  }

  /**
   * GET /api/auth/me — 验证当前 Token（V2.0 兼容）
   */
  getMe(token: string) {
    try {
      const decoded: any = verifyWithRotation(token, { clockTolerance: 60 });
      const { iat, exp, ...user } = decoded;
      const remainSec = exp - Math.floor(Date.now() / 1000);
      return {
        code: 200,
        user,
        expires_in: remainSec,
        expires_at: new Date(exp * 1000).toISOString(),
      };
    } catch {
      throw new UnauthorizedException('Token 无效或已过期');
    }
  }

  /**
   * POST /api/auth/refresh — Token 续期（V2.0 兼容）
   */
  refreshToken(token: string) {
    try {
      const decoded: any = verifyWithRotation(token, { ignoreExpiration: true });
      const now = Math.floor(Date.now() / 1000);
      if (now - decoded.exp > 300) {
        throw new UnauthorizedException('Token 已过期超过5分钟，请重新登录');
      }
      const { iat, exp, ...payload } = decoded;
      const newToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
      return { code: 200, token: newToken, msg: 'Token 已刷新' };
    } catch {
      throw new UnauthorizedException('Token 无效，无法刷新');
    }
  }
}
