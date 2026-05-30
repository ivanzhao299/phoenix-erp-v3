/**
 * auth-dispatch.ts
 * ================
 * 统一派发 api:auth-expired 事件的单入口。
 *
 * 背景：AuthFetchInterceptor（monkey-patch window.fetch）和 api-client.ts
 * 各自都会处理 401 响应并触发登录跳转。如果两者各自独立 dispatch，同一个
 * 401 请求会触发两次事件；多个并发请求更会产生大量事件，导致多次弹窗 / 重定向。
 *
 * 解决方案：所有 401 处理路径统一调用本函数，window 属性作为跨模块的唯一冷却锁。
 * 3 秒内无论多少路径调用，事件只派发一次。
 */

const COOLDOWN_MS = 3_000;
// 使用 window 属性而非模块变量，确保跨模块共享同一个时间戳
const TS_KEY = '__phx_auth_dispatch_ts__';

type W = typeof window & { [k: string]: unknown };

export function dispatchAuthExpired(reason: 'expired' | 'perms_changed' = 'expired'): void {
  if (typeof window === 'undefined') return;
  const w = window as W;
  const now = Date.now();
  const last = (w[TS_KEY] as number | undefined) ?? 0;
  if (now - last < COOLDOWN_MS) return;   // 冷却中，丢弃
  w[TS_KEY] = now;
  window.dispatchEvent(new CustomEvent('api:auth-expired', { detail: { reason } }));
}
