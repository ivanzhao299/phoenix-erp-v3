/**
 * Phoenix ERP V3 — API Client
 * 所有请求经 Next.js rewrites 代理到 NestJS 后端 (3100)
 */

import type { CrudListResponse, PaginationParams } from "@/types";

const API_BASE = "/api";

// ── Token 管理 ──────────────────────────────────────────────
function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    // ✅ 优先读取 phoenix_token（AuthContext 的存储方式）
    const direct = sessionStorage.getItem("phoenix_token");
    if (direct) return direct;
    // 兜底：兼容旧版存储方式（phoenix_user.token）
    const user = JSON.parse(sessionStorage.getItem("phoenix_user") || "null");
    return user?.token ?? null;
  } catch {
    return null;
  }
}

function setToken(t: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem("phoenix_token", t);
}

// ── 静默 Refresh —— 当 token 剩余时间 < REFRESH_THRESHOLD 时主动续期 ───────
// 用户全程无感：每次 API 调用前都顺路检查；并发请求共享同一次 refresh
const REFRESH_THRESHOLD_SEC = 30 * 60;   // 剩余 <30min 即续期
let refreshPromise: Promise<string | null> | null = null;

function decodeExp(t: string): number | null {
  try {
    const payload = t.split('.')[1];
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? json.exp : null;
  } catch { return null; }
}

