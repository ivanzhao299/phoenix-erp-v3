import { Controller, Post, Body, Get, Query, Logger, HttpCode } from '@nestjs/common';
import { Public } from '../../common/guards/menu.guard';
import { RequireMenu } from '../../common/guards/menu.guard';
import { ChanjetAuthService } from './chanjet-auth.service';

@Controller('api/chanjet')
export class ChanjetCallbackController {
  private readonly log = new Logger('ChanjetCallback');

  constructor(private readonly auth: ChanjetAuthService) {}

  /**
   * GET /api/chanjet/callback — 畅捷通消息地址验证 + 授权回调
   * 授权回调可能以 GET + query params 形式到达（含 certificate/authCode）。
   */
  @Public()
  @Get('callback')
  async verifyCallback(@Query() query: Record<string, string>) {
    const keys = Object.keys(query);
    if (keys.length > 0) {
      this.log.log(`★ GET callback query: ${JSON.stringify(query).slice(0, 500)}`);
      if (query.certificate) {
        this.auth.setCertificate(query.certificate);
        this.log.log(`★ certificate 从 GET query 捕获: ${query.certificate.slice(0, 40)}…`);
      }
      if (query.authCode) {
        this.log.log(`★ authCode 从 GET query 收到: ${query.authCode.slice(0, 30)}…`);
        try {
          await this.auth.fetchCertificateByAuthCode(query.authCode);
        } catch (e) {
          this.log.warn(`GET authCode→certificate 失败: ${(e as Error).message}`);
        }
      }
    }
    return { result: 'success' };
  }

  /**
   * POST /api/chanjet/callback
   * 畅捷通开放平台消息推送 + 企业授权回调（公开端点，无需 JWT）。
   * 同时处理：APP_TICKET / 企业授权（含 certificate/authCode）/ 其他消息。
   */
  @Public()
  @Post('callback')
  @HttpCode(200)
  async handleCallback(@Body() body: Record<string, unknown>) {
    this.log.log(`★ 收到畅捷通推送 keys=[${Object.keys(body).join(',')}] body=${JSON.stringify(body).slice(0, 800)}`);

    // ─── 路径 A：企业授权回调（非加密，直接 JSON，可能含 certificate/authCode） ───
    const deepGet = (obj: Record<string, unknown>, key: string): string | undefined => {
      if (typeof obj[key] === 'string') return obj[key] as string;
      for (const v of Object.values(obj)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          const found = deepGet(v as Record<string, unknown>, key);
          if (found) return found;
        }
      }
      return undefined;
    };

    const certificate = deepGet(body, 'certificate');
    if (certificate) {
      this.auth.setCertificate(certificate);
      this.log.log(`★ certificate 已从回调捕获: ${certificate.slice(0, 40)}…`);
    }

    const authCode = deepGet(body, 'authCode');
    if (authCode) {
      this.log.log(`★ authCode 已收到: ${authCode.slice(0, 30)}…`);
      try {
        await this.auth.fetchCertificateByAuthCode(authCode);
      } catch (e) {
        this.log.warn(`authCode→certificate 失败: ${(e as Error).message}`);
      }
    }

