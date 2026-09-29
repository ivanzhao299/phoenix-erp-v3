export function companyDisplayName(companyName?: string | null, companyCode?: string | null): string {
  return companyName?.trim() || companyCode?.trim() || '—';
}
