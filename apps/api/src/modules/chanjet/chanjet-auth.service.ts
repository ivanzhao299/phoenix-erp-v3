import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

interface TokenEntry {
  openToken: string;
  expiresAt: number;
}

@Injectable()
export class ChanjetAuthService implements OnModuleInit {
  private readonly log = new Logger('ChanjetAuth');

  private appKey: string;
  private appSecret: string;
  private orgId: string;
  private msgSecret: string;
  private cert: string;

  private appTicket = '';
  private tokenCache = new Map<string, TokenEntry>();

  constructor(private cfg: ConfigService) {}

  onModuleInit() {
    this.appKey    = this.cfg.get('CHANJET_APP_KEY', '');
    this.appSecret = this.cfg.get('CHANJET_APP_SECRET', '');
    this.orgId     = this.cfg.get('CHANJET_ORG_ID', '');
    this.msgSecret = this.cfg.get('CHANJET_MSG_SECRET', '');
    this.cert      = this.cfg.get('CHANJET_CERT', '');

    if (!this.appKey) {
      this.log.warn('CHANJET_APP_KEY 未配置，畅捷通对接禁用');
    } else {
      this.log.log(`畅捷通对接就绪 appKey=${this.appKey} orgId=${this.orgId}`);
    }
  }

  isConfigured(): boolean {
    return !!this.appKey && !!this.appSecret;
  }

  getAppTicket(): string {
    return this.appTicket;
  }

  setAppTicket(ticket: string) {
    this.appTicket = ticket;
    this.log.log(`appTicket 已更新: ${ticket.slice(0, 20)}…`);
  }

  setCertificate(cert: string) {
    this.cert = cert;
    this.log.log(`certificate 已更新: ${cert.slice(0, 30)}…`);
  }

  /** 用 authCode 换 certificate（企业授权回调场景） */
  async fetchCertificateByAuthCode(authCode: string): Promise<string> {
    const url = 'https://openapi.chanjet.com/auth/certificate';
    const body = {
      appKey: this.appKey,
      appSecret: this.appSecret,
      authCode,
    };
    this.log.log(`POST ${url} (authCode)`);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json() as Record<string, unknown>;
    this.log.log(`certificate(authCode) 响应: ${JSON.stringify(json).slice(0, 500)}`);

    const result = json.result as Record<string, unknown> | undefined;
    const certificate = (result?.certificate ?? json.certificate
      ?? (json.data as Record<string, unknown>)?.certificate
      ?? (json.value as Record<string, unknown>)?.certificate) as string | undefined;
    if (certificate) {
      this.cert = certificate;
      return certificate;
    }
    throw new Error(`authCode→certificate 失败: ${JSON.stringify(json).slice(0, 500)}`);
  }

  /**
   * AES/ECB/PKCS5Padding 解密畅捷通推送消息体。
   * useRawKey=true: encryptMsg 格式，密钥 = 环境秘钥原始 UTF-8 字节（16字符）
   * useRawKey=false: content 格式（旧），密钥 = MD5(消息秘钥)
   */
  decryptMessage(encrypted: string, useRawKey = false): string {
    if (!this.msgSecret) throw new Error('CHANJET_MSG_SECRET 未配置');
    const key = useRawKey
      ? Buffer.from(this.msgSecret, 'utf8')
      : crypto.createHash('md5').update(this.msgSecret).digest();
    const decipher = crypto.createDecipheriv('aes-128-ecb', key, null);
    decipher.setAutoPadding(true);
    let dec = decipher.update(encrypted, 'base64', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  }

  /** 用 appTicket 换 certificate（如果 .env 已有 CHANJET_CERT 可跳过） */
  async fetchCertificate(): Promise<string> {
    if (this.cert) return this.cert;

    if (!this.appTicket) {
      throw new Error('无 appTicket 且无预置 CHANJET_CERT，无法获取证书');
    }

    const url = 'https://openapi.chanjet.com/auth/certificate';
    const body = {
      appKey: this.appKey,
      appSecret: this.appSecret,
      appTicket: this.appTicket,
    };
    this.log.log(`POST ${url}`);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json() as Record<string, unknown>;
    this.log.log(`certificate 响应: ${JSON.stringify(json).slice(0, 300)}`);

    const result = json.result as Record<string, unknown> | undefined;
    const certificate = (result?.certificate ?? json.certificate ?? (json.data as Record<string, unknown>)?.certificate) as string | undefined;
    if (!certificate) {
      throw new Error(`获取 certificate 失败: ${JSON.stringify(json).slice(0, 500)}`);
    }

    this.cert = certificate;
    return certificate;
  }

  /** 用 appTicket + certificate 换 openToken（accessToken） */
  async getOpenToken(orgId?: string): Promise<string> {
    const targetOrg = orgId || this.orgId;
    const cached = this.tokenCache.get(targetOrg);
    if (cached && Date.now() < cached.expiresAt - 60_000) {
      return cached.openToken;
    }

    if (!this.appTicket) {
      throw new Error('无 appTicket，请先配置消息接收地址并触发 appTicket 推送');
    }

    const certificate = await this.fetchCertificate();
    const url = 'https://openapi.chanjet.com/v1/common/auth/selfBuiltApp/generateToken';
    this.log.log(`POST ${url}`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        appKey: this.appKey,
        appSecret: this.appSecret,
      },
      body: JSON.stringify({ appTicket: this.appTicket, certificate }),
    });
    const json = await res.json() as Record<string, unknown>;
    this.log.log(`generateToken 响应: ${JSON.stringify(json).slice(0, 300)}`);

