export type LoginSubject = {
  role?: string | null;
  roles?: string[] | null;
  permissions?: string[] | null;
};

export function isSafeInternalReturn(value: string | null | undefined): value is string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return false;
  try {
    const parsed = new URL(value, 'https://phoenix.invalid');
    return parsed.origin === 'https://phoenix.invalid' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function hasAdminRole(subject: LoginSubject): boolean {
  const roles = Array.isArray(subject.roles) ? subject.roles : (subject.role ? [subject.role] : []);
  return roles.includes('ROLE_ADMIN') || roles.includes('ROLE_SYSOPS')
    || subject.permissions?.includes('*') === true;
}

function hasMenuView(subject: LoginSubject, menuCode: string): boolean {
  if (hasAdminRole(subject)) return true;
  const entry = subject.permissions?.find((permission) => permission.startsWith(`${menuCode}:`));
  return entry?.split(':')[1]?.split(',').includes('V') === true;
}

/** Mirrors middleware's current route-level authorization without weakening page/API guards. */
export function canAccessLoginReturn(path: string, subject: LoginSubject): boolean {
  if (!isSafeInternalReturn(path)) return false;
  const pathname = new URL(path, 'https://phoenix.invalid').pathname;
  if (pathname === '/settings/system-init' || pathname.startsWith('/settings/system-init/')
    || pathname === '/settings/security' || pathname.startsWith('/settings/security/')) {
    return hasAdminRole(subject);
  }
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
    return hasMenuView(subject, 'MENU_DASHBOARD');
  }
  // /terminal currently requires authentication only. Action-level MENU_* checks remain on each page.
  return true;
}

export function resolveLoginDestination(args: {
  returnPath?: string | null;
  subject: LoginSubject;
  roleFallback: string;
}): string {
  return args.returnPath && canAccessLoginReturn(args.returnPath, args.subject)
    ? args.returnPath
    : args.roleFallback;
}
