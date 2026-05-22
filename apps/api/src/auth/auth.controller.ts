import { Controller, Post, Get, Body, Headers, UnauthorizedException, HttpCode, UseGuards } from '@nestjs/common';
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
