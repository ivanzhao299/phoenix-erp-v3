import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('Store V1-5 retired UI contract', () => {
  it('redirects the old daily close page to the new settlement chain', () => {
    const page = read('app/(admin)/store/daily/page.tsx');
    expect(page).toContain("redirect('/store-settlement')");
    expect(page).not.toContain('crudApi');
    expect(page).not.toContain('daily_close');
  });

  it('removes the old daily-close menu and points the workstation card at settlement', () => {
    const sidebar = read('components/layout/Sidebar.tsx');
    const workstation = read('app/(admin)/store/page.tsx');
    expect(sidebar).not.toContain('s2-store-daily');
    expect(workstation).not.toContain('path: "/store/daily"');
    expect(workstation).toContain('path: "/store-settlement"');
  });

  it('redirects legacy receiving to the canonical replenishment/WMS flow', () => {
    const page = read('app/(admin)/store/receiving/page.tsx');
    const sidebar = read('components/layout/Sidebar.tsx');
    const workstation = read('app/(admin)/store/page.tsx');
    expect(page).toContain("redirect('/store/replenish')");
    expect(page).not.toContain('crudApi');
    expect(page).not.toContain('store_receiving');
    expect(sidebar).not.toContain('path: "/store/receiving"');
    expect(sidebar).toContain('path: "/store/replenish"');
    expect(workstation).not.toContain('path: "/store/receiving"');
    expect(workstation).toContain('path: "/store/replenish"');
  });
});
