import { ClsService } from 'nestjs-cls';
import { assertChanjetProxyReadonly } from './chanjet-remote-readonly';
import { Controller, Post, Body, Get, Query, Headers, Logger, HttpCode, HttpStatus, UseGuards, ForbiddenException, Req, Param } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public, MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';
import { ChanjetAuthService } from './chanjet-auth.service';
import { ChanjetArSyncService } from './chanjet-ar-sync.service';
import { ChanjetExternalCanaryApprovalInput, ChanjetIntegrationService } from './chanjet-integration.service';
import { ChanjetReadonlySyncScheduler } from './chanjet-readonly-sync.scheduler';
import {
  ChanjetWmsBridgeService,
  PrepareWmsWritebackInput,
  ReviewHouseLocationPolicyInput,
  ReviewUomConversionPolicyInput,
} from './chanjet-wms-bridge.service';
import { ChanjetWmsPromotionState } from './chanjet-wms-promotion-candidate.entity';
import { summarizeMasterGapProposals } from './chanjet-erp-master-gap-closure';
import {
  CHANJET_ERP_MASTER_REVIEW_ACTION,
  ChanjetErpMasterBusinessReviewService,
} from './chanjet-erp-master-business-review.service';
import { ChanjetHoldResolutionAuditService } from './chanjet-hold-resolution-audit.service';
import {
  ChanjetProductNameCanaryError,
  ChanjetProductNameCanaryService,
} from './chanjet-product-name-canary.service';
import { resolveChanjetHouseProjectTarget } from './chanjet-house-project-policy';
import * as crypto from 'crypto';

type ChanjetProxyMethod = 'GET' | 'POST';

