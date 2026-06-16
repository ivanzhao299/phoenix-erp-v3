import { Controller, Post, Body, Get, Logger, HttpCode } from '@nestjs/common';
import { Public } from '../../common/guards/menu.guard';
import { RequireMenu } from '../../common/guards/menu.guard';
import { ChanjetAuthService } from './chanjet-auth.service';

@Controller('api/chanjet')
export class ChanjetCallbackController {
  private readonly log = new Logger('ChanjetCallback');

  constructor(private readonly auth: ChanjetAuthService) {}

  /** GET /api/chanjet/callback — 畅捷通消息地址验证 */
  @Public()
  @Get('callback')
  verifyCallback() {
    return { result: 'success' };
  }

  /**
   * POST /api/chanjet/callback
   * 畅捷通开放平台消息推送回调（公开端点，无需 JWT）。
   */
  @Public()
  @Post('callback')
  @HttpCode(200)
  async handleCallback(@Body() body: { msgType?: string; content?: string; [key: string]: unknown }) {
    this.log.log(`收到畅捷通推送: msgType=${body.msgType ?? '(无)'}`);

    if (!body.content) {
      this.log.warn('推送消息无 content 字段');
      return { result: 'success' };
    }

    let payload: Record<string, unknown>;
    try {
      const decrypted = this.auth.decryptMessage(body.content);
      payload = JSON.parse(decrypted);
      this.log.log(`解密成功: ${JSON.stringify(payload).slice(0, 200)}`);
    } catch (e) {
      this.log.warn(`解密失败，尝试明文解析: ${(e as Error).message}`);
      try {
        payload = typeof body.content === 'string' ? JSON.parse(body.content) : body.content as Record<string, unknown>;
      } catch {
        this.log.error('消息体既非加密也非合法 JSON');
        return { result: 'success' };
      }
    }

    const msgType = (payload.msgType ?? body.msgType ?? '') as string;

    if (msgType === 'APP_TICKET' || payload.appTicket) {
      const ticket = (payload.appTicket ?? payload.ticket) as string;
      if (ticket) {
        this.auth.setAppTicket(ticket);
        this.log.log('appTicket 已更新');
      }
    }

    return { result: 'success' };
  }

  /**
   * GET /api/chanjet/diagnostics
   * 管理员查看畅捷通认证链状态。
   */
  @Get('diagnostics')
  @RequireMenu('MENU_SYSTEM', 'V')
  diagnostics() {
    return this.auth.diagnostics();
  }

  /**
   * GET /api/chanjet/test-token
   * 管理员手动触发 token 获取测试。
   */
  @Get('test-token')
  @RequireMenu('MENU_SYSTEM', 'V')
  async testToken() {
    try {
      const token = await this.auth.getOpenToken();
      return { success: true, tokenPreview: token.slice(0, 30) + '…' };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/test-api
   * 管理员手动调用好业财科目列表接口验证连通性。
   */
  @Get('test-api')
  @RequireMenu('MENU_SYSTEM', 'V')
  async testApi() {
    try {
      const result = await this.auth.callApi('Account', 'Query', { pageIndex: 1, pageSize: 3 });
      return { success: true, result };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * POST /api/chanjet/trigger-ticket
   * 管理员手动触发 appTicket 推送（需消息接收地址已配好）。
   */
  @Post('trigger-ticket')
  @RequireMenu('MENU_SYSTEM', 'V')
  async triggerTicket() {
    try {
      const result = await this.auth.triggerAppTicket();
      return { success: true, result };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }
}
