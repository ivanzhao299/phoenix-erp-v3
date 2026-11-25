const ACCESS_TOKEN_KEY = 'phoenix_token';
const COOKIE_TOKEN_KEY = 'phoenix_cookie_token';

export const BROWSER_LOGIN_KEY = 'phoenix_login_id';
export const SHARED_LOGIN_KEY = 'phoenix_login_marker';

function signatureOf(token: string) {
  return token.split('.').at(2) ?? '';
}

export function sharedLoginId(token: string | null): string | null {
  if (!token) return null;
  const signature = signatureOf(token);
  if (!signature) return null;
  try {
    const marker = JSON.parse(localStorage.getItem(SHARED_LOGIN_KEY) ?? 'null') as {id:string;signature:string}|null;
    return marker?.signature === signature ? marker.id : null;
  } catch {
    return null;
  }
}

function writeSharedLogin(id: string, token: string) {
  localStorage.setItem(SHARED_LOGIN_KEY, JSON.stringify({id, signature:signatureOf(token)}));
}

export function markBrowserLogin(token: string) {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
  writeSharedLogin(id, token);
  sessionStorage.setItem(BROWSER_LOGIN_KEY, id);
  return id;
}

export function readBrowserLogin(token: string | null): string | null {
  if (typeof window === 'undefined' || !token || !signatureOf(token)) return null;
  if (localStorage.getItem(ACCESS_TOKEN_KEY) === token && sessionStorage.getItem(ACCESS_TOKEN_KEY) === token) {
    const shared = sharedLoginId(token);
    if (!shared) {
      return localStorage.getItem(SHARED_LOGIN_KEY) ? sessionStorage.getItem(BROWSER_LOGIN_KEY) : markBrowserLogin(token);
    }
    sessionStorage.setItem(BROWSER_LOGIN_KEY, shared);
    return shared;
  }
  return sessionStorage.getItem(BROWSER_LOGIN_KEY);
}

export function adoptSharedAccessToken(tabToken: string): string {
  const loginId = sessionStorage.getItem(BROWSER_LOGIN_KEY);
  const sharedToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!loginId || !sharedToken || sharedToken === tabToken || sharedLoginId(sharedToken) !== loginId) return tabToken;
  sessionStorage.setItem(ACCESS_TOKEN_KEY, sharedToken);
  const cookieToken = localStorage.getItem(COOKIE_TOKEN_KEY);
  if (cookieToken) sessionStorage.setItem(COOKIE_TOKEN_KEY, cookieToken);
  return sharedToken;
}

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

// Only successful refreshes can extend a bound request's credential lineage.
const rotations = new Map<string, string>();

export function isSameRefreshedSession(original: string, current: string): boolean {
  for (let token: string | undefined = original, hops = 0; token !== undefined && hops <= rotations.size;
    token = rotations.get(token), hops++) {
    if (token === current) return true;
  }
  return false;
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
  const sessionAccess=sessionStorage.getItem(ACCESS_TOKEN_KEY);
  const localAccess=localStorage.getItem(ACCESS_TOKEN_KEY);
  const sessionCookie=sessionStorage.getItem(COOKIE_TOKEN_KEY);
  const localCookie=localStorage.getItem(COOKIE_TOKEN_KEY);
  // The local token and middleware cookie belong to the active shared login.
  if (localAccess!==currentToken || (sessionAccess&&sessionAccess!==currentToken) ||
    (sessionCookie&&localCookie!==sessionCookie)) return null;
  const loginId = sharedLoginId(localAccess);
  const currentCookieToken=sessionCookie||localCookie||currentToken;
  const [accessToken, cookieToken] = await Promise.all([
    requestRefresh(apiBase, currentToken),
    currentCookieToken === currentToken ? Promise.resolve(null) : requestRefresh(apiBase, currentCookieToken),
  ]);
  if (!accessToken || sessionStorage.getItem(ACCESS_TOKEN_KEY)!==sessionAccess || localStorage.getItem(ACCESS_TOKEN_KEY)!==localAccess ||
    sessionStorage.getItem(COOKIE_TOKEN_KEY)!==sessionCookie || localStorage.getItem(COOKIE_TOKEN_KEY)!==localCookie ||
    sharedLoginId(localAccess)!==loginId) return null;
  const nextCookieToken = currentCookieToken === currentToken ? accessToken : cookieToken;
  if (!nextCookieToken) return null;
  if (loginId) writeSharedLogin(loginId, accessToken);
  persistRefreshedSession({
    accessToken, cookieToken: nextCookieToken, session: sessionStorage, local: localStorage,
    writeCookie: (cookie) => { document.cookie = cookie; },
  });
  if (accessToken !== currentToken) {
    rotations.set(currentToken, accessToken);
    if (rotations.size > 8) {
      const oldest = rotations.keys().next().value;
      if (oldest !== undefined) rotations.delete(oldest);
    }
  }
  return accessToken;
}
