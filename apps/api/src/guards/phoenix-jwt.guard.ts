import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

const FALLBACK = 'DEV_ONLY_INSECURE_FALLBACK_KEY_DO_NOT_USE_IN_PROD';

/**
 * PhoenixJwtGuard — 绕过 Passport，直接用 jsonwebtoken 验证 JWT。
 *
 * 401 响应携带标准化 subcode（前端按 subcode 区分处理）：
 *   - NO_TOKEN       未提供 Authorization 头
 *   - TOKEN_EXPIRED  token 已过期（前端可走静默 refresh 路径）
 *   - INVALID_TOKEN  签名错 / payload 无效 / 篡改 / 未生效 → 必须重登
 *
 * 时钟漂移：允许 60s 偏差（与 JwtStrategy 保持一致）
 */
function unauthorized(subcode: 'NO_TOKEN' | 'TOKEN_EXPIRED' | 'INVALID_TOKEN', message: string) {
  return new UnauthorizedException({ statusCode: 401, subcode, message });
}

@Injectable()
export class PhoenixJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader: string = request.headers['authorization'] || request.headers['Authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (!token) {
      throw unauthorized('NO_TOKEN', '未提供登录凭证，请先登录');
    }

    try {
      const JWT_SECRET = process.env.JWT_SECRET || FALLBACK;
      const JWT_SECRET_PREV = process.env.JWT_SECRET_PREV || '';
      let decoded: any;
      try {
        decoded = jwt.verify(token, JWT_SECRET, { clockTolerance: 60 });
      } catch (e) {
        // 轮换期内允许旧 secret 校验通过
        if (JWT_SECRET_PREV) decoded = jwt.verify(token, JWT_SECRET_PREV, { clockTolerance: 60 });
        else throw e;
      }

      const userId = decoded.sub ?? decoded.userId;
      if (userId == null || !decoded.username) {
        throw unauthorized('INVALID_TOKEN', '登录凭证无效');
      }

      request.user = {
        userId,
        username: decoded.username,
        realNameZh: decoded.realNameZh || decoded.real_name || '',
        role: decoded.role || '',
        roleNameZh: decoded.roleNameZh || '',
        storeCode: decoded.storeCode || decoded.store_code || 'ALL',
        locale: decoded.locale || 'zh-CN',
        roles: decoded.roles || (decoded.role ? [decoded.role] : []),
        permissions: decoded.permissions || [],
        perms_version: decoded.perms_version,
      };

      return true;
    } catch (err: any) {
      if (err instanceof UnauthorizedException) throw err;
      if (err?.name === 'TokenExpiredError') {
        throw unauthorized('TOKEN_EXPIRED', '登录已过期，请重新登录');
      }
      // JsonWebTokenError / NotBeforeError / 其他
      throw unauthorized('INVALID_TOKEN', '登录凭证无效，请重新登录');
    }
  }
}
