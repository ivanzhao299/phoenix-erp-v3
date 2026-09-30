import { UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { AuthExceptionFilter } from './auth-exception.filter';
import { AuthSubcodeGuard } from '../guards/auth-subcode.guard';

function render(request: Record<string, unknown>, exception: UnauthorizedException) {
  const json = jest.fn();
  const response = {
    status: jest.fn().mockReturnThis(),
    json,
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ headers: {}, ...request }),
      getResponse: () => response,
    }),
  } as never;

  new AuthExceptionFilter().catch(exception, host);
  return json.mock.calls[0][0] as { subcode: string; message: string };
}

describe('AuthExceptionFilter', () => {
  it('classifies a missing authorization header as NO_TOKEN', () => {
    expect(render({}, new UnauthorizedException()).subcode).toBe('NO_TOKEN');
  });

  it('classifies a malformed bearer token as INVALID_TOKEN', () => {
    expect(
      render({ headers: { authorization: 'Bearer malformed' } }, new UnauthorizedException()).subcode,
    ).toBe('INVALID_TOKEN');
  });

  it('preserves TOKEN_EXPIRED supplied by the verified Passport guard', () => {
    expect(
      render(
        { headers: { authorization: 'Bearer verified-expired-token' } },
        new UnauthorizedException({ subcode: 'TOKEN_EXPIRED', message: '登录已过期，请重新登录' }),
      ).subcode,
    ).toBe('TOKEN_EXPIRED');
  });

  it('preserves an explicit permission-change subcode', () => {
    const result = render(
      {},
      new UnauthorizedException({
        subcode: 'PERMS_CHANGED',
        message: '权限已变更，请重新登录',
      }),
    );

    expect(result).toEqual({
      statusCode: 401,
      subcode: 'PERMS_CHANGED',
      message: '权限已变更，请重新登录',
      error: 'Unauthorized',
    });
  });
});

describe('AuthSubcodeGuard', () => {
  const context = (headers: Record<string, string>) => ({
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  }) as never;

  it('maps Passport TokenExpiredError to TOKEN_EXPIRED', () => {
    const token = jwt.sign({ sub: '1', username: 'expired-user' }, 'unit-test-secret', { expiresIn: -60 });
    let info: { name?: string } | undefined;
    try {
      jwt.verify(token, 'unit-test-secret');
    } catch (error) {
      info = error as { name?: string };
    }

    expect(() => new AuthSubcodeGuard().handleRequest(null, null, info, context({ authorization: `Bearer ${token}` }))).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ subcode: 'TOKEN_EXPIRED' }) }),
    );
  });
});