async function tryRefresh(currentToken: string): Promise<string | null> {
  // 多个并发请求只发一次 refresh
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const r = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentToken}` },
      });
      if (!r.ok) return null;
      const j = await r.json().catch(() => null) as { token?: string } | null;
      if (j?.token) { setToken(j.token); return j.token; }
      return null;
    } catch { return null; }
    finally {
      // 留一段冷却窗口避免风暴
      setTimeout(() => { refreshPromise = null; }, 1500);
    }
  })();
  return refreshPromise;
}

async function ensureFreshToken(): Promise<void> {
  const t = getToken();
  if (!t) return;
  const exp = decodeExp(t);
  if (!exp) return;
  const remaining = exp - Math.floor(Date.now() / 1000);
  if (remaining > 0 && remaining < REFRESH_THRESHOLD_SEC) {
    await tryRefresh(t);
  }
}

// ── 基础请求封装 ─────────────────────────────────────────────
// 韧性策略（生产稳定性兜底）：
//   - 401:   重试 1 次（网络抖动 / 后端冷启等"伪 401"），仍失败则抛
//   - 5xx:   指数退避 800ms / 2000ms，共 3 次
//   - 网络错误 (fetch reject)：等同 5xx 处理
//   - 其它 4xx（403/404 等业务错误）：不重试，直接抛
//
// 401 真失败 → 抛带 code='AUTH_EXPIRED' 的 Error，由全局 hook
// (window 'api:auth-expired' event) 接管跳转 + 友好提示
const RETRY_DELAYS_MS = [800, 2000];   // 5xx 重试时序
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type AuthSubcode = 'NO_TOKEN' | 'TOKEN_EXPIRED' | 'INVALID_TOKEN' | 'PERMS_CHANGED';
export interface ApiError extends Error {
  status?: number;
  code?: 'AUTH_EXPIRED' | 'SERVER' | 'NETWORK';
  subcode?: AuthSubcode;
}

function makeError(message: string, status?: number, code?: ApiError['code'], subcode?: AuthSubcode): ApiError {
  const e = new Error(message) as ApiError;
  e.status = status; e.code = code; e.subcode = subcode;
  return e;
}

async function rawFetch(path: string, options: RequestInit, attempt: number, max5xxRetries: number, signal?: AbortSignal): Promise<Response> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  try {
    return await fetch(`${API_BASE}${path}`, { ...options, headers, signal });
  } catch (netErr: any) {
    if (netErr?.name === 'AbortError') throw netErr; // propagate immediately — no retry
    // 网络层失败按 5xx 处理
    if (attempt < max5xxRetries) {
      await sleep(RETRY_DELAYS_MS[attempt] ?? 2000);
      return rawFetch(path, options, attempt + 1, max5xxRetries, signal);
    }
    throw makeError((netErr as Error).message || '网络连接失败，请检查网络后重试', undefined, 'NETWORK');
  }
}

async function request<T = unknown>(
  path: string,
  options: RequestInit & { signal?: AbortSignal } = {}
): Promise<T> {
  const { signal, ...fetchOptions } = options;
  // 主动静默 refresh：若 token 即将到期就先续期再发请求（用户全程无感）
  // 跳过 refresh 端点自身避免递归
  if (!path.startsWith('/auth/refresh')) {
    await ensureFreshToken();
  }

  let res = await rawFetch(path, fetchOptions, 0, 2, signal);

  // 收到 TOKEN_EXPIRED → 兜底再 refresh 一次重试（处理"刚好卡在边界过期"的场景）
  if (res.status === 401 && !path.startsWith('/auth/refresh')) {
    const body = await res.clone().json().catch(() => ({})) as { subcode?: AuthSubcode };
    if (body.subcode === 'TOKEN_EXPIRED') {
      const current = getToken();
      if (current) {
        const newTok = await tryRefresh(current);
        if (newTok) {
          // 用新 token 重发原请求
          res = await rawFetch(path, fetchOptions, 0, 2, signal);
        }
      }
    }
  }

  // 401 一次"伪 401"重试（网络抖动 / 后端 502 透传出 401 等）
  if (res.status === 401) {
    await sleep(800);
    res = await rawFetch(path, fetchOptions, 0, 2, signal);
  }

  // 5xx 指数退避
  let attempt = 0;
  while (res.status >= 500 && attempt < RETRY_DELAYS_MS.length) {
    await sleep(RETRY_DELAYS_MS[attempt]);
    res = await rawFetch(path, fetchOptions, 0, 2, signal);
    attempt++;
  }

  if (res.status === 401) {
    // 读取后端标准化 subcode
    const errBody = await res.json().catch(() => ({})) as { subcode?: AuthSubcode; message?: string };
    const subcode: AuthSubcode = errBody.subcode || 'INVALID_TOKEN';
    const message = errBody.message || '登录已过期，请重新登录';

    // 通知全局拦截器；reason 字段决定登录页提示文案
    if (typeof window !== 'undefined') {
      const reason = subcode === 'PERMS_CHANGED' ? 'perms_changed'
                   : subcode === 'TOKEN_EXPIRED' ? 'expired'
                   : 'expired';
      window.dispatchEvent(new CustomEvent('api:auth-expired', { detail: { subcode, reason } }));
    }
    throw makeError(message, 401, 'AUTH_EXPIRED', subcode);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw makeError(err?.message || `请求失败 (HTTP ${res.status})`, res.status, res.status >= 500 ? 'SERVER' : undefined);
  }

  return res.json();
}

// ── Auth ─────────────────────────────────────────────
export interface LoginResponse {
  code: number;
  token: string;
  user_info: {
    userId: number;
    username: string;
    realNameZh: string;
    role: string;
    permissions: string[];
    storeCode?: string;
    store_code?: string;
    locale?: string;
    sub: number;
  };
}

export const authApi = {
  login: (username: string, password: string) =>
    request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
};

// ── Generic CRUD ─────────────────────────────────────────────
export const crudApi = {
  list: <T = Record<string, unknown>>(
    table: string,
    params: PaginationParams = {},
    opts: { signal?: AbortSignal } = {}
  ): Promise<CrudListResponse<T>> => {
    const qs = new URLSearchParams();
    // 将 page/pageSize 转换为后端期望的 limit/offset
    const { page, pageSize, ...rest } = params as Record<string, unknown>;
    const _page = Number(page) || 1;
    const _size = Number(pageSize) || 20;
    qs.set("limit",  String(_size));
    qs.set("offset", String((_page - 1) * _size));
    Object.entries(rest).forEach(([k, v]) => {
      if (v !== undefined && v !== "") qs.set(k, String(v));
    });
    return request<CrudListResponse<T>>(
      `/crud/${table}?${qs.toString()}`,
      opts.signal ? { signal: opts.signal } : {}
    );
  },

  get: <T = Record<string, unknown>>(table: string, id: number) =>
    request<T>(`/crud/${table}/${id}`),

  create: <T = Record<string, unknown>>(
    table: string,
    data: Record<string, unknown>
  ) =>
    request<T>(`/crud/${table}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: <T = Record<string, unknown>>(
    table: string,
    id: number,
    data: Record<string, unknown>
  ) =>
    request<T>(`/crud/${table}/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (table: string, id: number) =>
    request(`/crud/${table}/${id}`, { method: "DELETE" }),
};

// ── 数据字典 ─────────────────────────────────────────────────
export const dictApi = {
  getByType: (dictType: string) =>
    crudApi.list("sys_dict", { dict_type: dictType, limit: 200 } as PaginationParams),
};

export default request;
