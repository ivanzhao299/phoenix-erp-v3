import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy account-state enforcement', () => {
  const payload = {
    sub: 42,
    username: 'operator',
    roles: ['ROLE_OPERATOR'],
    permissions: ['MENU_WMS_VIEW:V'],
    perms_version: 3,
  };

  function strategyWithQuery(query: jest.Mock): JwtStrategy {
    const strategy = Object.create(JwtStrategy.prototype) as JwtStrategy;
    (strategy as any).em = { query };
    return strategy;
  }

  it('fails closed when the account-state lookup is unavailable', async () => {
    const strategy = strategyWithQuery(jest.fn().mockRejectedValue(new Error('database unavailable')));

    await expect(strategy.validate(payload)).rejects.toEqual(
      expect.objectContaining({
        response: expect.objectContaining({
          subcode: 'INVALID_TOKEN',
        }),
      }),
    );
  });

  it('still returns claims when the account is active and the version matches', async () => {
    const strategy = strategyWithQuery(jest.fn().mockResolvedValue([{ status: 1, perms_version: 3 }]));

    await expect(strategy.validate(payload)).resolves.toMatchObject({
      userId: 42,
      username: 'operator',
      roles: ['ROLE_OPERATOR'],
    });
  });

  it('preserves explicit authentication denials from the account lookup', async () => {
    const strategy = strategyWithQuery(jest.fn().mockResolvedValue([{ status: 0, perms_version: 3 }]));

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
