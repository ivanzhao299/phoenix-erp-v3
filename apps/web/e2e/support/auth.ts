import type { Page } from '@playwright/test';

export type E2EUser = {
  username: string;
  name?: string;
  role: string;
  roles: string[];
  permissions: string[];
  sub?: string | number;
  store_code?: string;
};

/**
 * Creates the middleware-readable part of an isolated E2E session.
 * API-backed tests must use the real login endpoint; mocked UI tests only
 * need a current, structurally valid payload so middleware does not treat a
 * fixture from a previous run as expired.
 */
export function makeE2EToken(user: E2EUser): string {
  // CI may inject a short-lived token minted by the isolated API with its current JWT_SECRET.
  // The fallback is intentionally only for mocked UI routes, where the API is intercepted.
  if (process.env.E2E_AUTH_TOKEN) return process.env.E2E_AUTH_TOKEN;
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: user.sub ?? user.username,
    username: user.username,
    real_name: user.name ?? user.username,
    store_code: user.store_code ?? 'ALL',
    locale: 'zh-CN',
    role: user.role,
    roles: user.roles,
    permissions: user.permissions,
    perms_version: 1,
    iat: now,
    exp: now + 60 * 60,
  })).toString('base64url');
  return `e30.${payload}.e2e`;
}

export async function authenticateMockPage(page: Page, user: E2EUser, lang = 'zh') {
  const token = makeE2EToken(user);
  await page.context().addCookies([{
    name: 'phoenix_access_token', value: token,
    url: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000',
  }]);
  await page.addInitScript(({ authToken, authUser, language }) => {
    sessionStorage.setItem('phoenix_session_version', 'v6');
    sessionStorage.setItem('phoenix_token', authToken);
    sessionStorage.setItem('phoenix_user', JSON.stringify(authUser));
    localStorage.setItem('phoenix_token', authToken);
    localStorage.setItem('phoenix_user', JSON.stringify(authUser));
    localStorage.setItem('phoenix_lang', language);
  }, { authToken: token, authUser: user, language: lang });
  return token;
}
