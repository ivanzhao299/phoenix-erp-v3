import { UnauthorizedException } from '@nestjs/common';
import { AuthExceptionFilter } from './auth-exception.filter';

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

  it('classifies an expired bearer token as TOKEN_EXPIRED', () => {
    const payload = Buffer.from(
      JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 60 }),
    ).toString('base64url');
    const token = `eyJhbGciOiJub25lIn0.${payload}.signature`;

    expect(
      render({ headers: { authorization: `Bearer ${token}` } }, new UnauthorizedException()).subcode,
    ).toBe('TOKEN_EXPIRED');
  });

  it('classifies a malformed bearer token as INVALID_TOKEN', () => {
    expect(
      render({ headers: { authorization: 'Bearer malformed' } }, new UnauthorizedException()).subcode,
    ).toBe('INVALID_TOKEN');
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
