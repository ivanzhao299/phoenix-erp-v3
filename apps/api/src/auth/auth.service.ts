import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
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
const JWT_EXPIRES_IN: jwt.SignOptions['expiresIn'] = (process.env.JWT_EXPIRES_IN || '24h') as jwt.SignOptions['expiresIn'];  // 覆盖夜班 / 跨日操作

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
  async login(username: string, password: string, ip?: string) {
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
      return { code: 200, token, user_info: payload };
    }

    // 查用户 + 角色信息（关联 sys_user_role 和 sys_role）
    // V3 架构中角色是多对多，所以使用 array_agg 或 json_agg 聚合角色
    const result = await this.userRepo.query(
      `SELECT
         u.user_id as id, u.username, u.password_hash, u.real_name as real_name_zh,
         u.store_code, u.status, u.locale, u.perms_version,
         COALESCE(
           (SELECT json_agg(
                     json_build_object('role_code', r.role_code, 'role_name_zh', r.role_name_zh, 'is_primary', ur.is_primary)
                     ORDER BY ur.is_primary DESC, r.approval_level DESC NULLS LAST, r.role_id ASC
                   )
            FROM sys_user_role ur
            JOIN sys_role r ON r.role_id = ur.role_id
            WHERE ur.user_id = u.user_id),
           '[]'::json
         ) as roles_info
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

    if (!isPasswordValid) {
      throw new UnauthorizedException('密码错误');
    }


    // 取出主角色（兼容 V2 的单角色机制）
    // roles_info 已按 is_primary DESC, approval_level DESC 排序，[0] 即最高优先角色
    const rolesInfo = user.roles_info || [];
    // 优先取 is_primary=true 的角色；若无，取排序后的第一个
    const primaryRoleInfo = rolesInfo.find((r: any) => r.is_primary) ?? rolesInfo[0];
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
    const payload = {
      userId: user.id,
      username: user.username,
      realNameZh: user.real_name_zh,
      realNameLo: '', // V3 schema 中没有 lo
      role: primaryRole,
      roleNameZh: roleNameZh,
      roleNameLo: '',
      storeCode: user.store_code,
      permissions,
      // V3.0 新增字段（向后兼容）
      roles: rolesInfo.map((r: any) => r.role_code),
      store_code: user.store_code,
      locale: user.locale || 'zh-CN',
      sub: user.id,
      // V3 完整方案：JWT 失效机制
      // JwtStrategy.validate 时对账 sys_user.perms_version；版本落后 → 401 强制重登
      perms_version: Number(user.perms_version) || 1,
    };


    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    return {
      code: 200,
      token,
      user_info: payload,
    };
    } catch (err: any) {
      this.logger.error(`[login] failed for user="${username}" — ${err?.message}`, err?.stack);
      throw err;
    }
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
