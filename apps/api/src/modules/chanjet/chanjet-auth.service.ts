import { assertChanjetProxyReadonly } from './chanjet-remote-readonly';
import { assertReadonlyOrchestrationOwnerIfPresent } from './chanjet-readonly-execution';
import { activeExecutionScope } from './chanjet-execution-scope';
import { ChanjetBusinessFailureError, ProviderSendOperation, RequestKind as ExecutionRequestKind } from './chanjet-execution-transport';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { SysChanjetStateEntity } from './sys-chanjet-state.entity';
import { CronMonitorService } from '../system-monitor/services/cron-monitor.service';

interface TokenEntry {
  openToken: string;
  expiresAt: number;
}

type ChanjetCallKind = 'READ' | 'WRITE';

interface ChanjetCallOptions {
  method?: 'GET' | 'POST';
  query?: Record<string, string>;
  // Most business APIs accept an object, while reviewed integration upsert
  // endpoints accept a top-level array.
  body?: unknown;
  orgId?: string;
  kind?: ChanjetCallKind;
  // Admission bucket when running inside an execution scope (defaults to BUSINESS).
  executionKind?: ExecutionRequestKind;
}

const SINGLETON_KEY = 'singleton';

export interface ChanjetBusinessFailure {
  code: string;
  message: string;
  requestId: string;
}

export function isHealthyAccountBookResponse(result: unknown): boolean {
  if (Array.isArray(result)) return true;
  if (!result || typeof result !== 'object') return false;
  const payload = result as Record<string, unknown>;
  return String(payload.code || '') === '200'
    || Array.isArray(payload.value)
    || Array.isArray(payload.data);
}

const CHANJET_SUCCESS_CODES = new Set([
  '0',
  '200',
  'SUCCESS',
  'OK',
  // 好业财 cc 业务接口的标准成功码。部分列表接口即使 data 为空，
  // 也会返回 code=openApi.e0000 + msg=success。
  'OPENAPI.E0000',
]);

/**
 * 好业财部分接口会在 HTTP 200 中返回业务失败信封。调用方必须把这类响应当失败，
 * 否则 error envelope 会被错误写成财务实体快照并污染覆盖率和聚合口径。
 */
