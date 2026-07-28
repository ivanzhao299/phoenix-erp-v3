import { Controller, Post, Body, Get, Query, Headers, Logger, HttpCode, HttpStatus, UseGuards, ForbiddenException, Req, Param } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public, MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';
import { ChanjetAuthService } from './chanjet-auth.service';
import { ChanjetArSyncService } from './chanjet-ar-sync.service';
import { ChanjetExternalCanaryApprovalInput, ChanjetIntegrationService } from './chanjet-integration.service';
import { ChanjetReadonlySyncScheduler } from './chanjet-readonly-sync.scheduler';
import { ChanjetWmsBridgeService, PrepareWmsWritebackInput } from './chanjet-wms-bridge.service';
import { ChanjetWmsPromotionState } from './chanjet-wms-promotion-candidate.entity';
import * as crypto from 'crypto';

type ChanjetProxyMethod = 'GET' | 'POST';

const CHANJET_PROXY_READONLY_RULES: ReadonlyArray<{
  method: ChanjetProxyMethod;
  path: RegExp;
}> = [
  { method: 'GET', path: /^\/accounting\/openapi\/cc\/book\/findByEnterpriseId$/ },
  { method: 'GET', path: /^\/accounting\/gl\/glaccount\/getInitBalanceLists\/[^/?#]+$/ },
  { method: 'GET', path: /^\/accounting\/gl\/statistics\/(?:pay|receive)\/[^/?#]+$/ },
  { method: 'GET', path: /^\/accounting\/gl\/AcctgTrans\/acctgTransFuzzySearch\/[^/?#]+$/ },
  { method: 'GET', path: /^\/accounting\/fin\/getOld(?:BalanceSheet|IncomeStatement)\/[^/?#]+$/ },
  { method: 'GET', path: /^\/accounting\/asr\/CashFlow\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/department\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/party\/custvendor\/query\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/project\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/finaccount\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/payment\/(?:ap|ar)\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/purchaseorder\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/inv\/purchaseapply\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/purchasestockin\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/salesstockout\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/inv\/onhandqty\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/inv\/onhandqtylot\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/inv\/finishedgoodsstock\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/inv\/materialstock\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/inv\/stockin\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/inv\/stockout\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/inv\/stocktransfer\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/inv\/stockcount\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/retailstock\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/salesorder\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/gl\/balance\/rpt\/[^/?#]+$/ },
];

export function assertChanjetProxyReadonly(method: ChanjetProxyMethod, path: string) {
  const allowed = CHANJET_PROXY_READONLY_RULES.some((rule) => rule.method === method && rule.path.test(path));
  if (!allowed) {
    throw new ForbiddenException('CHANJET_EXTERNAL_WRITE_DISABLED: proxy only allows reviewed readonly endpoints');
  }
}
const CHANJET_PROXY_MENU = 'MENU_SETTINGS_CHANJET';
const CHANJET_CONFIG_MENU = 'MENU_SETTINGS_CHANJET';

@Controller('api/chanjet')
@UseGuards(MenuGuard, DataScopeGuard)
export class ChanjetCallbackController {
  private readonly log = new Logger('ChanjetCallback');
  private readonly nonceCache = new Map<string, number>();

  constructor(
    private readonly auth: ChanjetAuthService,
    private readonly arSync: ChanjetArSyncService,
    private readonly integration: ChanjetIntegrationService,
    private readonly readonlySyncScheduler: ChanjetReadonlySyncScheduler,
    private readonly wmsBridge: ChanjetWmsBridgeService,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  private maskSensitive(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.maskSensitive(item));
    if (!value || typeof value !== 'object') return value;
    const masked: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/certificate|authCode|appTicket|openToken|accessToken|secret|signature/i.test(key)) {
        masked[key] = '[REDACTED]';
      } else {
        masked[key] = this.maskSensitive(item);
      }
    }
    return masked;
  }

  private callbackSecret(): string {
    return process.env.CHANJET_CALLBACK_SECRET || process.env.CHANJET_MSG_SECRET || process.env.CHANJET_APP_SECRET || '';
  }

  private expectedSignatures(secret: string, timestamp: string, nonce: string, body: Record<string, unknown>) {
    const payload = `${timestamp}.${nonce}.${JSON.stringify(body ?? {})}`;
    const digest = crypto.createHmac('sha256', secret).update(payload).digest();
    return [digest.toString('hex'), digest.toString('base64')];
  }

  private normalizeChanjetProxyPath(rawPath: string, bookid?: string) {
    const trimmed = String(rawPath || '').trim();
    if (!trimmed) throw new ForbiddenException('Chanjet proxy path required');
    if (/^https?:\/\//i.test(trimmed) || trimmed.includes('..') || trimmed.includes('\\')) {
      throw new ForbiddenException('Chanjet proxy path rejected');
    }
    const path = bookid ? trimmed.replace('{bookid}', encodeURIComponent(bookid)) : trimmed;
    if (!path.startsWith('/accounting/') || path.includes('?') || path.includes('#')) {
      throw new ForbiddenException('Chanjet proxy only allows accounting API paths');
    }
    return path;
  }

  private normalizeChanjetProxyMethod(method?: string): ChanjetProxyMethod {
    const m = String(method || 'GET').toUpperCase();
    if (m !== 'GET' && m !== 'POST') {
      throw new ForbiddenException('Chanjet proxy only allows GET/POST');
    }
    return m;
  }

  private verifyCallbackSignature(headers: Record<string, string | string[] | undefined>, body: Record<string, unknown>) {
    const secret = this.callbackSecret();
    const signature = String(headers['x-chanjet-signature'] || headers['X-Chanjet-Signature'] || '');
    const timestamp = String(headers['x-chanjet-timestamp'] || headers['X-Chanjet-Timestamp'] || '');
    const nonce = String(headers['x-chanjet-nonce'] || headers['X-Chanjet-Nonce'] || '');

    if (!secret || !signature || !timestamp || !nonce) {
      throw new ForbiddenException('Chanjet callback signature required');
    }

    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) throw new ForbiddenException('Invalid Chanjet callback timestamp');
    const timestampMs = ts > 10_000_000_000 ? ts : ts * 1000;
    if (Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
      throw new ForbiddenException('Expired Chanjet callback timestamp');
    }

    const nonceKey = `${timestamp}:${nonce}`;
    const now = Date.now();
    for (const [key, expiresAt] of this.nonceCache.entries()) {
      if (expiresAt < now) this.nonceCache.delete(key);
    }
    if (this.nonceCache.has(nonceKey)) {
      throw new ForbiddenException('Replay Chanjet callback nonce');
    }

    const expected = this.expectedSignatures(secret, timestamp, nonce, body);
    const provided = Buffer.from(signature);
    const ok = expected.some((candidate) => {
      const expectedBuffer = Buffer.from(candidate);
      return provided.length === expectedBuffer.length && crypto.timingSafeEqual(provided, expectedBuffer);
    });
    if (!ok) throw new ForbiddenException('Invalid Chanjet callback signature');
    this.nonceCache.set(nonceKey, now + 5 * 60 * 1000);
  }

  private verifyCallbackSignatureIfPresent(
    headers: Record<string, string | string[] | undefined>,
    body: Record<string, unknown>,
    allowEncryptedWithoutSignature: boolean,
  ): boolean {
    const signature = String(headers['x-chanjet-signature'] || headers['X-Chanjet-Signature'] || '');
    const timestamp = String(headers['x-chanjet-timestamp'] || headers['X-Chanjet-Timestamp'] || '');
    const nonce = String(headers['x-chanjet-nonce'] || headers['X-Chanjet-Nonce'] || '');
    if (signature || timestamp || nonce) {
      this.verifyCallbackSignature(headers, body);
      return true;
    }
    if (allowEncryptedWithoutSignature) {
      this.log.warn('Chanjet encrypted callback received without x-chanjet signature headers; relying on message decryption');
      return false;
    }
    this.verifyCallbackSignature(headers, body);
    return true;
  }

  private hasPlaintextCredential(body: Record<string, unknown>): boolean {
    const visit = (value: unknown): boolean => {
      if (!value || typeof value !== 'object') return false;
      if (Array.isArray(value)) return value.some((item) => visit(item));
      return Object.entries(value as Record<string, unknown>).some(([key, item]) => (
        /certificate|authCode|appTicket|openToken|accessToken/i.test(key)
        || visit(item)
      ));
    };
    return visit(body);
  }

  /**
   * GET /api/chanjet/callback — 畅捷通消息地址验证 + 授权回调
   * GET 只用于平台地址验证。证书 / 授权码等敏感字段必须走带签名的 POST callback。
   */
  @Public()
  @Get('callback')
  async verifyCallback(@Query() query: Record<string, string>) {
    const keys = Object.keys(query);
    if (keys.length > 0) {
      const sensitiveKeys = keys.filter((key) => /certificate|authCode|appTicket|openToken|accessToken|secret|signature/i.test(key));
      this.log.log(`★ GET callback verification query keys=[${keys.join(',')}] sensitiveKeys=[${sensitiveKeys.join(',') || 'none'}]`);
      if (sensitiveKeys.length) {
        this.log.warn('GET callback ignored sensitive credential fields; signed POST callback is required to update Chanjet auth state');
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
  async handleCallback(@Body() body: Record<string, unknown>, @Headers() headers: Record<string, string | string[] | undefined>) {
    const isEncryptMsg = !!body.encryptMsg;
    const content = (body.encryptMsg ?? body.content) as string | undefined;
    const hasEncryptedContent = typeof content === 'string' && content.length > 0;
    if (!hasEncryptedContent && !this.hasPlaintextCredential(body)) {
      this.log.log(`Chanjet callback validation ping accepted keys=[${Object.keys(body ?? {}).join(',') || 'none'}]`);
      return { result: 'success' };
    }
    const signatureVerified = this.verifyCallbackSignatureIfPresent(headers, body, hasEncryptedContent);
    this.log.log(`★ 收到畅捷通推送 keys=[${Object.keys(body).join(',')}] body=${JSON.stringify(this.maskSensitive(body)).slice(0, 800)}`);

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
      if (!signatureVerified) throw new ForbiddenException('Signed Chanjet callback required for plaintext certificate');
      this.auth.setCertificate(certificate);
      this.log.log('★ certificate 已从回调捕获: [REDACTED]');
    }

    const authCode = deepGet(body, 'authCode');
    if (authCode) {
      if (!signatureVerified) throw new ForbiddenException('Signed Chanjet callback required for plaintext authCode');
      this.log.log('★ authCode 已收到: [REDACTED]');
      try {
        await this.auth.fetchCertificateByAuthCode(authCode);
      } catch (e) {
        this.log.warn(`authCode→certificate 失败: ${(e as Error).message}`);
      }
    }

    // ─── 路径 B：加密消息推送（APP_TICKET 等） ───
    // encryptMsg: 新版格式，密钥 = 环境秘钥原始字节(useRawKey)
    // content:    旧版格式，密钥 = MD5(消息秘钥)
    if (content) {
      let payload: Record<string, unknown>;
      try {
        const decrypted = this.auth.decryptMessage(content, isEncryptMsg);
        payload = JSON.parse(decrypted);
        this.log.log(`解密成功: ${JSON.stringify(this.maskSensitive(payload)).slice(0, 500)}`);
      } catch (e) {
        // encryptMsg 解密失败时回退尝试另一种密钥
        if (isEncryptMsg) {
          try {
            const decrypted = this.auth.decryptMessage(content, false);
            payload = JSON.parse(decrypted);
            this.log.log(`解密成功(回退MD5密钥): ${JSON.stringify(this.maskSensitive(payload)).slice(0, 500)}`);
          } catch {
            this.log.error(`encryptMsg 两种密钥均解密失败: ${(e as Error).message}`);
            return { result: 'success' };
          }
        } else {
          this.log.warn(`解密失败，尝试明文解析: ${(e as Error).message}`);
          if (!signatureVerified) {
            this.log.warn('未签名 content 解密失败，拒绝明文兜底解析');
            return { result: 'success' };
          }
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
        this.log.log('★ certificate 已从加密消息捕获: [REDACTED]');
      }
    }

    return { result: 'success' };
  }

  /**
   * GET /api/chanjet/diagnostics
   * 管理员查看畅捷通认证链状态。
   */
  @Get('diagnostics')
  @RequireMenu(CHANJET_CONFIG_MENU, 'V')
  diagnostics() {
    return this.auth.diagnostics();
  }

  /**
   * GET /api/chanjet/test-token
   * 管理员手动触发 token 获取测试。
   */
  @Get('test-token')
  @RequireMenu(CHANJET_CONFIG_MENU, 'E')
  async testToken(@Req() req: any) {
    this.log.warn(`manual chanjet test-token triggered user=${req?.user?.username ?? req?.user?.userId ?? 'unknown'}`);
    try {
      await this.auth.getOpenToken();
      return { success: true, hasToken: true };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/test-api
   * 管理员手动调用好业财账套列表接口验证连通性（全链路实证）。
   */
  @Get('test-api')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async testApi(@Req() req: any) {
    this.log.warn(`manual chanjet test-api triggered user=${req?.user?.username ?? req?.user?.userId ?? 'unknown'}`);
    try {
      const result = await this.auth.listAccountBooks();
      return { success: true, result };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/ar-statistics?bookid=xxx&startDate=2026-05-01&endDate=2026-06-30
   * 读取好业财应收统计表(凤凰鸡场应收总账数据源)。
   *
   * bookid(必填):
   *   3533914511118750 — 老挝凤凰农业发展有限公司
   *   3537748712226818 — 老挝东鹏县星驰农业发展有限公司
   *   3539743721526654 — 老挝凤凰食品集团有限公司
   *
   * 其它 query 参数透传给好业财(字段名以文档为准)。
   * 鉴权:MENU_FIN2_AR(财务-应收应付,与刘杰应收总账同 menu)。
   */
  @Get('ar-statistics')
  @RequireMenu('MENU_FIN2_AR', 'V')
  async arStatistics(@Query() q: Record<string, string>) {
    if (!q.bookid) return { success: false, error: 'bookid 必填' };
    const { bookid, ...rest } = q;
    try {
      const result = await this.auth.getArStatistics(bookid, rest);
      return { success: true, bookid, query: rest, result };
    } catch (e) {
      return { success: false, bookid, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/companies
   * 列好业财 ↔ ERP 公司映射(前端下拉用)。
   */
  @Get('companies')
  @RequireMenu('MENU_FIN2_AR', 'V')
  async listCompanies() {
    try {
      const list = await this.arSync.listCompanies();
      return { success: true, companies: list };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/departments-diff?companyCode=COMP-LAO-AGRI
   * 部门对账:好业财 vs ERP 同公司下部门列表差异(审核用)。
   * 铁律:只读两端,不写入。用户审核后再决定映射/补齐策略。
   */
  @Get('departments-diff')
  @RequireMenu('MENU_FIN2_AR', 'V')
  async departmentsDiff(@Query('companyCode') companyCode: string) {
    if (!companyCode) return { success: false, error: 'companyCode 必填' };
    try {
      const diff = await this.arSync.diffDepartments(companyCode);
      return { success: true, ...diff };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * POST /api/chanjet/sync-ar
   * 按公司同步好业财应收统计表 → PG(chanjet_ar_snapshot)。
   * body: { companyCode, period(YYYYMM), currency? }
   * 服务端按 companyCode 查映射拿 bookid(单一真实源,禁名称匹配)。
   * 铁律:只读好业财,写 PG。鉴权 MENU_FIN2_AR E。
   */
  @Post('sync-ar')
  @RequireMenu('MENU_FIN2_AR', 'E')
  async syncAr(@Body() body: { companyCode: string; period: string; currency?: string }) {
    if (!body.companyCode) return { success: false, error: 'companyCode 必填' };
    if (!body.period || !/^\d{6}$/.test(body.period)) {
      return { success: false, error: 'period 必填,格式 YYYYMM' };
    }
    try {
      const result = await this.arSync.syncByCompanyCode(
        body.companyCode,
        body.period,
        body.currency || 'RMB',
      );
      return { success: true, ...result };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/ar-snapshot?companyCode=&period=
   * 从 PG 读应收快照(按 DataScope 过滤)。
   * - companyCode 传:必须在 allowedCompanyCodes 内
   * - companyCode 空:集团视角(isGlobal 看全部,其他看 allowed 内)
   */
  @Get('ar-snapshot')
  @RequireMenu('MENU_FIN2_AR', 'V')
  async arSnapshot(@Query('companyCode') companyCode: string, @Query('period') period: string) {
    if (!period) return { success: false, error: 'period 必填' };
    try {
      const rows = await this.arSync.queryByCompany(companyCode || undefined, period);
      const total = rows.reduce((s, r) => s + Number(r.endbalance), 0);
      return {
        success: true,
        companyCode: companyCode || '(集团/全部允许公司)',
        period,
        count: rows.length,
        totalEndbalance: total,
        currency: rows[0]?.currency || 'RMB',
        rows,
      };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/ar-ledger-import-preview?companyCode=&period=
   * g199-B 入账前预览:列差异(new/changed/unchanged 计数)。
   * 鉴权:MENU_FIN2_AR_LEDGER V(财务总监才能预览)。
   */
  @Get('ar-ledger-import-preview')
  @RequireMenu('MENU_FIN2_AR_LEDGER', 'V')
  async previewArLedgerImport(@Query('companyCode') companyCode: string, @Query('period') period: string) {
    if (!companyCode) return { success: false, error: 'companyCode 必填' };
    if (!period || !/^\d{6}$/.test(period)) return { success: false, error: 'period 必填,YYYYMM' };
    try {
      const r = await this.arSync.previewImportToArLedger(companyCode, period);
      return { success: true, ...r };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * POST /api/chanjet/ar-ledger-import
   * g199-B 审核入账:chanjet_ar_snapshot → fin_ar_ledger。
   * body: { companyCode, period(YYYYMM), dryRun?, onlyCounterparties?: string[] }
   * 鉴权:MENU_FIN2_AR_LEDGER E(财务总监独占)。
   */
  @Post('ar-ledger-import')
  @RequireMenu('MENU_FIN2_AR_LEDGER', 'E')
  async importArLedger(@Body() body: { companyCode: string; period: string; dryRun?: boolean; onlyCounterparties?: string[] }) {
    if (!body.companyCode) return { success: false, error: 'companyCode 必填' };
    if (!body.period || !/^\d{6}$/.test(body.period)) return { success: false, error: 'period 必填,YYYYMM' };
    try {
      const r = await this.arSync.importToArLedger(body.companyCode, body.period, !!body.dryRun, body.onlyCounterparties);
      return { success: true, ...r };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/probe-endpoints
   * 列出当前允许的好业财结构探针范围。只读说明，不调用外部 API。
   */
  @Get('integration/probe-endpoints')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  probeEndpoints() {
    return { success: true, endpoints: this.integration.listProbeEndpoints() };
  }

  /**
   * GET /api/chanjet/integration/account-books
   * 读取 ERP 中间层账套缓存，不直接调用好业财。
   */
  @Get('integration/account-books')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationAccountBooks() {
    try {
      const books = await this.integration.listAccountBooks();
      return { success: true, books };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/overview
   * 好业财中间层运营总览。只读本地中间层，不调用外部 API。
   */
  @Get('integration/overview')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationOverview() {
    try {
      const overview = await this.integration.overview();
      return { success: true, overview };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/baseline-readiness
   * 校验 16 个只读 scope 的快照新鲜度、最近作业与账套映射 Gate。
   */
  @Get('integration/baseline-readiness')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationBaselineReadiness(@Query('freshnessHours') freshnessHours: string) {
    try {
      const baseline = await this.integration.mirrorBaselineReadiness(Number(freshnessHours) || 24);
      return { success: true, baseline };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /** P0-P6 统一生产准备度，只读 ERP 好业财中间层。 */
  @Get('integration/production-readiness')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationProductionReadiness() {
    try {
      const readiness = await this.integration.productionReadinessOverview();
      return { success: true, readiness };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /** 当前唯一权威状态。历史 run artifact 不得覆盖本端点的实时结论。 */
  @Get('integration/current-state')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationCurrentState() {
    try {
      const currentState = await this.integration.currentStateOverview();
      return { success: true, currentState };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/account-book-mapping-gate
   * 账套 ↔ ERP 公司一对一映射门禁。只读 ERP 中间层和公司主数据。
   */
  @Get('integration/account-book-mapping-gate')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationAccountBookMappingGate() {
    try {
      const gate = await this.integration.accountBookMappingGate();
      return { success: true, gate };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * POST /api/chanjet/integration/account-books/refresh
   * 只读好业财账套列表，写 ERP 中间层账套缓存与字段 catalog。
   */
  @Post('integration/account-books/refresh')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async refreshIntegrationAccountBooks(@Req() req: any) {
    this.log.warn(`manual chanjet account-book refresh triggered user=${req?.user?.username ?? req?.user?.userId ?? 'unknown'}`);
    try {
      const result = await this.integration.refreshAccountBooks();
      return { success: true, ...result };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * POST /api/chanjet/integration/probe
   * 受控字段采样:只读好业财 API，写 chanjet_api_field_catalog / chanjet_sync_jobs。
   * body: { scope?: string[], bookId?: string }
   */
  @Post('integration/probe')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async integrationProbe(@Body() body: { scope?: string[]; bookId?: string }, @Req() req: any) {
    this.log.warn(`manual chanjet integration probe triggered user=${req?.user?.username ?? req?.user?.userId ?? 'unknown'} scope=${(body.scope || []).join(',') || 'default'}`);
    try {
      const result = await this.integration.probe(body.scope || [], body.bookId);
      return { success: true, ...result };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/field-catalog
   * 字段 catalog 查询。样本已脱敏。
   */
  @Get('integration/field-catalog')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationFieldCatalog(@Query('limit') limit: string) {
    try {
      const fields = await this.integration.listFieldCatalog(Number(limit) || 500);
      return { success: true, count: fields.length, fields };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/sync-jobs
   * 好业财探针/同步/入账作业审计。
   */
  @Get('integration/sync-jobs')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationSyncJobs(@Query('limit') limit: string) {
    try {
      const jobs = await this.integration.listSyncJobs(Number(limit) || 100);
      return { success: true, count: jobs.length, jobs };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * POST /api/chanjet/integration/mirror/sync
   * 好业财只读镜像同步：只读好业财，写 ERP 中间层快照/字段目录/实体摘要。
   * body: { scope?: string[], bookId?: string, period?: string }
   */
  @Post('integration/mirror/sync')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async syncIntegrationMirror(
    @Body() body: { scope?: string[]; bookId?: string; period?: string },
    @Req() req: { user?: { username?: string; userId?: string } },
  ) {
    this.log.warn(`manual chanjet readonly mirror sync triggered user=${req?.user?.username ?? req?.user?.userId ?? 'unknown'} scope=${(body.scope || []).join(',') || 'default'} book=${body.bookId || 'enabled-books'}`);
    try {
      const result = await this.integration.syncReadOnlyMirror(body.scope || [], body.bookId, body.period);
      return { success: true, writeChanjet: false, ...result };
    } catch (e) {
      return { success: false, writeChanjet: false, error: (e as Error).message };
    }
  }

  /** 最多三次重试的全量只读同步；仍失败则 HOLD 并保留告警。 */
  @Post('integration/mirror/sync-resilient')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async syncIntegrationMirrorResilient(
    @Body() body: { scope?: string[]; bookId?: string; period?: string; maxAttempts?: number },
    @Req() req: any,
  ) {
    const requestedBy = String(req?.user?.username || req?.user?.userId || 'unknown');
    this.log.warn(`manual resilient chanjet readonly sync user=${requestedBy} scope=${(body.scope || []).join(',') || 'default'}`);
    try {
      const result = await this.integration.syncReadOnlyMirrorResilient(
        body.scope || [],
        body.bookId,
        body.period,
        body.maxAttempts || 3,
      );
      return { success: result.decision === 'GO', writeChanjet: false, writeErpBusinessTables: false, ...result };
    } catch (e) {
      return { success: false, writeChanjet: false, writeErpBusinessTables: false, error: (e as Error).message };
    }
  }

  /**
   * 完整只读对齐闭环：镜像同步 → 精确映射确认 → 幂等对账 → 生产准备度。
   * 只写 ERP 中间层和审计表，不写好业财或 ERP 业务事实表。
   */
  @Post('integration/alignment/run')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async runIntegrationAlignmentCycle(
    @Body() body: { scope?: string[]; bookId?: string; period?: string; maxAttempts?: number },
    @Req() req: { user?: { username?: string; userId?: string } },
  ) {
    const requestedBy = String(req?.user?.username || req?.user?.userId || 'unknown');
    this.log.warn(`manual chanjet readonly alignment cycle user=${requestedBy} scope=${(body.scope || []).join(',') || 'default'}`);
    try {
      const result = await this.integration.runReadonlyAlignmentCycle(
        `user:${requestedBy}`,
        body.scope || [],
        body.bookId,
        body.period,
        body.maxAttempts || 3,
      );
      return {
        success: result.decision !== 'HOLD',
        ...result,
      };
    } catch (e) {
      return {
        success: false,
        decision: 'HOLD',
        writeChanjet: false,
        writeErpBusinessTables: false,
        error: (e as Error).message,
      };
    }
  }

  /**
   * 长耗时只读对齐异步入口。立即返回 202，避免反向代理超时造成“前端失败、后台成功”。
   */
  @Post('integration/alignment/enqueue')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async enqueueIntegrationAlignmentCycle(
    @Body() body: { scope?: string[]; bookId?: string; period?: string; maxAttempts?: number },
    @Req() req: { user?: { username?: string; userId?: string } },
  ) {
    const requestedBy = String(req?.user?.username || req?.user?.userId || 'unknown');
    const enqueueResult = await this.readonlySyncScheduler.enqueueManualSync(`user:${requestedBy}`, body);
    return {
      success: true,
      writeChanjet: false,
      writeErpBusinessTables: false,
      ...enqueueResult,
    };
  }

  @Get('integration/alignment/status')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationAlignmentStatus() {
    return {
      success: true,
      writeChanjet: false,
      writeErpBusinessTables: false,
      run: await this.readonlySyncScheduler.getRunState(),
    };
  }

  /**
   * GET /api/chanjet/integration/mirror/read-snapshots
   * 查询好业财原始只读快照。只读 ERP 中间层。
   */
  @Get('integration/mirror/read-snapshots')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationReadSnapshots(@Query('limit') limit: string, @Query('endpointKey') endpointKey: string) {
    try {
      const snapshots = await this.integration.listReadSnapshots(Number(limit) || 100, endpointKey || undefined);
      return { success: true, count: snapshots.length, snapshots };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/mirror/entity-snapshots
   * 查询标准化实体镜像。只读 ERP 中间层。
   */
  @Get('integration/mirror/entity-snapshots')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationEntitySnapshots(@Query('limit') limit: string, @Query('entityType') entityType: string) {
    try {
      const entities = await this.integration.listEntitySnapshots(Number(limit) || 200, entityType || undefined);
      return { success: true, count: entities.length, entities };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/field-mappings
   * 查询好业财字段 ↔ ERP 字段候选映射。
   */
  @Get('integration/field-mappings')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationFieldMappings(@Query('limit') limit: string, @Query('matchStatus') matchStatus: string) {
    try {
      const mappings = await this.integration.listFieldMappings(Number(limit) || 500, matchStatus || undefined);
      return { success: true, count: mappings.length, mappings };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/wms-readonly-alignment
   * 好业财采购入库/销售出库官方字段契约、ERP 等效字段覆盖和只读样本状态。
   * 只读 ERP 中间层与 information_schema，不调用好业财写接口。
   */
  @Get('integration/wms-readonly-alignment')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationWmsReadonlyAlignment() {
    try {
      const alignment = await this.integration.wmsReadonlyAlignmentOverview();
      return { success: true, alignment };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/wms/bridge-readiness
   * 只读输出好业财 WMS 镜像、晋级候选和写回草稿状态。
   */
  @Get('integration/wms/bridge-readiness')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationWmsBridgeReadiness() {
    return { success: true, bridge: await this.wmsBridge.overview() };
  }

  @Get('integration/wms/mapping-gaps')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationWmsMappingGaps() {
    return {
      success: true,
      mappingGaps: await this.wmsBridge.mappingGapOverview(),
    };
  }

  @Get('integration/wms/promotion-candidates')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationWmsPromotionCandidates(
    @Query('limit') limit: string,
    @Query('state') state?: ChanjetWmsPromotionState,
  ) {
    const candidates = await this.wmsBridge.listPromotionCandidates(Number(limit) || 200, state);
    return { success: true, count: candidates.length, candidates };
  }

  @Post('integration/wms/promotion-candidates/refresh')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async refreshIntegrationWmsPromotionCandidates(
    @Req() req: { user?: { username?: string; userId?: string } },
  ) {
    const actor = String(req?.user?.username || req?.user?.userId || 'unknown');
    this.log.warn(`manual Chanjet WMS candidate refresh triggered user=${actor}`);
    return {
      success: true,
      result: await this.wmsBridge.refreshPromotionCandidates(actor),
    };
  }

  @Post('integration/wms/master-mapping-candidates/refresh')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async refreshIntegrationWmsMasterMappingCandidates(
    @Req() req: { user?: { username?: string; userId?: string } },
  ) {
    const actor = String(req?.user?.username || req?.user?.userId || 'unknown');
    this.log.warn(`manual Chanjet WMS master mapping refresh triggered user=${actor}`);
    return {
      success: true,
      result: await this.wmsBridge.refreshMasterMappingCandidates(actor),
    };
  }

  @Post('integration/wms/master-mappings/:id/review')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async reviewIntegrationWmsMasterMapping(
    @Param('id') id: string,
    @Body() body: {
      decision: 'APPROVE' | 'REJECT';
      erpCode?: string;
      erpEntityType?: 'WAREHOUSE' | 'PRODUCT' | 'SKU' | 'MATERIAL' | 'UOM';
    },
    @Req() req: { user?: { username?: string; userId?: string } },
  ) {
    const actor = String(req?.user?.username || req?.user?.userId || '');
    this.log.warn(
      `manual Chanjet WMS master mapping review triggered user=${actor} mapping=${id} decision=${body.decision}`,
    );
    return {
      success: true,
      result: await this.wmsBridge.reviewMasterMapping(id, body, actor),
    };
  }

  @Post('integration/wms/promotion-candidates/:id/review')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async reviewIntegrationWmsPromotionCandidate(
    @Param('id') id: string,
    @Body() body: { decision: 'APPROVE' | 'REJECT' },
    @Req() req: { user?: { username?: string; userId?: string } },
  ) {
    const actor = String(req?.user?.username || req?.user?.userId || '');
    return {
      success: true,
      result: await this.wmsBridge.reviewPromotionCandidate(id, body.decision, actor),
    };
  }

  @Get('integration/wms/writeback-outbox')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationWmsWritebackOutbox(
    @Query('limit') limit: string,
    @Query('state') state?: string,
  ) {
    const outbox = await this.wmsBridge.listWritebackOutbox(Number(limit) || 100, state);
    return { success: true, count: outbox.length, outbox };
  }

  @Post('integration/wms/writeback-outbox/prepare')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async prepareIntegrationWmsWritebackOutbox(
    @Body() body: PrepareWmsWritebackInput,
    @Req() req: { user?: { username?: string; userId?: string } },
  ) {
    const actor = String(req?.user?.username || req?.user?.userId || '');
    return {
      success: true,
      outbox: await this.wmsBridge.prepareWriteback(body, actor),
      externalWriteExecuted: false,
    };
  }

  /**
   * GET /api/chanjet/integration/finance-adapter/p0
   * 好业财 P0 财务只读适配总览。只读 ERP 中间层，不调用好业财，不写业务表。
   */
  @Get('integration/finance-adapter/p0')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationFinanceP0Adapter() {
    try {
      const adapter = await this.integration.financeP0AdapterOverview();
      return { success: true, adapter };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/finance-coverage
   * 好业财全量只读同步覆盖率与财务卡片口径覆盖率。只读 ERP 中间层，不调用好业财。
   */
  @Get('integration/finance-coverage')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationFinanceCoverage() {
    try {
      const coverage = await this.integration.financeReadonlyCoverage();
      return { success: true, coverage };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/master-data-alignment
   * 好业财 ↔ ERP 主数据映射成熟度。只读 ERP 中间层，不调用好业财写接口，不自动批准映射。
   */
  @Get('integration/master-data-alignment')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationMasterDataAlignment() {
    try {
      const alignment = await this.integration.masterDataAlignmentOverview();
      return { success: true, alignment };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/master-data-mapping-review
   * 只读输出跨系统主数据精确匹配候选；不批准、不写 ERP 业务表、不写好业财。
   */
  @Get('integration/master-data-mapping-review')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async masterDataMappingReview() {
    try {
      return await this.integration.masterDataMappingReview();
    } catch (e) {
      return {
        decision: 'HOLD',
        writeChanjet: false,
        writeErpBusinessTables: false,
        error: (e as Error).message,
      };
    }
  }

  /**
   * GET /api/chanjet/integration/finance-reconciliation
   * 好业财 ↔ ERP 财务聚合口径差异总览。只读 ERP 中间层与 ERP 业务表，不写好业财，不覆盖业务事实。
   */
  @Get('integration/finance-reconciliation')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationFinanceReconciliation() {
    try {
      const reconciliation = await this.integration.financeReconciliationOverview();
      return { success: true, reconciliation };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/finance-semantic-locks
   * 好业财财务字段语义锁。只读 ERP 中间层，不调用好业财写接口，不覆盖 ERP 业务表。
   */
  @Get('integration/finance-semantic-locks')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationFinanceSemanticLocks() {
    try {
      const semanticLocks = await this.integration.financeSemanticLocksOverview();
      return { success: true, semanticLocks };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/finance-semantic-extractors
   * 好业财财务字段语义提取器。只扫描 ERP 中间层 raw_data，不调用好业财写接口，不覆盖 ERP 业务表。
   */
  @Get('integration/finance-semantic-extractors')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationFinanceSemanticExtractors() {
    try {
      const semanticExtractors = await this.integration.financeSemanticExtractorsOverview();
      return { success: true, semanticExtractors };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/finance-read-model
   * 好业财财务只读 read model。只决定展示权威候选，不写好业财，不覆盖 ERP 业务表。
   */
  @Get('integration/finance-read-model')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationFinanceReadModel() {
    try {
      const readModel = await this.integration.financeReadModelOverview();
      return { success: true, readModel };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/subject-balance-readonly-report
   * 好业财科目余额表/资产负债表/利润表只读报表行。只读 ERP 中间层，不写好业财，不推凭证。
   */
  @Get('integration/subject-balance-readonly-report')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationSubjectBalanceReadonlyReport() {
    try {
      const readonlyReport = await this.integration.financeSubjectBalanceReadonlyReportOverview();
      return { success: true, readonlyReport };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/receipt-payment-locks
   * 好业财收/付款业务日、入账日、审核状态、作废状态和方向候选锁。只读 ERP 中间层。
   */
  @Get('integration/receipt-payment-locks')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationReceiptPaymentLocks() {
    try {
      const receiptPaymentLocks = await this.integration.financeReceiptPaymentDateStatusLockOverview();
      return { success: true, receiptPaymentLocks };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/receipt-payment-daily-reconciliation
   * 按好业财业务日只汇总 EFFECTIVE 收/付款单。只读本地镜像，所有非 EFFECTIVE 状态 fail-closed。
   */
  @Get('integration/receipt-payment-daily-reconciliation')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationReceiptPaymentDailyReconciliation(@Query('businessDate') businessDate?: string) {
    try {
      const dailyReconciliation = await this.integration
        .financeReceiptPaymentDailyReconciliationOverview(businessDate);
      return { success: true, dailyReconciliation };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/cash-balance-field-lock
   * 现金/银行余额字段锁。只读聚合最新期间 GL_BALANCE 1001/1002 叶子科目本位币期末余额。
   */
  @Get('integration/cash-balance-field-lock')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationCashBalanceFieldLock() {
    try {
      const cashBalanceFieldLock = await this.integration.financeCashBalanceFieldLockOverview();
      return { success: true, cashBalanceFieldLock };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/finance-card-authority
   * 财务首页卡片权威接线状态。只读本地中间层，不写好业财、不覆盖 ERP 事实表。
   */
  @Get('integration/finance-card-authority')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationFinanceCardAuthority() {
    try {
      const financeCardAuthority = await this.integration.financeCardAuthorityOverview();
      return { success: true, financeCardAuthority };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/finance-card-semantic-expansion
   * 财务卡片语义锁扩展审计。只读本地中间层，输出可晋级卡片、阻断字段和财务确认点。
   */
  @Get('integration/finance-card-semantic-expansion')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationFinanceCardSemanticExpansion() {
    try {
      const semanticExpansion = await this.integration.financeCardSemanticLockExpansionOverview();
      return { success: true, semanticExpansion };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/finance-card-semantic-review
   * 财务卡片语义复核矩阵。只读本地中间层，输出财务确认问题、阻断项和升权建议。
   */
  @Get('integration/finance-card-semantic-review')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationFinanceCardSemanticReview() {
    try {
      const semanticReview = await this.integration.financeCardSemanticReviewOverview();
      return { success: true, semanticReview };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/finance-card-system-confirmation
   * 财务卡片系统侧语义确认结果。由 ERP 侧固定主值/只读/阻断规则，不等待人工财务确认。
   */
  @Get('integration/finance-card-system-confirmation')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationFinanceCardSystemConfirmation() {
    try {
      const systemConfirmation = await this.integration.financeCardSystemConfirmationOverview();
      return { success: true, systemConfirmation };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/finance-card-source-switch-audit
   * 财务卡片来源切换审计。只读输出哪些卡片可接好业财主值、哪些只能只读、哪些必须保留 ERP 主值。
   */
  @Get('integration/finance-card-source-switch-audit')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationFinanceCardSourceSwitchAudit() {
    try {
      const sourceSwitchAudit = await this.integration.financeCardSourceSwitchAuditOverview();
      return { success: true, sourceSwitchAudit };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/field-gap-review-gate
   * 好业财字段缺口执行批次。只读输出 P0/P1 适配合同、阻断项和实施顺序。
   */
  @Get('integration/field-gap-review-gate')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationFieldGapReviewGate() {
    try {
      const fieldGapReviewGate = await this.integration.financeFieldGapReviewGate();
      return { success: true, fieldGapReviewGate };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/readonly-field-adapters
   * 好业财只读字段适配器。输出凭证头、凭证明细、往来单位的 ERP 可消费合同。
   */
  @Get('integration/readonly-field-adapters')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationReadonlyFieldAdapters() {
    try {
      const readonlyFieldAdapters = await this.integration.financeReadonlyFieldAdaptersOverview();
      return { success: true, readonlyFieldAdapters };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * POST /api/chanjet/integration/field-mappings/analyze
   * 从字段 catalog 生成 ERP 字段适配候选。只写 ERP 中间层。
   */
  @Post('integration/field-mappings/analyze')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async analyzeIntegrationFieldMappings(@Req() req: any) {
    this.log.warn(`manual chanjet field-gap analysis triggered user=${req?.user?.username ?? req?.user?.userId ?? 'unknown'}`);
    try {
      const result = await this.integration.analyzeFieldGaps();
      return { success: true, writeChanjet: false, ...result };
    } catch (e) {
      return { success: false, writeChanjet: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/master-mappings?mappingType=DEPARTMENT
   * ERP ↔ 好业财主数据映射候选。APPROVED 才可作为后续入账/凭证建议依据。
   */
  @Get('integration/master-mappings')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationMasterMappings(@Query('mappingType') mappingType: string) {
    try {
      const mappings = await this.integration.listMasterMappings(mappingType || undefined);
      return { success: true, count: mappings.length, mappings };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/counterparty-mapping-candidates
   * 预览好业财往来单位 ↔ ERP 客户/供应商候选。只读，不落候选。
   */
  @Get('integration/counterparty-mapping-candidates')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationCounterpartyMappingCandidates() {
    try {
      const candidateOverview = await this.integration.counterpartyMappingCandidates();
      return { success: true, candidateOverview };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * POST /api/chanjet/integration/counterparty-mapping-candidates/generate
   * 精确候选写入 PENDING；ERP 主档缺失时可确认 SOURCE_ONLY 只读源身份。
   * 两者均只写 ERP 中间层，不写好业财/业务表。
   */
  @Post('integration/counterparty-mapping-candidates/generate')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async generateIntegrationCounterpartyMappingCandidates(@Req() req: any) {
    const requestedBy = String(req?.user?.username || req?.user?.userId || 'system');
    this.log.warn(`manual chanjet counterparty candidate generation user=${requestedBy}`);
    try {
      const result = await this.integration.generateCounterpartyMappingCandidates(requestedBy);
      return {
        success: true,
        writeChanjet: false,
        writeErpBusinessTables: false,
        autoApprove: 'source_identity_only',
        ...result,
      };
    } catch (e) {
      return { success: false, writeChanjet: false, error: (e as Error).message };
    }
  }

  /**
   * 系统确认可证明的精确一对一映射与 SOURCE_ONLY 只读源身份。
   * 只写 ERP 中间层，不生成 ERP 客户/供应商业务主档。
   */
  @Post('integration/master-mappings/system-confirm-exact')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async systemConfirmExactCounterpartyMappings(@Req() req: any) {
    const requestedBy = String(req?.user?.username || req?.user?.userId || 'unknown');
    this.log.warn(`system confirm exact chanjet mappings requested user=${requestedBy}`);
    try {
      const actor = `system:exact-match:${requestedBy}`;
      const counterparties = await this.integration.confirmDeterministicCounterpartyMappings(actor, { compact: true });
      const masterData = await this.integration.confirmDeterministicMasterDataMappings(actor);
      return {
        success: counterparties.errors.length === 0 && masterData.errors.length === 0,
        writeChanjet: false,
        writeErpBusinessTables: false,
        rule: 'exact ERP master match or complete Chanjet readonly source identity',
        counterparties,
        masterData,
      };
    } catch (e) {
      return { success: false, writeChanjet: false, writeErpBusinessTables: false, error: (e as Error).message };
    }
  }

  /**
   * Gate A only: write/read/idempotency/compensating-rollback proof against one
   * ERP middle-layer mapping. Never calls a Chanjet write API or ERP business table.
   */
  @Post('integration/minimal-write-precheck/mapping-canary')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async minimalMappingWriteCanary(@Req() req: any) {
    const requestedBy = String(req?.user?.username || req?.user?.userId || 'unknown');
    this.log.warn(`chanjet minimal middle-layer write canary requested user=${requestedBy}`);
    const result = await this.integration.runMinimalMappingWriteCanary(`user:${requestedBy}`);
    return { success: result.decision === 'GO', ...result };
  }

  /**
   * POST /api/chanjet/integration/master-mappings/:id/review
   * 人工审核映射候选。仅改中间层映射审核状态，不改 ERP/好业财主数据。
   */
  @Post('integration/master-mappings/:id/review')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async reviewIntegrationMasterMapping(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED' },
  ) {
    if (!id) return { success: false, error: 'id 必填' };
    if (!['PENDING', 'APPROVED', 'REJECTED'].includes(body.reviewStatus)) {
      return { success: false, error: 'reviewStatus 必须为 PENDING / APPROVED / REJECTED' };
    }
    try {
      const reviewedBy = req?.user?.username || req?.user?.userId || '';
      const mapping = await this.integration.updateMappingReview(id, body.reviewStatus, String(reviewedBy));
      return { success: true, mapping };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * GET /api/chanjet/integration/voucher-drafts
   * ERP→好业财凭证草稿。仅查询中间层，不推送好业财。
   */
  @Get('integration/voucher-drafts')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationVoucherDrafts(@Query('limit') limit: string, @Query('status') status: string) {
    try {
      const drafts = await this.integration.listVoucherDrafts(Number(limit) || 100, status || undefined);
      return { success: true, count: drafts.length, drafts, pushEnabled: false };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * POST /api/chanjet/integration/voucher-drafts
   * 创建凭证草稿。只写中间层，默认 push_allowed=false。
   */
  @Post('integration/voucher-drafts')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async createIntegrationVoucherDraft(
    @Req() req: any,
    @Body() body: {
      sourceBizType: string;
      sourceBizId: string;
      companyCode?: string;
      bookId?: string;
      period?: string;
      title?: string;
      voucherLines: Array<Record<string, unknown>>;
      rawData?: Record<string, unknown>;
    },
  ) {
    try {
      const createdBy = req?.user?.username || req?.user?.userId || '';
      const draft = await this.integration.createVoucherDraft(body, String(createdBy));
      return { success: true, draft, pushEnabled: false };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * POST /api/chanjet/integration/voucher-drafts/validate
   * 只校验 ERP 中间层凭证候选，不保存、不推送好业财。
   */
  @Post('integration/voucher-drafts/validate')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  validateIntegrationVoucherDraft(
    @Body() body: {
      sourceBizType: string;
      sourceBizId: string;
      companyCode?: string;
      bookId?: string;
      period?: string;
      title?: string;
      voucherLines: Array<Record<string, unknown>>;
      rawData?: Record<string, unknown>;
    },
  ) {
    const validation = this.integration.validateVoucherDraftInput(body);
    return { success: validation.valid, validation, pushEnabled: false };
  }

  /**
   * POST /api/chanjet/integration/voucher-drafts/:id/status
   * 审核凭证草稿状态。PUSH_READY 只表示可进入下一道推送审批，不实际推送。
   */
  @Post('integration/voucher-drafts/:id/status')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async updateIntegrationVoucherDraftStatus(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { status: 'DRAFT' | 'VALIDATED' | 'REVIEWED' | 'APPROVED' | 'PUSH_READY' | 'REJECTED' | 'CANCELLED' },
  ) {
    if (!id) return { success: false, error: 'id 必填' };
    if (!['DRAFT', 'VALIDATED', 'REVIEWED', 'APPROVED', 'PUSH_READY', 'REJECTED', 'CANCELLED'].includes(body.status)) {
      return { success: false, error: '无效的凭证草稿状态' };
    }
    try {
      const reviewedBy = req?.user?.username || req?.user?.userId || '';
      const draft = await this.integration.updateVoucherDraftStatus(id, body.status, String(reviewedBy));
      return { success: true, draft, pushEnabled: false };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  @Get('integration/writeback-outbox')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationWritebackOutbox(@Query('limit') limit: string, @Query('state') state: string) {
    try {
      const outbox = await this.integration.listWritebackOutbox(Number(limit) || 100, state || undefined);
      return { success: true, count: outbox.length, outbox, externalWriteEnabled: false };
    } catch (e) {
      return { success: false, error: (e as Error).message, externalWriteEnabled: false };
    }
  }

  @Get('integration/writeback-preparation')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationWritebackPreparation() {
    try {
      const preparation = await this.integration.writebackPreparationOverview();
      return { success: true, preparation };
    } catch (e) {
      return { success: false, error: (e as Error).message, externalWriteEnabled: false };
    }
  }

  /**
   * Validate one exact Wave 7 approval package against the immutable ERP draft
   * and Outbox evidence. This endpoint never persists approval or calls Chanjet.
   */
  @Post('integration/external-write-approval/precheck')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async precheckExternalWriteApproval(@Body() body: Partial<ChanjetExternalCanaryApprovalInput>) {
    try {
      const precheck = await this.integration.precheckExternalMinimalWriteApproval(body || {});
      return {
        success: precheck.decision === 'READY_FOR_A2_A1_A7_REVIEW',
        precheck,
        approvalPersisted: false,
        externalWriteEnabled: false,
        externalNetworkCalled: false,
      };
    } catch (e) {
      return {
        success: false,
        error: (e as Error).message,
        approvalPersisted: false,
        externalWriteEnabled: false,
        externalNetworkCalled: false,
      };
    }
  }

  @Post('integration/voucher-drafts/:id/prepare-outbox')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async prepareIntegrationWritebackOutbox(@Param('id') id: string, @Req() req: any) {
    try {
      const actor = String(req?.user?.username || req?.user?.userId || '');
      const outbox = await this.integration.prepareVoucherWritebackOutbox(id, actor);
      return { success: true, outbox, externalWriteEnabled: false };
    } catch (e) {
      return { success: false, error: (e as Error).message, externalWriteEnabled: false };
    }
  }

  @Post('integration/writeback-outbox/:id/simulate')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async simulateIntegrationWritebackOutbox(
    @Param('id') id: string,
    @Body() body: { outcome: 'ACKNOWLEDGED' | 'RETRYABLE' | 'FAILED' | 'REVERSED' | 'CANCELLED' },
    @Req() req: any,
  ) {
    if (!['ACKNOWLEDGED', 'RETRYABLE', 'FAILED', 'REVERSED', 'CANCELLED'].includes(body.outcome)) {
      return { success: false, error: '无效的模拟结果', externalWriteEnabled: false };
    }
    try {
      const actor = String(req?.user?.username || req?.user?.userId || '');
      const outbox = await this.integration.simulateWritebackOutbox(id, body.outcome, actor);
      return { success: true, outbox, externalWriteEnabled: false, externalNetworkCalled: false };
    } catch (e) {
      return { success: false, error: (e as Error).message, externalWriteEnabled: false, externalNetworkCalled: false };
    }
  }

  /**
   * GET /api/chanjet/integration/reconciliation-results
   * 查询中间层对账结果。append-only 审计，不删除历史差异。
   */
  @Get('integration/reconciliation-results')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationReconciliationResults(
    @Query('limit') limit: string,
    @Query('status') status: string,
    @Query('reconciliationType') reconciliationType: string,
  ) {
    try {
      const results = await this.integration.listReconciliationResults(
        Number(limit) || 100,
        status || undefined,
        reconciliationType || undefined,
      );
      return { success: true, count: results.length, results };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * POST /api/chanjet/integration/reconciliation/run
   * 运行主数据映射对账，只写 chanjet_reconciliation_results / chanjet_sync_jobs。
   */
  @Post('integration/reconciliation/run')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async runIntegrationReconciliation(@Req() req: any) {
    this.log.warn(`manual chanjet mapping reconciliation triggered user=${req?.user?.username ?? req?.user?.userId ?? 'unknown'}`);
    try {
      const result = await this.integration.runMappingReconciliation({ compact: true });
      return { success: true, ...result };
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
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async callGet(@Query() query: Record<string, string>, @Req() req: any) {
    return this.doCall(query.path, {
      method: this.normalizeChanjetProxyMethod(query.method || 'GET'),
      bookid: query.bookid,
      queryStr: query.q,
    }, req);
  }

  @Post('call')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async callPost(@Body() body: { path: string; method?: 'GET' | 'POST'; bookid?: string; body?: Record<string, unknown>; query?: Record<string, string> }, @Req() req: any) {
    return this.doCall(body.path, {
      method: this.normalizeChanjetProxyMethod(body.method || 'POST'),
      bookid: body.bookid,
      body: body.body,
      query: body.query,
    }, req);
  }

  private async doCall(
    rawPath: string,
    opts: { method: 'GET' | 'POST'; bookid?: string; body?: Record<string, unknown>; query?: Record<string, string>; queryStr?: string } = { method: 'GET' },
    req?: any,
  ) {
    let path = '';
    try {
      path = this.normalizeChanjetProxyPath(rawPath, opts.bookid);
      assertChanjetProxyReadonly(opts.method, path);
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
      await this.writeChanjetAudit(req, 'CHANJET_CALL_PROXY', path, 'SUCCESS', {
        method: opts.method,
        query: this.maskSensitive(queryMap),
        body: this.maskSensitive(opts.body || {}),
        resultKeys: result && typeof result === 'object' ? Object.keys(result as Record<string, unknown>).slice(0, 20) : [],
      });
      return { success: true, path, result };
    } catch (e) {
      await this.writeChanjetAudit(req, 'CHANJET_CALL_PROXY', path || String(rawPath || '').slice(0, 80), 'FAIL', {
        method: opts.method,
        error: (e as Error).message,
      });
      return { success: false, path, error: (e as Error).message };
    }
  }

  private async writeChanjetAudit(
    req: any,
    actionCode: string,
    path: string,
    resultStatus: 'SUCCESS' | 'FAIL',
    afterData: Record<string, unknown>,
  ) {
    try {
      const user = req?.user || {};
      const roles = Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);
      await this.ds.query(
        `INSERT INTO sys_operation_logs
          (user_id, username, role_code, module_code, action_code, biz_type,
           biz_no, request_method, request_path, ip_address, user_agent,
           after_data, result_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)`,
        [
          user.userId || user.id || null,
          user.username || null,
          roles[0] || null,
          CHANJET_PROXY_MENU,
          actionCode,
          'CHANJET',
          path.slice(0, 80),
          req?.method || null,
          req?.url || null,
          req?.ip || req?.headers?.['x-forwarded-for'] || null,
          req?.headers?.['user-agent'] || null,
          JSON.stringify(afterData || {}),
          resultStatus,
        ],
      );
    } catch (e) {
      this.log.warn(`Chanjet audit skipped: ${(e as Error).message}`);
    }
  }

  /**
   * POST /api/chanjet/set-cert
   * 管理员手动设置 certificate（从畅捷通控制台复制）。
   */
  @Post('set-cert')
  @RequireMenu(CHANJET_CONFIG_MENU, 'E')
  setCert(@Body() body: { certificate: string }) {
    if (!body.certificate) return { success: false, error: 'certificate 不能为空' };
    this.auth.setCertificate(body.certificate);
    return { success: true, hasCertificate: true };
  }

  /**
   * POST /api/chanjet/set-ticket
   * 管理员手动注入 appTicket（容器重启后丢失时用）。
   */
  @Post('set-ticket')
  @RequireMenu(CHANJET_CONFIG_MENU, 'E')
  setTicket(@Body() body: { appTicket: string }) {
    if (!body.appTicket) return { success: false, error: 'appTicket 不能为空' };
    this.auth.setAppTicket(body.appTicket);
    return { success: true, hasAppTicket: true };
  }

  /**
   * POST /api/chanjet/trigger-ticket
   * 管理员手动触发 appTicket 推送（需消息接收地址已配好）。
   */
  @Post('trigger-ticket')
  @RequireMenu(CHANJET_CONFIG_MENU, 'E')
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
  @RequireMenu(CHANJET_CONFIG_MENU, 'E')
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
