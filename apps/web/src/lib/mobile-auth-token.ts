/**
 * mobile-auth-token.ts — 移动端统一 Token 读取工具
 *
 * 优先级：sessionStorage.phoenix_token
 *        → localStorage.phoenix_token
 *        → localStorage.auth_user.token（兼容旧格式，最后 fallback）
 *
 * 所有移动端 workflow / approval / notification API 调用必须使用此工具，
 * 不得再在各页面内部 inline 实现 Token 读取逻辑。
 */
export function getMobileToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (
      sessionStorage.getItem('phoenix_token') ||
      localStorage.getItem('phoenix_token') ||
      JSON.parse(localStorage.getItem('auth_user') || '{}').token ||
      ''
    );
  } catch {
    return '';
  }
}

/** 鉴权 Header，直接用于 fetch options */
export function authHeader(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getMobileToken()}`,
  };
}
