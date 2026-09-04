import { formatMasterData } from '@/lib/business-display';

export interface PurchaseRequestDisplayRow {
  companyCode: string;
  companyName?: string;
  companyDisplayName?: string;
  projectCode?: string;
  projectName?: string;
  projectDisplayName?: string;
  requesterName?: string;
  requesterRealName?: string;
  requesterUsername?: string;
}

export function formatPurchaseRequestCompany(row: PurchaseRequestDisplayRow, lang: string): string {
  return formatMasterData({ company_name: row.companyDisplayName || row.companyName }, 'company_name', row.companyCode, lang);
}

export function formatPurchaseRequestProject(row: PurchaseRequestDisplayRow, lang: string): string {
  if (!row.projectCode) return '—';
  return formatMasterData({ project_name: row.projectDisplayName || row.projectName }, 'project_name', row.projectCode, lang);
}

export function formatPurchaseRequester(row: PurchaseRequestDisplayRow): string {
  const account = row.requesterUsername?.trim() || '';
  const realName = row.requesterRealName?.trim() || '';
  if (account) return !realName || realName === account ? account : `${realName}（${account}）`;
  return row.requesterName?.trim() || realName || '—';
}