export function getChanjetBusinessFailure(payload: unknown): ChanjetBusinessFailure | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const row = payload as Record<string, unknown>;
  const error = row.error && typeof row.error === 'object' && !Array.isArray(row.error)
    ? row.error as Record<string, unknown>
    : {};
  const success = row.success;
  const explicitFailure = success === false || String(success || '').toLowerCase() === 'false';
  const code = String(row.code ?? error.code ?? '').trim();
  const message = String(row.msg ?? row.message ?? error.msg ?? error.message ?? '').trim();
  const requestId = String(row.requestId ?? row.request_id ?? error.requestId ?? '').trim();
  const failedCode = Boolean(code && !CHANJET_SUCCESS_CODES.has(code.toUpperCase()));
  const status = Number(row.status ?? error.status);
  const failedStatus = Number.isFinite(status) && status >= 400;
  const nullDataFailure = row.data === null && failedCode && Boolean(message);
  const nestedError = Object.keys(error).length > 0 && failedCode;
  const identifiedFailure = failedCode && Boolean(message) && Boolean(requestId);
  // Some Chanjet endpoints omit message while still returning a provider error
  // envelope. The requestId + 4xx/5xx status combination distinguishes it from
  // ordinary master-data rows that may legitimately contain a numeric code.
  const statusEnvelopeFailure = failedCode && failedStatus && Boolean(requestId);
  if (!explicitFailure && !nullDataFailure && !nestedError && !identifiedFailure && !statusEnvelopeFailure) return null;
  return {
    code: code || 'BUSINESS_FAILURE',
    message: message || '好业财返回业务失败',
    requestId,
  };
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
  private trafficQueue: Promise<void> = Promise.resolve();
  private readCache = new Map<string, { expiresAt: number; value: unknown }>();
  private readInFlight = new Map<string, Promise<unknown>>();

  constructor(
    private cfg: ConfigService,
    @InjectRepository(SysChanjetStateEntity)
    private stateRepo: Repository<SysChanjetStateEntity>,
    private readonly cronMon: CronMonitorService,
  ) {}

  private maskSensitive(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.maskSensitive(item));
    if (!value || typeof value !== 'object') return value;
    const masked: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/certificate|authCode|appTicket|openToken|accessToken|appSecret|secret|token/i.test(key)) {
        masked[key] = '[REDACTED]';
      } else {
        masked[key] = this.maskSensitive(item);
      }
    }
    return masked;
  }

  private providerBaseUrl(): string {
    // Default production endpoint. An override is honored ONLY for loopback
    // hosts so isolated tests can exercise the real fetch chain against a
    // local fixture; any non-loopback value fails closed instead of silently
    // re-routing provider traffic.
    const override = process.env.CHANJET_PROVIDER_BASE_URL || '';
    if (!override) return 'https://openapi.chanjet.com';
    const parsed = new URL(override);
    if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
      throw new Error('CHANJET_PROVIDER_BASE_URL_LOOPBACK_ONLY');
    }
    return override.replace(/\/+$/, '');
  }

  /**
   * Single provider send funnel. Outside an execution scope this keeps the
   * legacy fixed 30s timeout and untouched semantics (token cron, callback
   * flows, HOLD-policy traffic). Inside a scope every attempt is admission-
   * counted: reserve -> real send under the execution AbortSignal ->
   * acknowledge the receipt; cache/in-flight merging is bypassed there so one
   * logical send maps to exactly one counted HTTP request.
   */
  private executionSend<T>(kind: ExecutionRequestKind, op: ProviderSendOperation<T>): Promise<T> {
    const base = this.providerBaseUrl();
    const active = activeExecutionScope();
    if (!active) return op(AbortSignal.timeout(30_000), 30_000, base);
    return active.gateway.send(active.current, kind, (signal, deadlineMs) => op(signal, deadlineMs, base)).then((result) => {
      if (result.outcome === 'TRANSPORT_FAILURE') {
        // The gateway already cancelled the HTTP and poisoned itself: every
        // later send in this execution fails fast without touching the wire.
        throw Object.assign(new Error(result.cancelled ? 'CHANJET_EXECUTION_DEADLINE_CANCELLED' : 'CHANJET_TRANSPORT_FAILURE'), { cause: result.error });
      }
      if (result.outcome === 'BUSINESS_FAILURE') throw result.error;
      return result.value as T;
    });
  }

  async onModuleInit() {
    this.appKey    = this.cfg.get('CHANJET_APP_KEY', '');
    this.appSecret = this.cfg.get('CHANJET_APP_SECRET', '');
    this.orgId     = this.cfg.get('CHANJET_ORG_ID', '');
    this.msgSecret = this.cfg.get('CHANJET_MSG_SECRET', '');
    this.cert      = this.cfg.get('CHANJET_CERT', '');

    if (!this.appKey) {
      this.log.warn('CHANJET_APP_KEY 未配置，畅捷通对接禁用');
      return;
    }

    // 从 PG 持久化层 load 上次状态(容器重启不丢)
    try {
      const state = await this.stateRepo.findOneBy({ key: SINGLETON_KEY });
      if (state) {
        if (state.appTicket) this.appTicket = state.appTicket;
        // The callback-persisted certificate is newer than the bootstrap env
        // value after an enterprise authorization update. Prefer it on every
        // restart so an old container secret cannot silently restore old API
        // permissions.
        if (state.certificate) this.cert = state.certificate;
        if (state.tokens) {
          for (const [org, entry] of Object.entries(state.tokens)) {
            this.tokenCache.set(org, entry);
          }
        }
        this.log.log(`从 PG 恢复鉴权状态 hasTicket=${!!this.appTicket} hasCert=${!!this.cert} tokens=${this.tokenCache.size}`);
      }
    } catch (err) {
      this.log.warn(`从 PG load chanjet state 失败: ${(err as Error).message}`);
    }

    this.log.log(`CHANJET_AUTH_CONFIGURED appKeyPresent=${!!this.appKey} orgIdPresent=${!!this.orgId}`);

    // 容器启动自愈:仍无 appTicket → 主动让平台 resend(异步,不阻塞 onModuleInit)
    setImmediate(() => this.bootstrapAppTicket());
  }

  /** 持久化当前内存状态到 PG(upsert singleton 行) */
  private async persistState(): Promise<void> {
    try {
      const tokens: Record<string, TokenEntry> = {};
      for (const [org, entry] of this.tokenCache) tokens[org] = entry;
      await this.stateRepo.save({
        key: SINGLETON_KEY,
        appTicket: this.appTicket || null,
        certificate: this.cert || null,
        tokens: Object.keys(tokens).length ? tokens : null,
      });
    } catch (err) {
      this.log.warn(`持久化 chanjet state 失败: ${(err as Error).message}`);
    }
  }

  /** 启动时主动让平台 resend appTicket(覆盖容器重启场景) */
  private async bootstrapAppTicket(): Promise<void> {
    if (this.appTicket) return;  // 内存已有,跳过
    try {
      this.log.log('启动自愈:主动让平台 resend appTicket');
      await this.triggerAppTicket();
    } catch (err) {
      this.log.warn(`启动自愈 triggerAppTicket 失败: ${(err as Error).message}`);
    }
  }

  /** 定时 refresh openToken(每 4 天,token 有效 6 天留 2 天缓冲) */
  @Cron('0 0 4 */4 * *', { name: 'chanjet-refresh-token' })
  async cronRefreshToken(): Promise<void> {
    if (!this.isConfigured() || !this.appTicket || !this.cert) return;
    try {
      this.tokenCache.clear();  // 清缓存强制重换
      await this.getOpenToken();
      this.log.log('cron: openToken 已 refresh');
      await this.cronMon.ok('chanjet-refresh-token');
    } catch (err) {
      this.log.warn(`cron refresh token 失败: ${(err as Error).message}`);
      await this.cronMon.fail('chanjet-refresh-token', (err as Error)?.message ?? String(err));
    }
  }

  /** 定时健康检查(每天早 8 点,拉账套列表) */
  @Cron(CronExpression.EVERY_DAY_AT_8AM, { name: 'chanjet-health-check' })
  async cronHealthCheck(): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      const result = await this.listAccountBooks() as unknown;
      const ok = isHealthyAccountBookResponse(result);
      if (ok) {
        this.log.log('cron health check: 连接正常');
        await this.cronMon.ok('chanjet-health-check');
      } else {
        this.log.error(`cron health check: 异常 ${JSON.stringify(result).slice(0, 200)}`);
        await this.cronMon.fail('chanjet-health-check', `异常响应 ${JSON.stringify(result).slice(0, 500)}`);
      }
    } catch (err) {
      this.log.error(`cron health check 失败: ${(err as Error).message}`);
      await this.cronMon.fail('chanjet-health-check', (err as Error)?.message ?? String(err));
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
    this.log.log('appTicket 已更新: [REDACTED]');
    void this.persistState();
  }

  setCertificate(cert: string) {
    const changed = Boolean(cert && cert !== this.cert);
    this.cert = cert;
    if (changed) {
      // An openToken is bound to the authorization represented by the
      // certificate. Reusing it after a permission update makes newly granted
      // APIs appear to return successful no-ops.
      this.tokenCache.clear();
    }
    this.log.log(`certificate 已更新: [REDACTED] tokenCacheInvalidated=${changed}`);
    void this.persistState();
  }

  /** 用 authCode 换 certificate（企业授权回调场景） */
  async fetchCertificateByAuthCode(authCode: string): Promise<string> {
    this.log.log('POST /auth/certificate (authCode)');
    const json = await this.executionSend('CERTIFICATE', async (signal, _deadlineMs, base) => {
      const res = await fetch(`${base}/auth/certificate`, {
        signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appKey: this.appKey,
          appSecret: this.appSecret,
          authCode,
        }),
      });
      return await res.json() as Record<string, unknown>;
    });
    this.log.log(`certificate(authCode) 响应: ${JSON.stringify(this.maskSensitive(json)).slice(0, 500)}`);

    const result = json.result as Record<string, unknown> | undefined;
    const certificate = (result?.certificate ?? json.certificate
      ?? (json.data as Record<string, unknown>)?.certificate
      ?? (json.value as Record<string, unknown>)?.certificate) as string | undefined;
    if (certificate) {
      this.setCertificate(certificate);
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

    this.log.log('POST /auth/certificate');
    const json = await this.executionSend('CERTIFICATE', async (signal, _deadlineMs, base) => {
      const res = await fetch(`${base}/auth/certificate`, {
        signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appKey: this.appKey,
          appSecret: this.appSecret,
          appTicket: this.appTicket,
        }),
      });
      return await res.json() as Record<string, unknown>;
    });
    this.log.log(`certificate 响应: ${JSON.stringify(this.maskSensitive(json)).slice(0, 300)}`);

    const result = json.result as Record<string, unknown> | undefined;
    const certificate = (result?.certificate ?? json.certificate ?? (json.data as Record<string, unknown>)?.certificate) as string | undefined;
    if (!certificate) {
      throw new Error(`获取 certificate 失败: ${JSON.stringify(json).slice(0, 500)}`);
    }

    this.setCertificate(certificate);
    return certificate;
  }

  /** 用 appTicket + certificate 换 openToken（accessToken） */
  async getOpenToken(orgId?: string): Promise<string> {
    const targetOrg = orgId || this.orgId;
    // Inside an execution scope a cached token must not silently substitute
    // the auth exchange: the fetch (when needed) is an admission-counted TOKEN
    // request, so the scope always performs its own fresh, counted fetch.
    if (!activeExecutionScope()) {
      const cached = this.tokenCache.get(targetOrg);
      if (cached && Date.now() < cached.expiresAt - 60_000) {
        return cached.openToken;
      }
    }

    if (!this.appTicket) {
      throw new Error('无 appTicket，请先配置消息接收地址并触发 appTicket 推送');
    }

    const certificate = await this.fetchCertificate();
    this.log.log('POST generateToken');

    const json = await this.executionSend('TOKEN', async (signal, _deadlineMs, base) => {
      const res = await fetch(`${base}/v1/common/auth/selfBuiltApp/generateToken`, {
        signal,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          appKey: this.appKey,
          appSecret: this.appSecret,
        },
        body: JSON.stringify({ appTicket: this.appTicket, certificate }),
      });
      return await res.json() as Record<string, unknown>;
    });
    const value = json.value as Record<string, unknown> | undefined;
    const accessToken = value?.accessToken as string | undefined;
    const expiresIn = Number(value?.expiresIn ?? 7200);

    if (!accessToken) {
      const err = json.error as Record<string, unknown> | undefined;
      const code = String(err?.code ?? '');
      // 4041 = appTicket 已失效:自动向平台请求 resend 新 appTicket(异步推回 /api/chanjet/callback →
      //   setAppTicket),本次请求无法同步拿到新 ticket,给可读引导让用户稍后重试,实现自愈。
      //   修复前:appTicket 一旦过期,getOpenToken 永久 4041(bootstrap 只在内存无 ticket 时 resend,
      //   而过期 ticket 仍在内存/PG → 跳过 resend → 死锁)。
      //   Inside an execution scope the fire-and-forget resend is suppressed:
      //   background HTTP must stay inside the counted, cancellable execution,
      //   and the caller retries explicitly (each retry is counted).
      if (code === '4041') {
        if (!activeExecutionScope()) {
          void this.triggerAppTicket().catch((e) => this.log.warn(`4041 自愈 resend 失败: ${(e as Error).message}`));
        }
        throw new Error('好业财 appTicket 已过期,已自动向平台请求重新推送授权票据,请约 10 秒后重试同步。(code=4041)');
      }
      throw new Error(`CHANJET_AUTH_TOKEN_FAILED code=${String(err?.code || 'UNKNOWN').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32)}`);
    }

    this.tokenCache.set(targetOrg, {
      openToken: accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
    });
    this.log.log(`openToken 已缓存，有效 ${expiresIn}s`);
    void this.persistState();
    return accessToken;
  }

  /** 主动触发 appTicket 推送（需消息接收地址已配好） */
  async triggerAppTicket(): Promise<Record<string, unknown>> {
    const active = activeExecutionScope();
    if (active) {
      // Inside an execution scope the resend is an admission-counted,
      // cancellation-controlled send using the scope-owned transport op (the
      // provider endpoint was bound at scope construction).
      return this.executionSend('RESEND', active.transport.resend);
    }
    // Legacy/startup-reachable path: this exact literal call shape is the
    // reviewed startup remote call (onModuleInit -> bootstrapAppTicket -> here)
    // and must keep its literal endpoint and POST method.
    const url = 'https://openapi.chanjet.com/auth/appTicket/resend';
    this.log.log(`POST ${url}`);
    const res = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        appKey: this.appKey,
        appSecret: this.appSecret,
      },
    });
    const json = await res.json() as Record<string, unknown>;
    this.log.log(`triggerAppTicket 响应: ${JSON.stringify(this.maskSensitive(json)).slice(0, 300)}`);
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
    opts: ChanjetCallOptions = {},
    _isRetry = false,
  ): Promise<T> {
    assertReadonlyOrchestrationOwnerIfPresent();
    if (['READONLY_VERIFY', 'READONLY_ACTIVE'].includes(process.env.CHANJET_SYNC_POLICY || '')) {
      assertChanjetProxyReadonly(opts.method || 'POST', path);
      if (opts.kind === 'WRITE') throw new Error('CHANJET_EXTERNAL_WRITE_DISABLED');
    }
    const kind = opts.kind || this.inferCallKind(path);
    // Execution scope bypasses readCache/readInFlight entirely: one logical
    // send must map to exactly one admission-counted HTTP request, and cache
    // or in-flight merging must never leak a response across execution
    // identities.
    if (kind === 'READ' && !_isRetry && !activeExecutionScope()) {
      const cacheKey = this.readCacheKey(path, opts);
      const cached = this.readCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) return cached.value as T;
      if (cached) this.readCache.delete(cacheKey);

      const active = this.readInFlight.get(cacheKey);
      if (active) {
        const value = await active as T;
        assertReadonlyOrchestrationOwnerIfPresent();
        return value;
      }

      const request = this.executeCallApi<T>(path, opts, false);
      this.readInFlight.set(cacheKey, request);
      try {
        const value = await request;
        assertReadonlyOrchestrationOwnerIfPresent();
        this.storeReadCache(cacheKey, value);
        return value;
      } finally {
        this.readInFlight.delete(cacheKey);
      }
    }

    const result = await this.executeCallApi<T>(path, opts, _isRetry);
    assertReadonlyOrchestrationOwnerIfPresent();
    if (kind === 'WRITE') this.readCache.clear();
    return result;
  }

  private async executeCallApi<T>(
    path: string,
    opts: ChanjetCallOptions,
    isRetry: boolean,
  ): Promise<T> {
    if (['READONLY_VERIFY', 'READONLY_ACTIVE'].includes(process.env.CHANJET_SYNC_POLICY || '')) {
      assertChanjetProxyReadonly(opts.method || 'POST', path);
      if (opts.kind === 'WRITE') throw new Error('CHANJET_EXTERNAL_WRITE_DISABLED');
    }
    const kind = opts.kind || this.inferCallKind(path);
    await this.reserveTrafficBudget(kind, path);
    await this.waitForTrafficSlot();
    const token = await this.getOpenToken(opts.orgId);
    assertReadonlyOrchestrationOwnerIfPresent();
    const method = opts.method ?? 'POST';
    // The provider exchange itself is the counted unit: under an execution
    // scope this funnels through the admission gateway (reserve -> send ->
    // acknowledge; AbortSignal-owned cancellation); outside a scope it keeps
    // the legacy fixed 30s timeout. A documented business rejection is still a
    // completed exchange — typed so the gateway records BUSINESS_FAILURE
    // without poisoning the execution, while transport failures stop it.
    const json = await this.executionSend<Record<string, unknown>>(opts.executionKind ?? 'BUSINESS', async (signal, _deadlineMs, base) => {
      let url = `${base}${path}`;
      if (opts.query && Object.keys(opts.query).length) {
        url += `?${new URLSearchParams(opts.query).toString()}`;
      }
      this.log.debug(`${method} ${url}`);
      const res = await fetch(url, {
        signal,
        method,
        headers: {
          'Content-Type': 'application/json',
          appKey: this.appKey,
          appSecret: this.appSecret,
          openToken: token,
        },
        ...(method === 'POST' ? { body: JSON.stringify(opts.body ?? {}) } : {}),
      });
      const payload = await res.json() as Record<string, unknown>;
      const businessFailure = getChanjetBusinessFailure(payload);
      if (!res.ok || businessFailure) {
        const failure = businessFailure || {
          code: `HTTP_${res.status}`,
          message: res.statusText || '好业财 HTTP 请求失败',
          requestId: String(payload.requestId || payload.request_id || ''),
        };
        throw new ChanjetBusinessFailureError(
          { httpStatus: res.status, failure, payload },
          `好业财 API 失败 path=${path} http=${res.status} code=${String(failure.code).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32)}`,
        );
      }
      return payload;
    });

    // 50107 = openToken 已失效(被 resend 作废 / 过期),清缓存重换重试一次。
    // Inside an execution scope the retry is a NEW admission-counted send and
    // stays within the same cap and deadline.
    const code = (json.code ?? (json.error as Record<string, unknown>)?.code) as string | undefined;
    if (!isRetry && code === '50107') {
      this.log.warn(`callApi 50107 token 失效,清缓存重试 path=${path}`);
      this.tokenCache.delete(opts.orgId || this.orgId);
      return this.executeCallApi<T>(path, opts, true);
    }

    return json as T;
  }

  private readCacheKey(path: string, opts: ChanjetCallOptions): string {
    return JSON.stringify([
      opts.orgId || this.orgId,
      opts.method || 'POST',
      path,
      opts.query || {},
      opts.body || {},
    ]);
  }

  private storeReadCache(key: string, value: unknown): void {
    const ttlMs = this.positiveInt('CHANJET_READ_CACHE_TTL_MS', 30_000);
    const maxEntries = this.positiveInt('CHANJET_READ_CACHE_MAX_ENTRIES', 500);
    this.readCache.set(key, { expiresAt: Date.now() + ttlMs, value });
    while (this.readCache.size > maxEntries) {
      const oldestKey = this.readCache.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.readCache.delete(oldestKey);
    }
  }

  private inferCallKind(path: string): ChanjetCallKind {
    return /\/(?:add|update|remove|delete|batchUpsert)(?:\/|$)/i.test(path)
      ? 'WRITE'
      : 'READ';
  }

  /**
   * Provider-side traffic is billed even when a request fails. Keep one
   * process-wide queue so scheduled sync, manual probes and writeback cannot
   * create a burst against the same appKey.
   */
  private async waitForTrafficSlot(): Promise<void> {
    const configured = Number(this.cfg.get('CHANJET_MIN_REQUEST_INTERVAL_MS', '250'));
    const intervalMs = Number.isFinite(configured) ? Math.max(configured, 100) : 250;
    const previous = this.trafficQueue;
    let release!: () => void;
    this.trafficQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, intervalMs);
      });
    } finally {
      release();
    }
  }

  /**
   * Durable local safety budget. Defaults intentionally stay below the
   * provider's 30,000/month free allowance, leaving room for callbacks,
   * operator diagnostics and traffic recorded before this guard was deployed.
   */
  private async reserveTrafficBudget(kind: ChanjetCallKind, path: string): Promise<void> {
    const manager = (this.stateRepo as unknown as {
      manager?: { transaction?: <T>(fn: (tx: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> }) => Promise<T>) => Promise<T> };
    }).manager;
    if (!manager?.transaction) return;

    // Provider quota is operated in China Standard Time. Build the durable
    // budget keys in the same timezone so midnight does not split one day.
    const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const monthKey = `M:${now.toISOString().slice(0, 7)}`;
    const dayKey = `D:${now.toISOString().slice(0, 10)}`;
    const readKey = `R:${now.toISOString().slice(0, 10)}`;
    const writeKey = `W:${now.toISOString().slice(0, 10)}`;
    const monthLimit = this.positiveInt('CHANJET_MONTHLY_LOCAL_BUDGET', 20_000);
    const dayLimit = this.positiveInt('CHANJET_DAILY_LOCAL_BUDGET', 650);
    const readLimit = Math.min(
      dayLimit,
      this.positiveInt('CHANJET_DAILY_READ_BUDGET', 620),
    );
    const writeLimit = this.positiveInt('CHANJET_DAILY_WRITE_BUDGET', 20);

    const reserve = async (
      tx: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> },
      key: string,
      limit: number,
    ) => {
      const rows = await tx.query(
        `INSERT INTO sys_chanjet_api_budget (budget_key, request_count, updated_at)
         VALUES ($1, 1, NOW())
         ON CONFLICT (budget_key) DO UPDATE
           SET request_count = sys_chanjet_api_budget.request_count + 1,
               updated_at = NOW()
         WHERE sys_chanjet_api_budget.request_count < $2
         RETURNING request_count`,
        [key, limit],
      );
      if (!rows.length) {
        throw new Error(
          `CHANJET_LOCAL_BUDGET_EXHAUSTED key=${key} limit=${limit} kind=${kind} path=${path}`,
        );
      }
    };

    await manager.transaction(async (tx) => {
      await reserve(tx, monthKey, monthLimit);
      await reserve(tx, dayKey, dayLimit);
      if (kind === 'READ') {
        await reserve(tx, readKey, readLimit);
      } else {
        await reserve(tx, writeKey, writeLimit);
      }
    });
  }

  private positiveInt(key: string, fallback: number): number {
    const value = Number(this.cfg.get(key, String(fallback)));
    return Number.isInteger(value) && value > 0 ? value : fallback;
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

  /**
   * 查询好业财应收统计表(凤凰鸡场应收总账数据源)。
   * 接口: GET /accounting/gl/statistics/receive/{bookid}
   *
   * 已知 3 个账套 bookid:
   *   3533914511118750 — 老挝凤凰农业发展有限公司
   *   3537748712226818 — 老挝东鹏县星驰农业发展有限公司
   *   3539743721526654 — 老挝凤凰食品集团有限公司
   *
   * @param bookid 账套 ID(tenant.id)
   * @param opts   可选 query 参数(透传,字段名见好业财接口文档:
   *               常见 startDate/endDate/partyCategory/department 等)
   */
  async getArStatistics(bookid: string, opts: Record<string, string> = {}): Promise<unknown> {
    const path = `/accounting/gl/statistics/receive/${bookid}`;
    return this.callApi(path, {
      method: 'GET',
      query: opts,
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
      appKeyConfigured: !!this.appKey,
      orgId: this.orgId || '(空)',
      hasAppTicket: !!this.appTicket,
      hasCert: !!this.cert,
      tokens,
      trafficPolicy: {
        minRequestIntervalMs: this.positiveInt('CHANJET_MIN_REQUEST_INTERVAL_MS', 250),
        monthlyLocalBudget: this.positiveInt('CHANJET_MONTHLY_LOCAL_BUDGET', 20_000),
        dailyLocalBudget: this.positiveInt('CHANJET_DAILY_LOCAL_BUDGET', 650),
        dailyReadBudget: Math.min(
          this.positiveInt('CHANJET_DAILY_LOCAL_BUDGET', 650),
          this.positiveInt('CHANJET_DAILY_READ_BUDGET', 620),
        ),
        dailyWriteBudget: this.positiveInt('CHANJET_DAILY_WRITE_BUDGET', 20),
        readCacheTtlMs: this.positiveInt('CHANJET_READ_CACHE_TTL_MS', 30_000),
        readCacheMaxEntries: this.positiveInt('CHANJET_READ_CACHE_MAX_ENTRIES', 500),
      },
    };
  }
}
