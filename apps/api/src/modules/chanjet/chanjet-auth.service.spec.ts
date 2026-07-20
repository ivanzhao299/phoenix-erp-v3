import { getChanjetBusinessFailure } from './chanjet-auth.service';

describe('Chanjet business response guard', () => {
  it('rejects HTTP-200 business failure envelopes', () => {
    expect(getChanjetBusinessFailure({
      success: 'false',
      code: 'pub.e9002',
      msg: '参数不合法',
      data: null,
      requestId: 'REQ-1',
    })).toEqual({
      code: 'pub.e9002',
      message: '参数不合法',
      requestId: 'REQ-1',
    });
  });

  it('accepts successful response envelopes and ordinary entity rows', () => {
    expect(getChanjetBusinessFailure({ success: 'true', code: '200', data: [] })).toBeNull();
    expect(getChanjetBusinessFailure({ code: '1001', name: '现金账户', balance: 10 })).toBeNull();
  });
});
