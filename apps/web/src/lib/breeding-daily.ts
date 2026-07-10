export function isDailyReportHouseMissing(houseCode: string | null | undefined): boolean {
  return String(houseCode ?? '').trim().length === 0;
}
