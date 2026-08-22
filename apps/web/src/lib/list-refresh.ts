'use client';

import { useEffect } from 'react';

export interface ReplaceRouter {
  replace(href: string): void;
}

export function withRefreshToken(listPath: string, token = `${Date.now()}-${Math.random().toString(36).slice(2)}`): string {
  const url = new URL(listPath, 'https://phoenix.local');
  url.searchParams.set('_refresh', token);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function withoutRefreshToken(path: string): string {
  const url = new URL(path, 'https://phoenix.local');
  url.searchParams.delete('_refresh');
  return `${url.pathname}${url.search}${url.hash}`;
}

export function saveAndReturn(listPath: string, router: ReplaceRouter): void {
  router.replace(withRefreshToken(listPath));
}

/** Run a list load once on mount, then consume the one-shot URL marker. */
export function useRefreshToken(load: () => void | Promise<void>): void {
  useEffect(() => {
    void load();
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (new URLSearchParams(window.location.search).has('_refresh')) {
      window.history.replaceState(window.history.state, '', withoutRefreshToken(current));
    }
  }, [load]);
}
