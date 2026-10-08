import { ForbiddenException } from '@nestjs/common';
type ChanjetProxyMethod = 'GET' | 'POST';
const CHANJET_PROXY_READONLY_RULES: ReadonlyArray<{
  method: ChanjetProxyMethod;
  path: RegExp;
}> = [
  { method: 'GET', path: /^\/accounting\/openapi\/cc\/book\/findByEnterpriseId$/ },
  { method: 'GET', path: /^\/accounting\/gl\/glaccount\/getInitBalanceLists\/[^/?#]+$/ },
  { method: 'GET', path: /^\/accounting\/gl\/statistics\/(?:pay|receive)\/[^/?#]+$/ },
  { method: 'GET', path: /^\/accounting\/gl\/AcctgTrans\/acctgTransFuzzySearch\/[^/?#]+$/ },
  { method: 'GET', path: /^\/accounting\/fin\/getOld(?:BalanceSheet|IncomeStatement)\/[^/?#]+$/ },
  { method: 'GET', path: /^\/accounting\/asr\/CashFlow\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/department\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/party\/custvendor\/query\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/project\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/finaccount\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/payment\/(?:ap|ar)\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/purchaseorder\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/inv\/purchaseapply\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/purchasestockin\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/salesstockout\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/inv\/onhandqty\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/inv\/onhandqtylot\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/inv\/finishedgoodsstock\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/inv\/materialstock\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/inv\/stockin\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/inv\/stockout\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/inv\/stocktransfer\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/inv\/stockcount\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/retailstock\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/openapi\/cc\/salesorder\/list\/[^/?#]+$/ },
  { method: 'POST', path: /^\/accounting\/gl\/balance\/rpt\/[^/?#]+$/ },
];

export function assertChanjetProxyReadonly(method: ChanjetProxyMethod, path: string) {
  const allowed = CHANJET_PROXY_READONLY_RULES.some((rule) => rule.method === method && rule.path.test(path));
  if (!allowed) {
    throw new ForbiddenException('CHANJET_EXTERNAL_WRITE_DISABLED: proxy only allows reviewed readonly endpoints');
  }
}
