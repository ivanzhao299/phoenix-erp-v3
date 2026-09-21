/** @vitest-environment jsdom */

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ user: {} as Record<string, unknown> }));
vi.mock('@/contexts/AuthContext', async importOriginal => {
  const original = await importOriginal<typeof import('@/contexts/AuthContext')>();
  return { ...original, useAuth: () => ({ user: auth.user }) };
});

import { usePermission } from './usePermission';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function payloadToken(payload: Record<string, unknown>) {
  return `e30.${btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.test`;
}

function Probe() {
  const { canCreate, canEdit, canDelete } = usePermission('MENU_STORE_POS');
  return createElement('output', null, JSON.stringify({ canCreate, canEdit, canDelete }));
}

describe('store POS ordinary-role permissions', () => {
  let host: HTMLDivElement | undefined;

  afterEach(() => {
    host?.remove();
    host = undefined;
  });

  it('uses menu-aware permissions from an amei-style non-admin JWT', async () => {
    const token = payloadToken({
      sub: 8,
      username: 'amei',
      role: 'ROLE_STORE_MGR',
      roles: ['ROLE_CASHIER', 'ROLE_STORE_MGR'],
      permissions: ['MENU_STORE_POS:V,C,E'],
    });
    auth.user = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => root.render(createElement(Probe)));

    expect(host.textContent).toBe(JSON.stringify({ canCreate: true, canEdit: true, canDelete: false }));
    await act(async () => root.unmount());
  });
});
