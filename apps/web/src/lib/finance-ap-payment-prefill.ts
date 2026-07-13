export interface FinanceApPaymentPrefillInput {
  apId: string;
  apNo: string;
  companyCode?: string | null;
  companyName?: string | null;
  projectCode?: string | null;
  projectName?: string | null;
  supplierCode?: string | null;
  supplierName?: string | null;
  currencyCode?: string | null;
  balanceAmountOriginal?: string | number | null;
  sourceNo?: string | null;
}

export interface FinanceApPaymentPrefill {
  source: 'finance-ap';
  apId: string;
  apNo: string;
  companyCode: string;
  companyName: string;
  projectCode: string;
  projectName: string;
  supplierCode: string;
  supplierName: string;
  currencyCode: string;
  balanceAmountOriginal: string;
  sourceNo: string;
}

const NEW_PAYMENT_PATH = '/procurement2/payments/new';

function appendIfPresent(params: URLSearchParams, key: string, value: string | number | null | undefined) {
  const normalized = String(value ?? '').trim();
  if (normalized) params.set(key, normalized);
}

export function buildFinanceApPaymentPrefillHref(input: FinanceApPaymentPrefillInput): string {
  const params = new URLSearchParams();
  params.set('source', 'finance-ap');
  appendIfPresent(params, 'apId', input.apId);
  appendIfPresent(params, 'apNo', input.apNo);
  appendIfPresent(params, 'companyCode', input.companyCode);
  appendIfPresent(params, 'companyName', input.companyName);
  appendIfPresent(params, 'projectCode', input.projectCode);
  appendIfPresent(params, 'projectName', input.projectName);
  appendIfPresent(params, 'supplierCode', input.supplierCode);
  appendIfPresent(params, 'supplierName', input.supplierName);
  appendIfPresent(params, 'currencyCode', input.currencyCode);
  appendIfPresent(params, 'balanceAmountOriginal', input.balanceAmountOriginal);
  appendIfPresent(params, 'sourceNo', input.sourceNo);

  return `${NEW_PAYMENT_PATH}?${params.toString()}`;
}

export function parseFinanceApPaymentPrefill(params: URLSearchParams): FinanceApPaymentPrefill | null {
  if (params.get('source') !== 'finance-ap') return null;

  const apId = (params.get('apId') ?? '').trim();
  const apNo = (params.get('apNo') ?? '').trim();
  if (!apId || !apNo) return null;

  const balance = (params.get('balanceAmountOriginal') ?? '').trim();
  const amount = Number(balance);

  return {
    source: 'finance-ap',
    apId,
    apNo,
    companyCode: (params.get('companyCode') ?? '').trim(),
    companyName: (params.get('companyName') ?? '').trim(),
    projectCode: (params.get('projectCode') ?? '').trim(),
    projectName: (params.get('projectName') ?? '').trim(),
    supplierCode: (params.get('supplierCode') ?? '').trim(),
    supplierName: (params.get('supplierName') ?? '').trim(),
    currencyCode: (params.get('currencyCode') ?? '').trim() || 'CNY',
    balanceAmountOriginal: amount > 0 ? String(amount) : '',
    sourceNo: (params.get('sourceNo') ?? '').trim(),
  };
}
