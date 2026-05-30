'use client';
/**
 * AuthFetchInterceptor
 * ====================
 * 在 AdminLayout 中挂载，monkey-patch window.fetch，拦截所有 /api/* 的 401 响应。
 * 任何页面直接使用原生 fetch("/api/...") 时，若服务端返回 401，
 * 自动派发 'api:auth-expired' 事件，由 AuthContext 统一跳转至登录页。
 *
 * 注意：
 *   - 只拦截路径以 /api 开头的请求
 *   - 使用 ONCE 标志防止重复安装
 *   - 模块级防抖：3 秒内多个并发 401 只派发一次事件，防止多页同时请求时刷屏
 *   - 不影响非 API 请求（Next.js 内部 chunk 等）
 */
import { useEffect } from 'react';

const INSTALLED_KEY = '__phx_fetch_interceptor_installed__';
// 模块级防抖：多个并发 401 在 3s 内只触发一次 api:auth-expired 事件
let _lastDispatchMs = 0;
const DISPATCH_COOLDOWN_MS = 3_000;

export function AuthFetchInterceptor() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // 防止重复安装
    if ((window as typeof window & { [key: string]: unknown })[INSTALLED_KEY]) return;
    (window as typeof window & { [key: string]: unknown })[INSTALLED_KEY] = true;

    const _origFetch = window.fetch.bind(window);

    window.fetch = async function patchedFetch(
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      const res = await _origFetch(input, init);

      // 只处理 /api/* 路径的 401
      const url = typeof input === 'string' ? input
               : input instanceof URL       ? input.pathname
               : input instanceof Request   ? input.url
               : '';
      const path = typeof url === 'string' ? url : (url as URL).pathname;

      if (res.status === 401 && path.startsWith('/api')) {
        const now = Date.now();
        // 防抖：3s 内只派发一次，避免 N 个并发请求同时返回 401 时连续触发
        if (now - _lastDispatchMs > DISPATCH_COOLDOWN_MS) {
          _lastDispatchMs = now;
          // 读取 subcode（如有），不消耗 body（clone 一份读）
          let reason: 'expired' | 'perms_changed' = 'expired';
          try {
            const body = await res.clone().json() as { subcode?: string };
            if (body.subcode === 'PERMS_CHANGED') reason = 'perms_changed';
          } catch { /* ignore parse error */ }

          window.dispatchEvent(
            new CustomEvent('api:auth-expired', { detail: { reason } })
          );
        }
      }

      return res;
    };

    return () => {
      // 卸载时恢复原始 fetch（StrictMode 双渲染安全）
      delete (window as typeof window & { [key: string]: unknown })[INSTALLED_KEY];
      window.fetch = _origFetch;
    };
  }, []);

  return null; // 纯逻辑，不渲染任何 DOM
}