export { assertChanjetProxyReadonly } from './chanjet-remote-readonly';
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
    private readonly erpMasterBusinessReview: ChanjetErpMasterBusinessReviewService,
    private readonly holdResolutionAudit: ChanjetHoldResolutionAuditService,
    private readonly productNameCanary: ChanjetProductNameCanaryService,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls?: ClsService,
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
  @HttpCode(HttpStatus.ACCEPTED)
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async syncIntegrationMirror(
    @Body() body: { scope?: string[]; bookId?: string; period?: string },
    @Req() req: { user?: { username?: string; userId?: string } },
  ) {
    return this.enqueueIntegrationAlignmentCycle(body, req);
  }

  /** 最多三次重试的全量只读同步；仍失败则 HOLD 并保留告警。 */
  @Post('integration/mirror/sync-resilient')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async syncIntegrationMirrorResilient(
    @Body() body: { scope?: string[]; bookId?: string; period?: string; maxAttempts?: number },
    @Req() req: any,
  ) {
    return this.enqueueIntegrationAlignmentCycle(body, req);
  }

  /**
   * 完整只读对齐闭环：受控镜像同步 → 人工映射审核候选 → 对账差异 → 生产准备度。
   * 只写 ERP 中间层和审计表，不写好业财或 ERP 业务事实表。
   */
  @Post('integration/alignment/run')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async runIntegrationAlignmentCycle(
    @Body() body: { scope?: string[]; bookId?: string; period?: string; maxAttempts?: number },
    @Req() req: { user?: { username?: string; userId?: string } },
  ) {
    return this.enqueueIntegrationAlignmentCycle(body, req);
  }

  /**
   * 长耗时只读对齐异步入口。立即返回 202，避免反向代理超时造成“前端失败、后台成功”。
   */
  @Post('integration/alignment/enqueue')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async enqueueIntegrationAlignmentCycle(
    @Body() body: { scope?: string[]; bookId?: string; period?: string; maxAttempts?: number; execution?: { executionId: string; leaseId: string } },
    @Req() req: { user?: { username?: string; userId?: string } },
  ) {
    const requestedBy = String(req?.user?.username || req?.user?.userId || 'unknown');
    const scope = this.cls?.get<{ isGlobal?: boolean; allowedCompanyCodes?: string[] }>('dataScope');
    if (!scope) throw new ForbiddenException('CHANJET_SYNC_DATASCOPE_REQUIRED');
    if (!scope.isGlobal) {
      const gate = await this.integration.accountBookMappingGate();
      const binding = gate.mappings.find(m => m.bookId === body.bookId && m.status === 'VALID' && m.syncEnabled);
      if (!binding || !(scope.allowedCompanyCodes || []).includes(binding.companyCode)) throw new ForbiddenException('CHANJET_SYNC_COMPANY_SCOPE_DENIED');
    }
    const enqueueResult = await this.readonlySyncScheduler.enqueueManualSync(`user:${requestedBy}`, body, { authPrincipal: requestedBy });
    return {
      success: enqueueResult.accepted || ['QUEUED', 'RUNNING'].includes(enqueueResult.run.state),
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

  /**
   * Unified exact-mapping closure view. Deterministic matches are separated
   * from missing ERP masters, domain-policy gaps and ambiguous identities.
   */
  @Get('integration/exact-mapping-closure')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationExactMappingClosure() {
    const [masterData, wms] = await Promise.all([
      this.integration.masterDataMappingReview(),
      this.wmsBridge.mappingGapOverview(),
    ]);
    const exactAutoConfirmable = masterData.candidates
      .filter((candidate) => candidate.closureState === 'EXACT_AUTO_CONFIRMABLE').length
      + wms.summary.autoCloseEligible;
    const structuralGaps = masterData.candidates
      .filter((candidate) => [
        'ERP_MASTER_MISSING',
        'UNRESOLVED',
      ].includes(candidate.closureState)).length
      + wms.summary.needMapping;
    const conflicts = masterData.summary.conflicts + wms.summary.conflicts;
    const cashAccount = masterData.domains.find((domain) => domain.domain === 'CASH_ACCOUNT');

    return {
      success: true,
      closure: {
        generatedAt: new Date().toISOString(),
        decision: conflicts > 0
          ? 'HOLD'
          : structuralGaps > 0
            ? 'GO_WITH_CONDITIONS'
            : 'GO',
        summary: {
          exactAutoConfirmable,
          structuralGaps,
          conflicts,
          financeExactMatches: cashAccount?.exactMatches || 0,
          financeSourceRows: cashAccount?.sourceRows || 0,
          wmsMapped: wms.summary.mapped,
          wmsTotal: wms.summary.total,
          wmsCoverageRate: wms.summary.mappingCoverageRate,
          providerPermissionHolds: wms.summary.providerPermissionHolds,
        },
        masterData,
        wms: {
          summary: wms.summary,
          byType: wms.byType,
          byGapClass: wms.byGapClass,
        },
        guardrails: {
          exactOnly: true,
          sameCompanyRequired: true,
          sameCurrencyRequiredForCashAccount: true,
          oneSourceToOneTargetRequired: true,
          fuzzyAutoMapping: false,
          chanjetWrite: false,
          erpBusinessTableWrite: false,
        },
      },
    };
  }

  /**
   * Close every mapping that is provably exact. Unresolved rows retain an
   * explicit blocker instead of being force-mapped.
   */
  @Post('integration/exact-mapping-closure/run')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async runIntegrationExactMappingClosure(
    @Req() req: { user?: { username?: string; userId?: string } },
  ) {
    const requestedBy = String(req?.user?.username || req?.user?.userId || 'unknown');
    const actor = `system:exact-closure:${requestedBy}`;
    this.log.warn(`Chanjet exact mapping closure requested user=${requestedBy}`);
    const [masterData, wms] = await Promise.all([
      this.integration.confirmDeterministicMasterDataMappings(actor),
      this.wmsBridge.refreshMasterMappingCandidates(actor),
    ]);
    const status = await this.integrationExactMappingClosure();
    return {
      success: masterData.errors.length === 0 && wms.conflicts === 0,
      writeChanjet: false,
      writeErpBusinessTables: false,
      masterData,
      wms,
      closure: status.closure,
    };
  }

  /**
   * Review-ready ERP master gap manifest. It groups repeated source identities
   * but never creates ERP masters or changes approved mapping decisions.
   */
  @Get('integration/erp-master-gap-closure')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationErpMasterGapClosure() {
    const [finance, wms] = await Promise.all([
      this.integration.financeMasterGapClosureManifest(),
      this.wmsBridge.erpMasterGapClosureManifest(),
    ]);
    const summary = summarizeMasterGapProposals(finance.proposals, wms.proposals);
    return {
      success: true,
      closure: {
        generatedAt: new Date().toISOString(),
        decision: summary.proposalGroups ? 'READY_FOR_REVIEW' : 'GO',
        summary,
        finance,
        wms,
        policyState: {
          houseLocations: wms.policyState.houseLocations,
          uomConversions: wms.policyState.uomConversions,
        },
        guardrails: {
          proposalEvidenceOnly: true,
          automaticErpMasterCreation: false,
          automaticMappingApproval: false,
          fuzzyMapping: false,
          chanjetWrite: false,
          erpBusinessTableWrite: false,
        },
      },
    };
  }

  @Post('integration/erp-master-gap-closure/stage')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async stageIntegrationErpMasterGapClosure(
    @Req() req: { user?: { username?: string; userId?: string } },
  ) {
    const requestedBy = String(req?.user?.username || req?.user?.userId || 'unknown');
    const actor = `system:erp-master-gap-stage:${requestedBy}`;
    this.log.warn(`Chanjet ERP master gap proposals staged user=${requestedBy}`);
    const [finance, wms] = await Promise.all([
      this.integration.stageFinanceMasterGapClosureProposals(actor),
      this.wmsBridge.stageErpMasterGapClosureProposals(actor),
    ]);
    return {
      success: true,
      stagedAt: new Date().toISOString(),
      finance,
      wms,
      closure: (await this.integrationErpMasterGapClosure()).closure,
      writeChanjet: false,
      writeErpBusinessTables: false,
      automaticErpMasterCreation: false,
    };
  }

  /**
   * System business review for staged Chanjet -> ERP master gaps.
   * Only exact, same-company and semantically complete candidates are actionable.
   */
  @Get('integration/erp-master-gap-closure/business-review')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationErpMasterBusinessReview() {
    return {
      success: true,
      plan: await this.erpMasterBusinessReview.plan(),
      writeChanjet: false,
      financialBalanceImport: false,
      inventoryFactImport: false,
    };
  }

  /**
   * Splits legacy HOLD rows into deterministic policy, intentional non-mapping,
   * source-quality proposals and genuine unresolved items. This endpoint is
   * strictly read-only and never changes Chanjet or ERP business facts.
   */
  @Get('integration/erp-master-gap-closure/precision-audit')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationErpMasterPrecisionAudit() {
    return {
      success: true,
      audit: await this.holdResolutionAudit.audit(),
      writeChanjet: false,
      writeErpBusinessTables: false,
    };
  }

  /**
   * Closes only audit-proven accounting grouping/payment identities that must
   * never become ERP transaction masters. The transaction is ERP middle-layer
   * only and rolls back automatically if any identity or readback changed.
   */
  @Post('integration/erp-master-gap-closure/intentional-non-mapping/close')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async closeIntegrationIntentionalNonMappings(
    @Body() body: {
      auditHash?: string;
      approveProduction?: boolean;
      confirmation?: string;
    },
    @Req() req: { user?: { username?: string; userId?: string } },
  ) {
    const requestedBy = String(req?.user?.username || req?.user?.userId || 'unknown');
    try {
      const result = await this.holdResolutionAudit.closeIntentionalNonMappings({
        auditHash: String(body.auditHash || ''),
        approveProduction: body.approveProduction === true,
        confirmation: String(body.confirmation || ''),
      }, `system:chanjet-intentional-non-mapping:${requestedBy}`);
      await this.writeChanjetAudit(
        req,
        'CHANJET_INTENTIONAL_NON_MAPPING_CLOSE',
        result.auditHash,
        'SUCCESS',
        result,
      );
      return { success: true, result };
    } catch (error) {
      await this.writeChanjetAudit(
        req,
        'CHANJET_INTENTIONAL_NON_MAPPING_CLOSE',
        String(body.auditHash || ''),
        'FAIL',
        { error: (error as Error).message },
      );
      throw error;
    }
  }

  /**
   * One-row, name-only Chanjet product correction. The service derives the
   * target from the current precision-audit hash, reads before writing, verifies
   * the provider and ERP mirror, and restores the original name on any drift.
   */
  @Post('integration/product-name-canary/execute')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async executeIntegrationProductNameCanary(
    @Body() body: {
      mappingId?: string;
      auditHash?: string;
      approveProduction?: boolean;
      confirmation?: string;
    },
    @Req() req: { user?: { username?: string; userId?: string } },
  ) {
    const requestedBy = String(req?.user?.username || req?.user?.userId || 'unknown');
    try {
      const result = await this.productNameCanary.execute({
        mappingId: String(body.mappingId || ''),
        auditHash: String(body.auditHash || ''),
        approveProduction: body.approveProduction === true,
        confirmation: String(body.confirmation || ''),
      }, `system:chanjet-product-name-canary:${requestedBy}`);
      await this.writeChanjetAudit(
        req,
        'CHANJET_PRODUCT_NAME_CANARY',
        result.evidence.productCode,
        'SUCCESS',
        result,
      );
      return { success: true, result };
    } catch (error) {
      const evidence = error instanceof ChanjetProductNameCanaryError ? error.evidence : {};
      await this.writeChanjetAudit(
        req,
        'CHANJET_PRODUCT_NAME_CANARY',
        String(body.mappingId || ''),
        'FAIL',
        { error: (error as Error).message, evidence },
      );
      throw error;
    }
  }

  /**
   * Closes the exact audited "育雏" accounting grouping as non-transactional.
   * The write is limited to the ERP mapping layer and is transactionally rolled
   * back when identity or policy readback changes.
   */
  @Post('integration/erp-master-gap-closure/organization-policy/close')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async closeIntegrationOrganizationPolicy(
    @Body() body: {
      auditHash?: string;
      approveProduction?: boolean;
      confirmation?: string;
    },
    @Req() req: { user?: { username?: string; userId?: string } },
  ) {
    const requestedBy = String(req?.user?.username || req?.user?.userId || 'unknown');
    try {
      const result = await this.holdResolutionAudit.closeOrganizationPolicy({
        auditHash: String(body.auditHash || ''),
        approveProduction: body.approveProduction === true,
        confirmation: String(body.confirmation || ''),
      }, `system:chanjet-organization-policy:${requestedBy}`);
      await this.writeChanjetAudit(
        req,
        'CHANJET_ORGANIZATION_POLICY_CLOSE',
        result.auditHash,
        'SUCCESS',
        result,
      );
      return { success: true, result };
    } catch (error) {
      await this.writeChanjetAudit(
        req,
        'CHANJET_ORGANIZATION_POLICY_CLOSE',
        String(body.auditHash || ''),
        'FAIL',
        { error: (error as Error).message },
      );
      throw error;
    }
  }

  /**
   * Creates only the exact approved ERP locations for one company and records
   * their house/location bridge policies. No Chanjet or inventory-fact write.
   */
  @Post('integration/erp-master-gap-closure/house-location-policy/preflight')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async preflightIntegrationHouseLocationPolicy(
    @Body() body: { companyCode?: string; auditHash?: string },
    @Req() req: { user?: { username?: string; userId?: string } },
  ) {
    try {
      const result = await this.holdResolutionAudit.preflightHouseLocationPolicies({
        companyCode: String(body.companyCode || ''),
        auditHash: String(body.auditHash || ''),
      });
      await this.writeChanjetAudit(
        req,
        'CHANJET_HOUSE_LOCATION_POLICY_PREFLIGHT',
        result.companyCode,
        result.ready ? 'SUCCESS' : 'FAIL',
        result,
      );
      return { success: true, result };
    } catch (error) {
      await this.writeChanjetAudit(
        req,
        'CHANJET_HOUSE_LOCATION_POLICY_PREFLIGHT',
        String(body.companyCode || ''),
        'FAIL',
        { error: (error as Error).message, writeChanjet: false },
      );
      throw error;
    }
  }

  @Post('integration/erp-master-gap-closure/house-location-policy/close')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async closeIntegrationHouseLocationPolicy(
    @Body() body: {
      companyCode?: string;
      auditHash?: string;
      approveProduction?: boolean;
      confirmation?: string;
    },
    @Req() req: { user?: { username?: string; userId?: string } },
  ) {
    const requestedBy = String(req?.user?.username || req?.user?.userId || 'unknown');
    try {
      const result = await this.holdResolutionAudit.closeHouseLocationPolicies({
        companyCode: String(body.companyCode || ''),
        auditHash: String(body.auditHash || ''),
        approveProduction: body.approveProduction === true,
        confirmation: String(body.confirmation || ''),
      }, `system:chanjet-house-location-policy:${requestedBy}`);
      await this.writeChanjetAudit(
        req,
        'CHANJET_HOUSE_LOCATION_POLICY_CLOSE',
        result.companyCode,
        'SUCCESS',
        result,
      );
      return { success: true, result };
    } catch (error) {
      await this.writeChanjetAudit(
        req,
        'CHANJET_HOUSE_LOCATION_POLICY_CLOSE',
        String(body.companyCode || ''),
        'FAIL',
        { error: (error as Error).message },
      );
      throw error;
    }
  }

  /** One provider read, zero writes. Confirms the exact row and current API grant. */
  @Post('integration/product-name-canary/preflight')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async preflightIntegrationProductNameCanary(
    @Body() body: { mappingId?: string; auditHash?: string },
    @Req() req: { user?: { username?: string; userId?: string } },
  ) {
    try {
      const result = await this.productNameCanary.preflight({
        mappingId: String(body.mappingId || ''),
        auditHash: String(body.auditHash || ''),
      });
      await this.writeChanjetAudit(
        req,
        'CHANJET_PRODUCT_NAME_PREFLIGHT',
        result.productCode,
        'SUCCESS',
        result,
      );
      return { success: true, result };
    } catch (error) {
      await this.writeChanjetAudit(
        req,
        'CHANJET_PRODUCT_NAME_PREFLIGHT',
        String(body.mappingId || ''),
        'FAIL',
        { error: (error as Error).message, writeChanjet: false },
      );
      throw error;
    }
  }

  /** Read the latest persisted B1 failure evidence without calling Chanjet. */
  @Get('integration/product-name-canary/latest-failure')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async latestIntegrationProductNameCanaryFailure() {
    const rows = await this.ds.query(
      `SELECT id::text, created_at, after_data
         FROM sys_operation_logs
        WHERE module_code=$1
          AND action_code='CHANJET_PRODUCT_NAME_CANARY'
          AND result_status='FAIL'
        ORDER BY id DESC
        LIMIT 1`,
      [CHANJET_PROXY_MENU],
    );
    if (rows.length !== 1) {
      return { success: true, result: null, readOnly: true, providerCalls: 0 };
    }
    return {
      success: true,
      result: {
        id: String(rows[0].id),
        createdAt: rows[0].created_at,
        afterData: this.maskSensitive(rows[0].after_data || {}),
      },
      readOnly: true,
      providerCalls: 0,
    };
  }

  @Post('integration/erp-master-gap-closure/business-review/apply')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async applyIntegrationErpMasterBusinessReview(
    @Body() body: { reviewHash?: string; approvalToken?: string; mappingTypes?: string[] },
    @Req() req: { user?: { username?: string; userId?: string } },
  ) {
    const requestedBy = String(req?.user?.username || req?.user?.userId || 'unknown');
    try {
      const result = await this.erpMasterBusinessReview.apply({
        reviewHash: String(body.reviewHash || ''),
        approvalToken: String(body.approvalToken || ''),
        mappingTypes: Array.isArray(body.mappingTypes) ? body.mappingTypes : undefined,
        actor: `system:chanjet-business-review:${requestedBy}`,
      });
      await this.writeChanjetAudit(
        req,
        CHANJET_ERP_MASTER_REVIEW_ACTION,
        result.reviewHash,
        'SUCCESS',
        result,
      );
      return { success: true, result };
    } catch (error) {
      await this.writeChanjetAudit(
        req,
        CHANJET_ERP_MASTER_REVIEW_ACTION,
        String(body.reviewHash || ''),
        'FAIL',
        { error: (error as Error).message },
      );
      throw error;
    }
  }

  @Get('integration/wms/domain-policies')
  @RequireMenu(CHANJET_PROXY_MENU, 'V')
  async integrationWmsDomainPolicies() {
    return {
      success: true,
      domainPolicies: await this.wmsBridge.domainPolicyOverview(),
    };
  }

  @Post('integration/wms/domain-policies/house-location/review')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async reviewIntegrationWmsHouseLocationPolicy(
    @Body() body: ReviewHouseLocationPolicyInput,
    @Req() req: { user?: { username?: string; userId?: string } },
  ) {
    const actor = String(req?.user?.username || req?.user?.userId || '');
    this.log.warn(
      `Chanjet WMS house/location policy review user=${actor} source=${body.bookId}:${body.sourceWarehouseCode} decision=${body.decision}`,
    );
    return {
      success: true,
      result: await this.wmsBridge.reviewHouseLocationPolicy(body, actor),
    };
  }

  @Post('integration/wms/domain-policies/uom-conversion/review')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async reviewIntegrationWmsUomConversionPolicy(
    @Body() body: ReviewUomConversionPolicyInput,
    @Req() req: { user?: { username?: string; userId?: string } },
  ) {
    const actor = String(req?.user?.username || req?.user?.userId || '');
    this.log.warn(
      `Chanjet WMS UOM conversion policy review user=${actor} source=${body.bookId}:${body.sourceProductCode}:${body.sourceUom} decision=${body.decision}`,
    );
    return {
      success: true,
      result: await this.wmsBridge.reviewUomConversionPolicy(body, actor),
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
   * 单条鸡舍成本项目试写。只允许从 ACTIVE ERP 鸡舍创建同编码项目；不修改原部门、
   * 人员、历史单据或权限。失败时把本次新建项目停用，避免半成品继续参与业务选择。
   */
  @Post('integration/house-projects/pilot')
  @RequireMenu(CHANJET_PROXY_MENU, 'E')
  async createHouseProjectPilot(
    @Req() req: any,
    @Body() body: {
      approveProduction: boolean;
      confirmation: string;
      bookId: string;
      houseCode: string;
      expectedName: string;
      projectCategoryCode?: string;
    },
  ) {
    const bookId = String(body.bookId || '').trim();
    const houseCode = String(body.houseCode || '').trim();
    const expectedName = String(body.expectedName || '').trim();
    const categoryCode = String(body.projectCategoryCode || '00').trim();
    if (body.approveProduction !== true || body.confirmation !== 'CREATE_HOUSE_PROJECT_CANARY') {
      throw new ForbiddenException('生产试写需要 approveProduction=true 和精确确认短语');
    }
    if (!/^HOUSE_[A-Z0-9_]{2,50}$/.test(houseCode) || /DEBUG|TEST|_CS_/i.test(houseCode)) {
      throw new ForbiddenException('鸡舍编码不符合生产主数据规则');
    }
    if (!expectedName || expectedName.length > 100 || /测试|调试/i.test(expectedName)) {
      throw new ForbiddenException('鸡舍名称不符合生产主数据规则');
    }
    if (categoryCode !== '00') throw new ForbiddenException('试点仅允许已验证的项目分类 00');
    const approvedTarget = resolveChanjetHouseProjectTarget(bookId, houseCode, expectedName, categoryCode);
    if (!approvedTarget) throw new ForbiddenException('鸡舍项目目标不在精确审核白名单或账套/名称不一致');

    const rows = await this.ds.query(
      `SELECT house_code, house_name, farm_code, status
         FROM brd_houses
        WHERE house_code=$1
        LIMIT 2`,
      [houseCode],
    );
    if (rows.length !== 1
      || String(rows[0].status) !== 'ACTIVE'
      || String(rows[0].house_name || '') !== expectedName
      || String(rows[0].farm_code || '') !== approvedTarget.farmCode) {
      throw new ForbiddenException('ERP 鸡舍不存在、非 ACTIVE 或名称/场区不一致');
    }

    const listPath = `/accounting/openapi/cc/project/list/${bookId}`;
    const syncPath = `/accounting/document/integration/project/batchUpsert/${bookId}`;
    const syncSourceId = approvedTarget.syncSourceId;
    let createdId = '';
    let projectCategoryId = 0;
    let upsertSucceeded = false;
    let detailVerified = false;
    let listVerified = false;
    let rollbackAttempted = false;
    let rollbackSucceeded = false;
    let reactivatingExistingId = '';
    let beforeProjectRows: Array<Record<string, unknown>> = [];
    let overwrittenBeforeProject: Record<string, unknown> | null = null;
    const mirrorReadbackEvidence: Array<{
      attempt: number;
      delayMs: number;
      syncStatus: 'SUCCESS' | 'FAIL' | 'UNKNOWN';
      syncError: string | null;
      rows: Array<{ externalId: string; externalCode: string; externalName: string; status: string }>;
    }> = [];
    const projectRows = (payload: unknown): Array<Record<string, unknown>> => {
      if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
      if (!payload || typeof payload !== 'object') return [];
      const record = payload as Record<string, unknown>;
      if (Array.isArray(record.rows)) return record.rows as Array<Record<string, unknown>>;
      for (const key of ['data', 'result', 'value']) {
        const nested = projectRows(record[key]);
        if (nested.length) return nested;
      }
      return [];
    };
    const projectData = (payload: unknown): Record<string, unknown> => {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
      const record = payload as Record<string, unknown>;
      const data = record.data;
      if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>;
      return record;
    };
    const projectCategory = (payload: Record<string, unknown>): Record<string, unknown> => (
      payload.projectCategory && typeof payload.projectCategory === 'object' && !Array.isArray(payload.projectCategory)
        ? payload.projectCategory as Record<string, unknown>
        : {}
    );
    const enumValue = (value: unknown): string => (
      value && typeof value === 'object' && !Array.isArray(value)
        ? String((value as Record<string, unknown>).value || '')
        : String(value || '')
    );
    const projectInvariant = (row: Record<string, unknown>) => {
      const category = projectCategory(row);
      const relation = (key: string) => {
        const value = row[key];
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        const record = value as Record<string, unknown>;
        return {
          id: String(record.id || ''),
          code: String(record.code || record.empCode || ''),
          name: String(record.name || record.partyName || ''),
        };
      };
      return JSON.stringify({
        id: String(row.id || ''),
        code: String(row.code || ''),
        name: String(row.name || ''),
        statusEnum: enumValue(row.statusEnum),
        projectCategory: {
          id: String(category.id || ''),
          code: String(category.code || row.projectCategoryCode || ''),
        },
        department: relation('department'),
        employee: relation('employee'),
        custVendor: relation('custVendor'),
        parentProject: relation('parentProject'),
      });
    };

    try {
      const before = await this.auth.callApi(listPath, { method: 'POST', body: {}, kind: 'READ' });
      beforeProjectRows = projectRows(before);
      const collision = beforeProjectRows.find((item) => String(item.code || '') === houseCode || String(item.name || '') === expectedName);
      if (collision) {
        if (String(collision.code || '') !== houseCode || String(collision.name || '') !== expectedName) {
          throw new Error('项目编码或名称已被其他主数据占用');
        }
        createdId = String(collision.id || '');
        if (!createdId) throw new Error('已有项目缺少可回读的唯一 ID');
        const existingDetailEnvelope = await this.auth.callApi<Record<string, unknown>>(
          `/accounting/openapi/cc/project/query/${encodeURIComponent(createdId)}/${bookId}`,
          { method: 'GET', kind: 'READ' },
        );
        const existingDetail = projectData(existingDetailEnvelope);
        const existingCategory = projectCategory(existingDetail);
        const existingStatus = existingDetail.statusEnum && typeof existingDetail.statusEnum === 'object'
          ? String((existingDetail.statusEnum as Record<string, unknown>).value || '')
          : String(existingDetail.statusEnum || '');
        if (String(existingDetail.code || '') !== houseCode
          || String(existingDetail.name || '') !== expectedName
          || String(existingCategory.code || existingDetail.projectCategoryCode || '') !== categoryCode) {
          throw new Error('已有项目详情与金丝雀目标不一致');
        }
        if (existingStatus === 'A') {
          detailVerified = true;
          const mirror = await this.integration.syncReadOnlyMirror(['PROJECT'], bookId);
          const projectSync = mirror.results?.find((result) => (
            result.key === 'PROJECT' && result.bookId === bookId
          ));
          if (projectSync?.status === 'FAIL') {
            throw new Error(`ERP 镜像同步失败，不自动重试: ${projectSync.error || '未知错误'}`);
          }
          const existingMirrorRows = await this.ds.query(
            `SELECT external_id, external_code, external_name, status
               FROM chanjet_entity_snapshots
              WHERE book_id=$1 AND entity_type='PROJECT' AND external_code=$2
              ORDER BY updated_at DESC
              LIMIT 2`,
            [bookId, houseCode],
          );
          if (existingMirrorRows.length !== 1
            || String(existingMirrorRows[0].external_id || '') !== createdId
            || String(existingMirrorRows[0].external_name || '') !== expectedName) {
            throw new Error('已有启用项目未在 ERP 镜像中形成唯一一致记录');
          }
          await this.writeChanjetAudit(req, 'CHANJET_HOUSE_PROJECT_PILOT', syncPath, 'SUCCESS', {
            outcome: 'IDEMPOTENT_EXISTING_VERIFIED', bookId, houseCode, expectedName,
            externalId: createdId, statusEnum: existingStatus, writeChanjet: false,
            readback: { detail: true, erpMirror: true },
          });
          return {
            success: true,
            outcome: 'IDEMPOTENT_EXISTING_VERIFIED',
            writeChanjet: false,
            changedExistingDepartment: false,
            project: {
              id: createdId,
              code: houseCode,
              name: expectedName,
              projectCategoryCode: categoryCode,
              statusEnum: existingStatus,
            },
            readback: { detail: true, erpMirror: true, mirrorAttempts: 1 },
          };
        }
        if (existingStatus !== 'I') {
          throw new Error(`已有项目状态不允许幂等处理: ${existingStatus || 'UNKNOWN'}`);
        }
        reactivatingExistingId = createdId;
      }

      // The app is authorized for the integration batchUpsert API, while the
      // standalone project/add permission is not granted. The reviewed list
      // contract already returns projectCategory.id/code, so reuse that
      // read-before-write evidence instead of spending another provider call.
      const categorySeed = projectRows(before).find((item) => {
        const category = projectCategory(item);
        return String(category.code || item.projectCategoryCode || '') === categoryCode;
      });
      const verifiedCategory = categorySeed ? projectCategory(categorySeed) : {};
      projectCategoryId = Number(verifiedCategory.id || categorySeed?.projectCategoryId || 0);
      if (!Number.isSafeInteger(projectCategoryId) || projectCategoryId <= 0
        || String(verifiedCategory.code || categorySeed?.projectCategoryCode || '') !== categoryCode) {
        throw new Error(`无法从现有项目解析分类 ${categoryCode} 的有效读前证据`);
      }
      const projectInput = {
        id: syncSourceId,
        code: houseCode,
        name: expectedName,
        statusEnum: 'A',
      };
      const added = await this.auth.callApi<Record<string, unknown>>(syncPath, {
        method: 'POST', body: [projectInput], kind: 'WRITE',
      });
      const addedData = projectData(added);
      const successResultMap = (
        addedData.successResultMap && typeof addedData.successResultMap === 'object'
          ? addedData.successResultMap as Record<string, unknown>
          : {}
      );
      const failResultMap = (
        addedData.failResultMap && typeof addedData.failResultMap === 'object'
          ? addedData.failResultMap as Record<string, unknown>
          : {}
      );
      if (Object.prototype.hasOwnProperty.call(failResultMap, houseCode)) {
        throw new Error(`项目同步接口拒绝 ${houseCode}: ${String(failResultMap[houseCode])}`);
      }
      upsertSucceeded = true;
      createdId = String(successResultMap[houseCode] || addedData.id || projectRows(added)[0]?.id || createdId || '');
      if (!createdId) {
        const afterAddList = await this.auth.callApi(listPath, { method: 'POST', body: {}, kind: 'READ' });
        const created = projectRows(afterAddList).find((item) => String(item.code || '') === houseCode);
        createdId = String(created?.id || '');
      }
      if (!createdId) throw new Error('新增返回后无法解析项目 ID');
      if (!reactivatingExistingId) {
        overwrittenBeforeProject = beforeProjectRows.find((item) => String(item.id || '') === createdId) || null;
        if (overwrittenBeforeProject) {
          throw new Error(`项目同步返回既有项目 ID ${createdId}，判定为覆盖而非新增`);
        }
      }

      const detailPath = `/accounting/openapi/cc/project/query/${encodeURIComponent(createdId)}/${bookId}`;
      const detailEnvelope = await this.auth.callApi<Record<string, unknown>>(detailPath, { method: 'GET', kind: 'READ' });
      const detail = projectData(detailEnvelope);
      const category = projectCategory(detail);
      const status = detail.statusEnum && typeof detail.statusEnum === 'object'
        ? String((detail.statusEnum as Record<string, unknown>).value || '') : String(detail.statusEnum || '');
      if (String(detail.code || '') !== houseCode
        || String(detail.name || '') !== expectedName
        || String(category.code || detail.projectCategoryCode || '') !== categoryCode
        || status !== 'A') {
        throw new Error('好业财项目详情回读与写入目标不一致');
      }
      detailVerified = true;

      // The provider's public contract describes batchUpsert.id ambiguously.
      // Production proved that reusing it can overwrite an unrelated project.
      // Require an exact +1 cardinality change (or same count for a reviewed
      // inactive reactivation) and preserve every pre-write identity/relation.
      const listDelaysMs = process.env.NODE_ENV === 'test' ? [0, 0, 0] : [2_000, 3_000, 5_000];
      const expectedCount = beforeProjectRows.length + (reactivatingExistingId ? 0 : 1);
      const beforeById = new Map(beforeProjectRows.map((item) => [String(item.id || ''), projectInvariant(item)]));
      for (let index = 0; index < listDelaysMs.length; index += 1) {
        const delayMs = listDelaysMs[index];
        if (delayMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        const afterEnvelope = await this.auth.callApi(listPath, { method: 'POST', body: {}, kind: 'READ' });
        const afterRows = projectRows(afterEnvelope);
        const afterById = new Map(afterRows.map((item) => [String(item.id || ''), item]));
        const targetRows = afterRows.filter((item) => (
          String(item.id || '') === createdId
          && String(item.code || '') === houseCode
          && String(item.name || '') === expectedName
        ));
        const changedBefore = beforeProjectRows.find((item) => {
          const id = String(item.id || '');
          if (reactivatingExistingId && id === reactivatingExistingId) return false;
          const after = afterById.get(id);
          return !after || projectInvariant(after) !== beforeById.get(id);
        });
        if (changedBefore) {
          overwrittenBeforeProject = changedBefore;
          throw new Error(`项目同步改变了既有项目 ${String(changedBefore.id || '')}，触发原值回滚`);
        }
        if (targetRows.length === 1 && afterRows.length === expectedCount) {
          listVerified = true;
          break;
        }
        const stillPreWriteSnapshot = targetRows.length === 0 && afterRows.length === beforeProjectRows.length;
        if (!stillPreWriteSnapshot || index === listDelaysMs.length - 1) {
          throw new Error(`项目列表回读未满足数量与唯一性不变量: before=${beforeProjectRows.length} after=${afterRows.length}`);
        }
      }
      if (!listVerified) throw new Error('项目列表回读未通过');

      // batchUpsert detail is strongly readable before the project list always
      // converges. Delay the first mirror read and retry only a successful-but-
      // stale list response. Provider/business failures are never retried here.
      const mirrorDelaysMs = process.env.NODE_ENV === 'test'
        ? [0, 0, 0]
        : [2_000, 3_000, 5_000];
      let mirrorVerified = false;
      for (let index = 0; index < mirrorDelaysMs.length; index += 1) {
        const delayMs = mirrorDelaysMs[index];
        if (delayMs > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        }
        const mirror = await this.integration.syncReadOnlyMirror(['PROJECT'], bookId);
        const projectSync = mirror.results?.find((result) => (
          result.key === 'PROJECT' && result.bookId === bookId
        ));
        if (projectSync?.status === 'FAIL') {
          mirrorReadbackEvidence.push({
            attempt: index + 1,
            delayMs,
            syncStatus: 'FAIL',
            syncError: projectSync.error || '未知错误',
            rows: [],
          });
          throw new Error(`ERP 镜像同步失败，不自动重试: ${projectSync.error || '未知错误'}`);
        }
        const mirrorRows = await this.ds.query(
          `SELECT external_id, external_code, external_name, status
             FROM chanjet_entity_snapshots
            WHERE book_id=$1 AND entity_type='PROJECT' AND external_code=$2
            ORDER BY updated_at DESC
            LIMIT 2`,
          [bookId, houseCode],
        );
        const evidenceRows = mirrorRows.map((row: Record<string, unknown>) => ({
          externalId: String(row.external_id || ''),
          externalCode: String(row.external_code || ''),
          externalName: String(row.external_name || ''),
          status: String(row.status || ''),
        }));
        mirrorReadbackEvidence.push({
          attempt: index + 1,
          delayMs,
          syncStatus: projectSync?.status || 'UNKNOWN',
          syncError: null,
          rows: evidenceRows,
        });
        if (mirrorRows.length === 1 && String(mirrorRows[0].external_name || '') === expectedName) {
          mirrorVerified = true;
          break;
        }
      }
      if (!mirrorVerified) {
        throw new Error(`ERP 镜像回读未在 ${mirrorReadbackEvidence.length} 次低频延迟确认内形成唯一一致项目`);
      }

      await this.writeChanjetAudit(req, 'CHANJET_HOUSE_PROJECT_PILOT', syncPath, 'SUCCESS', {
        outcome: 'CREATED_AND_VERIFIED', bookId, houseCode, expectedName, createdId,
        projectCategoryCode: categoryCode, projectCategoryId, syncSourceId,
        changedExistingDepartment: false, listVerified,
        mirrorReadbackEvidence,
      });
      return {
        success: true,
        outcome: 'CREATED_AND_VERIFIED',
        writeChanjet: true,
        changedExistingDepartment: false,
        project: {
          id: createdId, code: houseCode, name: expectedName,
          projectCategoryCode: categoryCode, projectCategoryId, syncSourceId, statusEnum: 'A',
        },
        readback: { detail: true, list: true, erpMirror: true, mirrorAttempts: mirrorReadbackEvidence.length },
      };
    } catch (error) {
      if (upsertSucceeded && syncSourceId > 0) {
        rollbackAttempted = true;
        try {
          const rollbackCode = overwrittenBeforeProject
            ? String(overwrittenBeforeProject.code || '') : houseCode;
          const rollbackName = overwrittenBeforeProject
            ? String(overwrittenBeforeProject.name || '') : expectedName;
          const rollbackStatus = overwrittenBeforeProject
            ? (enumValue(overwrittenBeforeProject.statusEnum) || 'A') : 'I';
          await this.auth.callApi(syncPath, {
            method: 'POST',
            kind: 'WRITE',
            body: [{ id: syncSourceId, code: rollbackCode, name: rollbackName, statusEnum: rollbackStatus }],
          });
          const rolledBack = await this.auth.callApi<Record<string, unknown>>(
            `/accounting/openapi/cc/project/query/${encodeURIComponent(createdId)}/${bookId}`,
            { method: 'GET', kind: 'READ' },
          );
          const detail = projectData(rolledBack);
          const status = detail.statusEnum && typeof detail.statusEnum === 'object'
            ? String((detail.statusEnum as Record<string, unknown>).value || '') : String(detail.statusEnum || '');
          rollbackSucceeded = String(detail.code || '') === rollbackCode
            && String(detail.name || '') === rollbackName
            && status === rollbackStatus;
        } catch (rollbackError) {
          this.log.error(`house project rollback failed id=${createdId}: ${(rollbackError as Error).message}`);
        }
      }
      await this.writeChanjetAudit(req, 'CHANJET_HOUSE_PROJECT_PILOT', syncPath, 'FAIL', {
        bookId, houseCode, expectedName, createdId: createdId || null,
        projectCategoryId: projectCategoryId || null, syncSourceId, upsertSucceeded,
        error: (error as Error).message, detailVerified, listVerified, mirrorReadbackEvidence,
        rollbackAttempted, rollbackSucceeded,
      });
      return {
        success: false,
        writeChanjet: upsertSucceeded,
        changedExistingDepartment: false,
        error: (error as Error).message,
        readback: {
          detail: detailVerified,
          erpMirror: false,
          mirrorAttempts: mirrorReadbackEvidence.length,
          evidence: mirrorReadbackEvidence,
        },
        rollback: { attempted: rollbackAttempted, succeeded: rollbackSucceeded },
      };
    }
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