    // ─── 路径 B：加密消息推送（APP_TICKET 等） ───
    // encryptMsg: 新版格式，密钥 = 环境秘钥原始字节(useRawKey)
    // content:    旧版格式，密钥 = MD5(消息秘钥)
    const isEncryptMsg = !!body.encryptMsg;
    const content = (body.encryptMsg ?? body.content) as string | undefined;
    if (content) {
      let payload: Record<string, unknown>;
      try {
        const decrypted = this.auth.decryptMessage(content, isEncryptMsg);
        payload = JSON.parse(decrypted);
        this.log.log(`解密成功: ${JSON.stringify(payload).slice(0, 500)}`);
      } catch (e) {
        // encryptMsg 解密失败时回退尝试另一种密钥
        if (isEncryptMsg) {
          try {
            const decrypted = this.auth.decryptMessage(content, false);
            payload = JSON.parse(decrypted);
            this.log.log(`解密成功(回退MD5密钥): ${JSON.stringify(payload).slice(0, 500)}`);
          } catch {
            this.log.error(`encryptMsg 两种密钥均解密失败: ${(e as Error).message}`);
            return { result: 'success' };
          }
        } else {
          this.log.warn(`解密失败，尝试明文解析: ${(e as Error).message}`);
          try {
            payload = typeof content === 'string' ? JSON.parse(content) : content as Record<string, unknown>;
          } catch {
            this.log.error('消息体既非加密也非合法 JSON');
            return { result: 'success' };
          }
        }
      }

      const msgType = (payload.msgType ?? body.msgType ?? '') as string;

      if (msgType === 'APP_TICKET' || payload.appTicket) {
        const biz = payload.bizContent as Record<string, unknown> | undefined;
        const ticket = (biz?.appTicket ?? payload.appTicket ?? payload.ticket) as string;
        if (ticket) {
          this.auth.setAppTicket(ticket);
          this.log.log('appTicket 已更新');
        }
      }

      const payloadCert = deepGet(payload, 'certificate');
      if (payloadCert) {
        this.auth.setCertificate(payloadCert);
        this.log.log(`★ certificate 已从加密消息捕获: ${payloadCert.slice(0, 40)}…`);
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
   * 管理员手动调用好业财账套列表接口验证连通性（全链路实证）。
   */
  @Get('test-api')
  @RequireMenu('MENU_SYSTEM', 'V')
  async testApi() {
    try {
      const result = await this.auth.listAccountBooks();
      return { success: true, result };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET/POST /api/chanjet/call
   * 通用 proxy:管理员手动 callApi 任意好业财路径(试错+查 API 文档用)。
   *
   * 用法(GET 查询):
   *   GET /api/chanjet/call?path=/accounting/openapi/cc/book/findByEnterpriseId&method=GET
   *   GET /api/chanjet/call?path=/accounting/openapi/cc/party/custvendor/query/{bookid}&bookid=3533914511118750&method=GET
   *
   * 用法(POST body):
   *   POST /api/chanjet/call
   *   { "path": "/accounting/openapi/cc/xxx", "method": "POST", "body": { ... }, "bookid": "xxx" }
   *
   * path 中 {bookid} 占位符会被 query.bookid 或 body.bookid 替换。
   */
  @Get('call')
  @RequireMenu('MENU_SYSTEM', 'V')
  async callGet(@Query() query: Record<string, string>) {
    return this.doCall(query.path, {
      method: (query.method as 'GET' | 'POST') || 'GET',
      bookid: query.bookid,
      queryStr: query.q,
    });
  }

  @Post('call')
  @RequireMenu('MENU_SYSTEM', 'V')
  async callPost(@Body() body: { path: string; method?: 'GET' | 'POST'; bookid?: string; body?: Record<string, unknown>; query?: Record<string, string> }) {
    return this.doCall(body.path, {
      method: body.method || 'POST',
      bookid: body.bookid,
      body: body.body,
      query: body.query,
    });
  }

  private async doCall(
    rawPath: string,
    opts: { method: 'GET' | 'POST'; bookid?: string; body?: Record<string, unknown>; query?: Record<string, string>; queryStr?: string } = { method: 'GET' },
  ) {
    if (!rawPath) return { success: false, error: 'path 不能为空' };
    const path = opts.bookid ? rawPath.replace('{bookid}', opts.bookid) : rawPath;
    try {
      // queryStr 是 "k1=v1&k2=v2" 简写形式,解析成 query map
      const queryMap: Record<string, string> = opts.query || {};
      if (opts.queryStr) {
        for (const kv of opts.queryStr.split('&')) {
          const [k, v] = kv.split('=');
          if (k) queryMap[k] = v || '';
        }
      }
      const result = await this.auth.callApi(path, {
        method: opts.method,
        query: queryMap,
        body: opts.body,
      });
      return { success: true, path, result };
    } catch (e) {
      return { success: false, path, error: (e as Error).message };
    }
  }

  /**
   * POST /api/chanjet/set-cert
   * 管理员手动设置 certificate（从畅捷通控制台复制）。
   */
  @Post('set-cert')
  @RequireMenu('MENU_SYSTEM', 'V')
  setCert(@Body() body: { certificate: string }) {
    if (!body.certificate) return { success: false, error: 'certificate 不能为空' };
    this.auth.setCertificate(body.certificate);
    return { success: true, certPreview: body.certificate.slice(0, 30) + '…' };
  }

  /**
   * POST /api/chanjet/set-ticket
   * 管理员手动注入 appTicket（容器重启后丢失时用）。
   */
  @Post('set-ticket')
  @RequireMenu('MENU_SYSTEM', 'V')
  setTicket(@Body() body: { appTicket: string }) {
    if (!body.appTicket) return { success: false, error: 'appTicket 不能为空' };
    this.auth.setAppTicket(body.appTicket);
    return { success: true, ticketPreview: body.appTicket.slice(0, 20) + '…' };
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

  /**
   * POST /api/chanjet/test-callback
   * 管理员用已知密钥测试回调解密链路。
   */
  @Post('test-callback')
  @RequireMenu('MENU_SYSTEM', 'V')
  testCallback(@Body() body: Record<string, unknown>) {
    const isEncryptMsg = !!body.encryptMsg;
    const content = (body.encryptMsg ?? body.content) as string | undefined;
    if (!content) return { success: false, error: '无 encryptMsg/content' };

    const results: string[] = [];
    try {
      const dec = this.auth.decryptMessage(content, isEncryptMsg);
      results.push(`rawKey解密: ${dec.slice(0, 200)}`);
      const parsed = JSON.parse(dec);
      const biz = parsed.bizContent as Record<string, unknown> | undefined;
      const ticket = (biz?.appTicket ?? parsed.appTicket ?? parsed.ticket) as string;
      results.push(`ticket=${ticket || '(空)'}`);
      return { success: true, results };
    } catch (e1) {
      results.push(`rawKey失败: ${(e1 as Error).message}`);
      if (isEncryptMsg) {
        try {
          const dec = this.auth.decryptMessage(content, false);
          results.push(`md5Key解密: ${dec.slice(0, 200)}`);
          return { success: true, results };
        } catch (e2) {
          results.push(`md5Key失败: ${(e2 as Error).message}`);
        }
      }
      return { success: false, results };
    }
  }
}
