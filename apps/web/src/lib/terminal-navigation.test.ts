import { describe, expect, it } from 'vitest';
import { ADMIN_HOME_PATH, canReturnToAdmin } from './terminal-navigation';

describe('terminal admin return navigation', () => {
  it('shows the return action when dashboard view permission is present', () => {
    expect(canReturnToAdmin((menu, perm) => menu === 'MENU_DASHBOARD' && perm === 'V')).toBe(true);
    expect(ADMIN_HOME_PATH).toBe('/dashboard');
  });

  it('hides the return action from a packaging-only terminal operator', () => {
    const permissions = new Set(['MENU_PKG_OP:V']);
    expect(canReturnToAdmin((menu, perm) => permissions.has(`${menu}:${perm}`))).toBe(false);
  });
});
