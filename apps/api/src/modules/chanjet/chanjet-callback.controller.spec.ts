import { ForbiddenException } from '@nestjs/common';
import { assertChanjetProxyReadonly } from './chanjet-callback.controller';

describe('Chanjet readonly proxy policy', () => {
  it.each([
    ['GET', '/accounting/openapi/cc/book/findByEnterpriseId'],
    ['GET', '/accounting/gl/glaccount/getInitBalanceLists/3533914511118750'],
    ['GET', '/accounting/gl/statistics/receive/3533914511118750'],
    ['POST', '/accounting/openapi/cc/department/list/3533914511118750'],
    ['POST', '/accounting/openapi/cc/party/custvendor/query/3533914511118750'],
    ['POST', '/accounting/openapi/cc/salesorder/list/3533914511118750'],
    ['POST', '/accounting/openapi/cc/purchasestockin/list/3533914511118750'],
    ['POST', '/accounting/openapi/cc/salesstockout/list/3533914511118750'],
    ['POST', '/accounting/gl/balance/rpt/3533914511118750'],
  ] as const)('allows reviewed readonly %s %s', (method, path) => {
    expect(() => assertChanjetProxyReadonly(method, path)).not.toThrow();
  });

  it.each([
    ['POST', '/accounting/openapi/cc/party/create/3533914511118750'],
    ['POST', '/accounting/openapi/cc/department/update/3533914511118750'],
    ['POST', '/accounting/gl/AcctgTrans/save/3533914511118750'],
    ['POST', '/accounting/internal/cc/salesorder/list'],
    ['POST', '/accounting/openapi/cc/purchasestockin/list'],
    ['GET', '/accounting/openapi/cc/department/list/3533914511118750'],
  ] as const)('blocks unreviewed or method-mismatched %s %s', (method, path) => {
    expect(() => assertChanjetProxyReadonly(method, path)).toThrow(ForbiddenException);
  });
});
