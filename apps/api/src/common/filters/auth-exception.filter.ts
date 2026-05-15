import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';

type AuthSubcode = 'NO_TOKEN' | 'TOKEN_EXPIRED' | 'INVALID_TOKEN' | 'PERMS_CHANGED';

/**
 * AuthExceptionFilter — 保证所有 401 响应携带标准 subcode
 *
 * 前端 api-client 按 subcode 选择行为：
 *   - TOKEN_EXPIRED → 静默调 /api/auth/refresh，重发原请求（用户无感）
 *   - PERMS_CHANGED → 友好跳 /login?reason=perms_changed
 *   - INVALID_TOKEN / NO_TOKEN → 跳 /login?reason=expired
 *
 * 处理来源：
 *   - PhoenixJwtGuard / JwtStrategy 主动抛带 subcode 的 UnauthorizedException → 透传
 *   - Passport auto-thrown UnauthorizedException（无 subcode）→ 从 message / errorInfo 推断
 */
@Catch(UnauthorizedException)
export class AuthExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx  = host.switchToHttp();
    const res  = ctx.getResponse<Response>();
    const body = exception.getResponse();

    let subcode: AuthSubcode = 'INVALID_TOKEN';
    let message = '登录凭证无效，请重新登录';

    if (typeof body === 'object' && body !== null) {
      const b = body as { subcode?: AuthSubcode; message?: string };
      if (b.subcode) subcode = b.subcode;
      if (b.message) message = b.message;
    } else if (typeof body === 'string') {
      message = body;
      // 从 message 推断 subcode（passport-jwt 默认错误信息）
      const lower = body.toLowerCase();
      if (lower.includes('jwt expired') || lower.includes('已过期')) subcode = 'TOKEN_EXPIRED';
      else if (lower.includes('no auth token') || lower.includes('未提供')) subcode = 'NO_TOKEN';
      else if (lower.includes('权限已变更') || lower.includes('perms')) subcode = 'PERMS_CHANGED';
    }

    res.status(401).json({
      statusCode: 401,
      subcode,
      message,
      error: 'Unauthorized',
    });
  }
}