    const value = json.value as Record<string, unknown> | undefined;
    const accessToken = value?.accessToken as string | undefined;
    const expiresIn = Number(value?.expiresIn ?? 7200);

    if (!accessToken) {
      const err = json.error as Record<string, unknown> | undefined;
      throw new Error(`获取 openToken 失败: code=${err?.code} msg=${err?.msg} hint=${err?.hint}`);
    }

    this.tokenCache.set(targetOrg, {
      openToken: accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
    });
    this.log.log(`openToken 已缓存 orgId=${targetOrg}，有效 ${expiresIn}s`);
    return accessToken;
  }

  /** 主动触发 appTicket 推送（需消息接收地址已配好） */
  async triggerAppTicket(): Promise<Record<string, unknown>> {
    const url = 'https://openapi.chanjet.com/auth/appTicket/resend';
    this.log.log(`POST ${url}`);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        appKey: this.appKey,
        appSecret: this.appSecret,
      },
    });
    const json = await res.json() as Record<string, unknown>;
    this.log.log(`triggerAppTicket 响应: ${JSON.stringify(json).slice(0, 300)}`);
    return json;
  }

  /**
   * 调用好业财业务 API（开放平台路径体系：/accounting/openapi/cc/...）。
   * @param path  完整接口路径，如 `/accounting/openapi/cc/party/custvendor/query/{bookid}`
   *              （{bookid} 用 listAccountBooks() 返回的 tenant.id 替换）
   * @param opts  method 默认 POST；GET 用 query，POST 用 body
   */
  async callApi<T = unknown>(
    path: string,
    opts: { method?: 'GET' | 'POST'; query?: Record<string, string>; body?: Record<string, unknown>; orgId?: string } = {},
  ): Promise<T> {
    const token = await this.getOpenToken(opts.orgId);
    let url = `https://openapi.chanjet.com${path}`;
    if (opts.query && Object.keys(opts.query).length) {
      url += `?${new URLSearchParams(opts.query).toString()}`;
    }
    const method = opts.method ?? 'POST';
    this.log.debug(`${method} ${url}`);

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        appKey: this.appKey,
        appSecret: this.appSecret,
        openToken: token,
      },
      ...(method === 'POST' ? { body: JSON.stringify(opts.body ?? {}) } : {}),
    });
    return (await res.json()) as T;
  }

  /**
   * 查询当前企业下的账套列表（好业财 bookid 来源）。
   * 返回数组，每项 tenant.id 即业务接口路径中的 {bookid}。
   */
  async listAccountBooks(orgId?: string): Promise<unknown> {
    return this.callApi('/accounting/openapi/cc/book/findByEnterpriseId', {
      method: 'GET',
      query: { queryType: 'BINDING_TO_THIRD_PLATFORM' },
      orgId,
    });
  }

  /** 诊断：返回当前认证链状态 */
  diagnostics() {
    const tokens: Record<string, { expiresAt: string; valid: boolean }> = {};
    for (const [org, entry] of this.tokenCache) {
      tokens[org] = {
        expiresAt: new Date(entry.expiresAt).toISOString(),
        valid: Date.now() < entry.expiresAt - 60_000,
      };
    }
    return {
      configured: this.isConfigured(),
      appKey: this.appKey || '(空)',
      orgId: this.orgId || '(空)',
      hasAppTicket: !!this.appTicket,
      hasCert: !!this.cert,
      certPreview: this.cert ? this.cert.slice(0, 20) + '…' : '(空)',
      tokens,
    };
  }
}
