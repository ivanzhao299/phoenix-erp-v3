export const AP_INVOICE_STATUS_LABELS: Record<string, string> = {
  OPEN: '未付款',
  PARTIALLY_PAID: '部分付款',
  PAID: '已付清',
  DISPUTED: '争议中',
  CANCELLED: '已取消',
};

const AP_INVOICE_STATUS_I18N_KEYS: Record<string, string> = {
  OPEN: 'fin2.ap.status_open',
  PARTIALLY_PAID: 'fin2.ap.status_partially_paid',
  PAID: 'fin2.ap.status_paid',
  DISPUTED: 'fin2.ap.status_disputed',
  CANCELLED: 'fin2.ap.status_cancelled',
};

export function getApInvoiceStatusLabel(
  status: string | null | undefined,
  t?: (key: string, fallback?: string) => string,
) {
  const key = String(status || '').toUpperCase();
  const fallback = AP_INVOICE_STATUS_LABELS[key];
  if (!fallback) return status || '—';
  return t ? t(AP_INVOICE_STATUS_I18N_KEYS[key], fallback) : fallback;
}
