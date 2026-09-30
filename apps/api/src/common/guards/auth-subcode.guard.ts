import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Passport JWT guard that preserves a stable client-facing 401 subcode. */
@Injectable()
export class AuthSubcodeGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(err: unknown, user: TUser, info: { name?: string } | undefined, context: ExecutionContext) {
    if (err instanceof UnauthorizedException) throw err;
    if (err || !user) {
      const request = context.switchToHttp().getRequest<{ headers?: Record<string, string | undefined> }>();
      const headers = request.headers ?? {};
      const authHeader = headers.authorization || headers.Authorization;
      const subcode = !authHeader
        ? 'NO_TOKEN'
        : info?.name === 'TokenExpiredError'
          ? 'TOKEN_EXPIRED'
          : 'INVALID_TOKEN';
      const message = subcode === 'NO_TOKEN'
        ? '未提供登录凭证，请先登录'
        : subcode === 'TOKEN_EXPIRED'
          ? '登录已过期，请重新登录'
          : '登录凭证无效，请重新登录';
      throw new UnauthorizedException({ statusCode: 401, subcode, message });
    }
    return user;
  }
}
