import { isDevLoginAllowedEnvironment } from './dev-login-policy';

describe('development login environment policy', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAppEnv = process.env.APP_ENV;

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalAppEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = originalAppEnv;
  });

  it.each(['local', 'development', 'test'])('allows %s profile', (profile) => {
    process.env.APP_ENV = profile;
    expect(isDevLoginAllowedEnvironment()).toBe(true);
  });

  it.each(['staging', 'uat', 'production'])('rejects %s profile', (profile) => {
    process.env.APP_ENV = profile;
    expect(isDevLoginAllowedEnvironment()).toBe(false);
  });
});
