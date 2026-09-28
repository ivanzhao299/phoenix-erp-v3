const LOCAL_PROFILES = new Set(['local', 'development', 'test']);

export function currentAppEnvironment(): string {
  return (process.env.APP_ENV || process.env.NODE_ENV || 'development').toLowerCase();
}

export function isDevLoginAllowedEnvironment(): boolean {
  return LOCAL_PROFILES.has(currentAppEnvironment());
}
