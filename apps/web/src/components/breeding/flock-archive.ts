import { flockDay, flockFormParams } from '@/components/flock-lifecycle-form';

const dayMilliseconds = 86_400_000;
const localeCodes: Record<string, string> = { zh: 'zh-CN', en: 'en-SG', lo: 'lo-LA' };

export function flockArchiveNumber(value: unknown) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

export function flockArchivePlacementDate(placementDate: unknown, startDate: unknown) {
  const placement = flockDay(placementDate);
  const start = flockDay(startDate);
  return placement && start && placement !== start ? '' : placement || start;
}

export function flockArchiveAge(placementDate: unknown, placementAge: unknown, asOf: unknown) {
  const first = flockDay(placementDate);
  const last = flockDay(asOf);
  const initialDays = flockArchiveNumber(placementAge);
  if (!first || !last || last < first || initialDays === null || !Number.isInteger(initialDays) || initialDays < 0) return null;
  const days = initialDays + (Date.parse(last) - Date.parse(first)) / dayMilliseconds;
  return { days, weeks: Math.floor(days / 7), remainingDays: days % 7 };
}

export function flockArchiveDate(value: unknown, lang: string) {
  const day = flockDay(value);
  return day ? new Intl.DateTimeFormat(localeCodes[lang] ?? localeCodes.zh, {
    timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(day)) : '—';
}

export function flockArchiveFormatNumber(value: unknown, lang: string, maximumFractionDigits = 2) {
  const number = flockArchiveNumber(value);
  return number === null ? '—' : new Intl.NumberFormat(localeCodes[lang] ?? localeCodes.zh, { maximumFractionDigits }).format(number);
}

export function flockArchiveTransferUrl(flockNo: string, houseCode: string, occupancyId?: string) {
  return `/breeding/flock-lifecycle/transfers?${flockFormParams({ kind: 'TRANSFER', formHouseCode: houseCode, formFlockNo: flockNo, occupancyId })}`;
}
