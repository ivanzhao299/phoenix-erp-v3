export function financeSourceLabel(source?: string): string {
  if (!source) return '';
  if (source.startsWith('CHANJET')) return '好业财口径';
  if (source === 'ERP_FALLBACK') return 'ERP回退';
  return source.replace(/_/g, ' ');
}
export function financeStatusLabel(status?: string): string {
  const labels: Record<string, string> = { OK:'已对齐', WARN:'小差异', MISMATCH:'需对账', NEEDS_MAPPING:'待字段锁定', ERP_FALLBACK:'ERP回退', AUTHORITY_READY:'权威可用', READONLY_READY:'只读就绪', BLOCKED_MAPPING:'映射阻断', WAITING_SAMPLE:'待同步样本', NEED_MANUAL_REVIEW:'待人工确认', HOLD:'暂停' };
  return (status && labels[status]) || status || '未确认';
}
export function financeAlignmentSummary(statuses: string[]) {
  if (statuses.includes('HOLD')) return { status:'HOLD', label:'暂停升权' };
  if (statuses.some(s => s === 'MISMATCH' || s === 'WARN')) return { status: statuses.includes('MISMATCH') ? 'MISMATCH' : 'WARN', label:'存在差异' };
  if (statuses.some(s => ['NEEDS_MAPPING','BLOCKED_MAPPING','NEED_MANUAL_REVIEW','WAITING_SAMPLE'].includes(s))) return { status:'BLOCKED_MAPPING', label:'待字段锁定' };
  if (statuses.includes('READONLY_READY')) return { status:'READONLY_READY', label:'仅只读可用' };
  return { status:'AUTHORITY_READY', label:'权威可用' };
}
export function arLedgerQuery(farmCode: string, periodDate: string): string {
  const qs = new URLSearchParams(); if (farmCode) qs.set('farmCode', farmCode); if (periodDate) qs.set('periodDate', periodDate);
  return `/v2/finance/ar-ledger${qs.size ? `?${qs}` : ''}`;
}
export function pendingOcrCount(rows: Array<{ source: string }>): number { return rows.filter(r => r.source === 'OCR_PENDING_VERIFY').length; }
