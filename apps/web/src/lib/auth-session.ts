const ACCESS_TOKEN_KEY = 'phoenix_token';
const COOKIE_TOKEN_KEY = 'phoenix_cookie_token';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function jwtExpiresInSeconds(token: string, nowSeconds = Math.floor(Date.now() / 1000)): number | null {
  try {
    const segment = token.split('.')[1];
    if (!segment) return null;
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof payload.exp === 'number' ? Math.max(0, payload.exp - nowSeconds) : null;
  } catch {
    return null;
  }
}

export function buildAccessTokenCookie(token: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const maxAge = jwtExpiresInSeconds(token, nowSeconds) ?? 86400;
  return `phoenix_access_token=${token}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export function persistRefreshedSession(args: {
  accessToken: string;
  cookieToken: string;
  session: StorageLike;
  local: StorageLike;
  writeCookie: (cookie: string) => void;
  nowSeconds?: number;
}): void {
  const { accessToken, cookieToken, session, local, writeCookie, nowSeconds } = args;
  session.setItem(ACCESS_TOKEN_KEY, accessToken);
  local.setItem(ACCESS_TOKEN_KEY, accessToken);
  session.setItem(COOKIE_TOKEN_KEY, cookieToken);
  local.setItem(COOKIE_TOKEN_KEY, cookieToken);
  writeCookie(buildAccessTokenCookie(cookieToken, nowSeconds));
}

type RefreshResponse = { code?: number; token?: string };

async function requestRefresh(apiBase: string, token: string): Promise<string | null> {
  const response = await fetch(`${apiBase}/api/auth/refresh`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null) as RefreshResponse | null;
  return data?.code === 200 && data.token ? data.token : null;
}

/** Refreshes API and slim middleware tokens together, then commits all browser stores atomically. */
export async function refreshAndPersistSession(currentToken: string, apiBase = ''): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const currentCookieToken = sessionStorage.getItem(COOKIE_TOKEN_KEY)
    || localStorage.getItem(COOKIE_TOKEN_KEY)
    || currentToken;
  const [accessToken, cookieToken] = await Promise.all([
    requestRefresh(apiBase, currentToken),
    currentCookieToken === currentToken ? Promise.resolve(null) : requestRefresh(apiBase, currentCookieToken),
  ]);
  if (!accessToken) return null;
  const nextCookieToken = currentCookieToken === currentToken ? accessToken : cookieToken;
  if (!nextCookieToken) return null;
  persistRefreshedSession({
    accessToken, cookieToken: nextCookieToken, session: sessionStorage, local: localStorage,
    writeCookie: (cookie) => { document.cookie = cookie; },
  });
  return accessToken;
}
