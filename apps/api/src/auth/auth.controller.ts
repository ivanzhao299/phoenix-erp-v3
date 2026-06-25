import { Controller, Post, Get, Body, Headers, UnauthorizedException, ForbiddenException, BadRequestException, HttpCode, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';

/**
 * 完全兼容 V2.0 /api/auth/* 路由
 */
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/auth/login
   * 与 V2.0 phoenix-backend/src/routes/auth.js 路由 100% 兼容
   */
  @Post('login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ login: { ttl: 900_000, limit: 10 } }) // 15分钟内同一IP最多10次登录尝试
  async login(
    @Body() body: { username: string; password: string },
    @Headers('x-forwarded-for') ip?: string,
  ) {
    if (!body.username || !body.password) {
      return { code: 400, msg: '账号和密码不能为空' };
    }
    return await this.authService.login(body.username, body.password, ip);
  }

  /**
   * POST /api/auth/refresh
   */
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Headers('authorization') authHeader: string) {
    const token = (authHeader || '').split(' ')[1];
    if (!token) {
      throw new UnauthorizedException('未提供 Token');
    }
    return await this.authService.refreshToken(token);
  }

  /**
   * POST /api/auth/impersonate — 影子登录（仅超管）
   * body: { username }。返回目标用户的真实会话（QA/客服以其身份查看真实界面）。
   */
  @Post('impersonate')
  @HttpCode(200)
  async impersonate(
    @Body() body: { username: string; reason?: string },
    @Headers('authorization') authHeader: string,
    @Headers('x-forwarded-for') ip?: string,
  ) {
    const token = (authHeader || '').split(' ')[1];
    if (!token) throw new UnauthorizedException('未提供 Token');
    const me = await this.authService.getMe(token); // 无效 token 抛 401
    const u: any = me.user;
    if (u?.impersonatedBy) {
      throw new ForbiddenException('影子登录会话禁止再次发起影子登录');
    }
    const isSuper =
      (Array.isArray(u.permissions) && u.permissions.includes('*')) ||
      u.role === 'ROLE_ADMIN' ||
      (Array.isArray(u.roles) && u.roles.includes('ROLE_ADMIN'));
    if (!isSuper) throw new ForbiddenException('仅超级管理员可使用「以用户身份查看」');
    if (!body?.username) throw new BadRequestException('目标用户名必填');
    const reason = String(body.reason || '').trim();
    if (reason.length < 6) throw new BadRequestException('影子登录必须填写不少于 6 个字符的审计原因');
    return await this.authService.impersonate(body.username, { userId: u.userId, username: u.username }, ip, reason);
  }

  /**
   * GET /api/auth/me
   */
  @Get('me')
  async getMe(@Headers('authorization') authHeader: string) {
    const token = (authHeader || '').split(' ')[1];
    if (!token) {
      throw new UnauthorizedException('未提供 Token');
    }
    return await this.authService.getMe(token);
  }
}
