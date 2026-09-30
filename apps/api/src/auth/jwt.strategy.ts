import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { isDevLoginAllowedEnvironment } from './dev-login-policy';

export interface JwtPayload {
  sub: number | string;     // user_id: large PostgreSQL bigint values stay decimal strings
  username: string;
  real_name: string;
  store_code: string;       // 'ALL' / 具体机构码 / 逗号分隔列表
  locale: 'zh-CN' | 'lo-LA';
  roles: string[];          // ['ROLE_FIN_ACCT', 'ROLE_CASHIER']
  permissions: string[];    // ['MENU_FIN:V,C', ...] or ['*']
  perms_version: number;    // V3 完整方案：权限快照版本号
  iat: number;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectEntityManager() private readonly em: EntityManager,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    const isProd = (process.env.NODE_ENV || 'development') === 'production';
    const FALLBACK = 'DEV_ONLY_INSECURE_FALLBACK_KEY_DO_NOT_USE_IN_PROD';

    if (isProd && (!jwtSecret || jwtSecret === FALLBACK)) {
      throw new Error('[SEC-CRITICAL] JWT_SECRET 未配置或使用默认值，生产环境禁止启动！请设置环境变量 JWT_SECRET。');
    }
    if (!jwtSecret) {
      console.warn('[SEC-WARN] JWT_SECRET 未设置，当前使用开发临时密钥。生产部署前必须设置！');
    }

    // 双密钥并行：主 secret 失败时回退到 JWT_SECRET_PREV
    // passport-jwt 用 secretOrKeyProvider 异步返回当前密钥；
    // 我们采用"先解析 header 验主、失败再验旧"的策略，借助
    // jsonwebtoken 自己的 verify 来精确控制错误链。
    const prevSecret = configService.get<string>('JWT_SECRET_PREV') || '';

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: (_req: any, rawToken: any, done: any) => {
        // 先尝试主 secret；失败则用旧 secret（如配置）。
        // passport-jwt 会用 done(null, key) 提供的 key 调 jsonwebtoken.verify。
        // 我们这里只决定用哪个 key — 真正的多 key 试错由下面的 try/catch 完成。
        const main = jwtSecret || FALLBACK;
        if (!prevSecret) return done(null, main);
        try {
          // 静默测试主 secret 是否能解开
          require('jsonwebtoken').verify(rawToken, main, { clockTolerance: 60 });
          return done(null, main);
        } catch {
          return done(null, prevSecret);
        }
      },
      // PDA / 收银终端 / 工业触屏机常存在时钟漂移，允许 60s 偏差
      jsonWebTokenOptions: { clockTolerance: 60 },
    });
  }

  /**
   * Passport 自动校验签名与过期后调用
   * 增加 perms_version 对账：JWT 携带的版本若落后于 DB 当前版本 → 401 强制重登
   * 同时核对 sys_user.status：冻结/归档用户的既有 token 立即失效。
   */
  async validate(payload: any) {
    const rawId = payload.sub ?? payload.userId;
    const idText = typeof rawId === 'string' ? rawId
      : typeof rawId === 'number' && Number.isSafeInteger(rawId) ? String(rawId) : '';
    if (!/^[1-9][0-9]{0,18}$/.test(idText) || BigInt(idText) > 9223372036854775807n || !payload.username) {
      throw new UnauthorizedException({ statusCode: 401, subcode: 'INVALID_TOKEN', message: '登录凭证无效' });
    }

    // Keep existing small-ID DTOs numeric; never round a bigint token into another account.
    const userId = BigInt(idText) <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(idText) : idText;

    const devLoginEnabled =
      isDevLoginAllowedEnvironment() &&
      process.env.ENABLE_DEV_LOGIN === 'true';
    if (
      devLoginEnabled &&
      payload.username === 'admin' &&
      userId === 999999999 &&
      (payload.role === 'ROLE_ADMIN' || (Array.isArray(payload.roles) && payload.roles.includes('ROLE_ADMIN')))
    ) {
      return {
        userId,
        username: payload.username,
        realNameZh: payload.realNameZh || payload.real_name,
        realNameLo: payload.realNameLo,
        role: 'ROLE_ADMIN',
        roleNameZh: payload.roleNameZh || '集团超级管理员',
        roleNameLo: payload.roleNameLo,
        storeCode: payload.storeCode || payload.store_code || 'ALL',
        locale: payload.locale || 'zh-CN',
        roles: ['ROLE_ADMIN'],
        permissions: ['*'],
        perms_version: payload.perms_version || 1,
      };
    }

    try {
      const rows: Array<{ perms_version: string | number; status: string | number }> = await this.em.query(
        'SELECT perms_version, status FROM sys_user WHERE user_id = $1 LIMIT 1',
        [userId],
      );
      const current = rows[0];
      if (!current) {
        throw new UnauthorizedException({ statusCode: 401, subcode: 'USER_NOT_FOUND', message: '账号不存在或已失效' });
      }
      if (Number(current.status) !== 1) {
        throw new UnauthorizedException({ statusCode: 401, subcode: 'USER_DISABLED', message: '账号已冻结或归档' });
      }
      if (typeof payload.perms_version === 'number' && Number(current.perms_version ?? 1) > payload.perms_version) {
        throw new UnauthorizedException({ statusCode: 401, subcode: 'PERMS_CHANGED', message: '权限刚刚更新，请重新登录' });
      }
    } catch (e: any) {
      if (e instanceof UnauthorizedException) throw e;
      // Account status and permission version are part of the authentication
      // boundary.  If the lookup cannot be completed, never continue with the
      // claims from the token: doing so would turn a database outage into a
      // fail-open session check.
      console.error('[JWT] account status/version check unavailable; denying token:', e?.message);
      throw new UnauthorizedException({
        statusCode: 401,
        subcode: 'INVALID_TOKEN',
        message: '登录状态暂时无法验证，请稍后重试',
      });
    }

    return {
      userId,
      username: payload.username,
      realNameZh: payload.realNameZh || payload.real_name,
      realNameLo: payload.realNameLo,
      role: payload.role,
      roleNameZh: payload.roleNameZh,
      roleNameLo: payload.roleNameLo,
      storeCode: payload.storeCode || payload.store_code || 'ALL',
      locale: payload.locale || 'zh-CN',
      roles: payload.roles || (payload.role ? [payload.role] : []),
      permissions: payload.permissions || [],
      perms_version: payload.perms_version,
    };
  }
}

/** 测试钩子：清缓存 */
export function __resetJwtVersionCache() {
  return undefined;
}
