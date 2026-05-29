/**
 * Next.js Edge Middleware — 路由权限守卫
 *
 * 守卫策略:
 *   1. (admin)/* 路由 → 必须携带有效 JWT；无 Token 直接重定向到 /login
 *   2. (terminal)/* 路由 → 必须携带有效 JWT（包装终端专属用户）
 *   3. /login / /mobile/login → 若已登录则跳走（防重复登录）
 *   4. Token 过期判断在 Edge Runtime 中只做简单时间戳检查（无法调用 crypto 做签名验证）
 *      真正的签名校验在 API 侧的 JwtAuthGuard 完成
 *
 * 注意: Edge Runtime 不支持 Node.js API，只用标准 Web API
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** 从 sessionStorage 无法在服务端读取，改用 cookie（login 页面写入）*/
const TOKEN_COOKIE = 'phoenix_access_token';

/** 不需要守卫的公共路由前缀 */
const PUBLIC_PREFIXES = [
  '/login',
  '/mobile/login',
  '/api/',
  '/_next/',
  '/favicon',
  '/icons/',
  '/manifest',
];

/** 需要登录才能访问的路由前缀（admin + terminal + mobile） */
const GUARDED_PREFIXES = [
  '/dashboard',
  '/breeding',
  '/packaging',
  '/warehouse',
  '/transport',
  '/store',
  '/quality',
  '/procurement',
  '/order',
  '/members',
  '/finance',
  '/analytics',
  '/b2b',
  '/wholesale',
  '/master',
  '/settings',
  '/approval',
  '/farm',
  '/terminal',
  '/mobile',
];

/** 超级管理员专属路由（需要 ROLE_ADMIN 或 ROLE_SYSOPS） */
const ADMIN_ONLY_PREFIXES = [
  '/settings/system-init',
  '/settings/security',
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(p => pathname.startsWith(p));
}

function isGuarded(pathname: string): boolean {
  return GUARDED_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'));
}

function isAdminOnly(pathname: string): boolean {
  return ADMIN_ONLY_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'));
}

/** 简单解析 JWT payload（无签名验证，仅读取声明） */
function parseJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // atob 在 Edge Runtime 中可用
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

/** 检测是否移动端设备（Edge Runtime 中通过 User-Agent 判断） */
function isMobileDevice(request: NextRequest): boolean {
  const ua = request.headers.get('user-agent') ?? '';
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. 移动端分流（必须在 isPublic 之前，否则 /login 会被提前放行）
  if (pathname === '/') {
    const token = request.cookies.get(TOKEN_COOKIE)?.value;
    if (isMobileDevice(request)) {
      const dest = token ? '/mobile/home' : '/mobile/login';
      return NextResponse.redirect(new URL(dest, request.url));
    }
    const dest = token ? '/dashboard' : '/login';
    return NextResponse.redirect(new URL(dest, request.url));
  }

  // 1b. /login 从移动端访问 → 跳移动登录页
  if (pathname === '/login' && isMobileDevice(request)) {
    const loginUrl = new URL('/mobile/login', request.url);
    const ret = request.nextUrl.searchParams.get('return');
    if (ret) loginUrl.searchParams.set('return', ret);
    return NextResponse.redirect(loginUrl);
  }

  // 2. 公共路由放行
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // 3. 守卫路由：移动端未登录直接打开 PC 路由 → 引导到移动登录
  if (!isGuarded(pathname)) {
    return NextResponse.next();
  }

  // ── 从 cookie 读取 Token ─────────────────────────────────────────
  const token = request.cookies.get(TOKEN_COOKIE)?.value;

  const loginBase = pathname.startsWith('/mobile') ? '/mobile/login' : '/login';

  if (!token) {
    // 无 Token → 重定向到登录页，附带 returnUrl
    const loginUrl = new URL(loginBase, request.url);
    loginUrl.searchParams.set('return', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 4. 解析 JWT（不做签名验证；API 层负责签名校验）
  const payload = parseJwtPayload(token);

  if (!payload) {
    const loginUrl = new URL(loginBase, request.url);
    loginUrl.searchParams.set('return', pathname);
    loginUrl.searchParams.set('reason', 'expired');
    return NextResponse.redirect(loginUrl);
  }

  // 5. Token 过期检查（含 10s 时钟偏差宽容）
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp + 10 < now) {
    const loginUrl = new URL(loginBase, request.url);
    loginUrl.searchParams.set('return', pathname);
    loginUrl.searchParams.set('reason', 'expired');
    return NextResponse.redirect(loginUrl);
  }

  // 6. 超管专属路由检查
  if (isAdminOnly(pathname)) {
    const roles: string[] = Array.isArray(payload.roles) ? payload.roles : (payload.role ? [payload.role] : []);
    const isAdmin = roles.includes('ROLE_ADMIN') || roles.includes('ROLE_SYSOPS');
    if (!isAdmin) {
      // 无权限 → 重定向到 dashboard 并附带提示
      const dashUrl = new URL('/dashboard', request.url);
      dashUrl.searchParams.set('reason', 'forbidden');
      return NextResponse.redirect(dashUrl);
    }
  }

  // 7. 在响应头中注入调试信息（仅开发环境）
  const response = NextResponse.next();
  if (process.env.NODE_ENV === 'development') {
    response.headers.set('X-Phoenix-User', payload.username ?? 'unknown');
    response.headers.set('X-Phoenix-Role', payload.role ?? '');
    response.headers.set('X-Phoenix-PermsVersion', String(payload.perms_version ?? 0));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * 匹配所有路径，排除:
     * - _next/static (静态文件)
     * - _next/image (图片优化)
     * - favicon.ico
     * - 以 . 结尾的静态资源 (js, css, png 等)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
};
