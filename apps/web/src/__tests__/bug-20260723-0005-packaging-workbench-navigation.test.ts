import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const packagingPage = readFileSync(
  join(process.cwd(), 'src/app/(admin)/packaging/page.tsx'),
  'utf8',
);
const sidebar = readFileSync(
  join(process.cwd(), 'src/components/layout/Sidebar.tsx'),
  'utf8',
);
const terminalDashboard = readFileSync(
  join(process.cwd(), 'src/app/(terminal)/terminal/packaging/dashboard/page.tsx'),
  'utf8',
);

describe('BUG-20260723-0005 packaging workbench navigation', () => {
  it('routes the packaging page action to the existing terminal dashboard safely', () => {
    expect(packagingPage).toMatch(
      /href="\/terminal\/packaging\/dashboard"/,
    );
    expect(packagingPage).not.toMatch(
      /href="\/terminal\/packaging\/dashboard"\s+target="_blank"/,
    );
    expect(terminalDashboard).toContain('export default function TerminalDashboard()');
  });

  it('routes the production sidebar action to the same terminal dashboard', () => {
    expect(sidebar).toMatch(
      /href="\/terminal\/packaging\/dashboard"/,
    );
    expect(sidebar).not.toMatch(
      /href="\/terminal\/packaging\/dashboard"\s+target="_blank"/,
    );
  });

  it('preserves packaging workbench visibility for operator and manager permissions', () => {
    const workbenchGate = sidebar.slice(
      sidebar.indexOf('id: "terminal-packaging"'),
      sidebar.indexOf('}) && (', sidebar.indexOf('id: "terminal-packaging"')),
    );

    expect(workbenchGate).toContain('perm: "MENU_PKG_OP"');
    expect(workbenchGate).toContain('altPerms: ["MENU_PKG_MGR"]');
  });
});
