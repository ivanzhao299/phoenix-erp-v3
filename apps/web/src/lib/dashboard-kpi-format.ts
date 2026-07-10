export type DashboardMetricDensity = 'normal' | 'compact' | 'dense';

export type DashboardMetricDisplay = {
  value: string;
  unit: string;
  density: DashboardMetricDensity;
};

const NUMBER_LIKE_RE = /^-?\d+(?:,\d{3})*(?:\.\d+)?$|^-?\d+(?:\.\d+)?$/;

function normalizeUnit(unit?: string) {
  return (unit == null ? '' : String(unit).trim())
    .replace(/\s*\([^)]*\)\s*/g, '')
    .replace(/\s*·.*$/g, '')
    .replace(/^条.*$/, '条')
    .trim();
}

function formatNumberLike(value: string) {
  if (!NUMBER_LIKE_RE.test(value)) return value;
  const plain = value.replace(/,/g, '');
  const num = Number(plain);
  if (!Number.isFinite(num)) return value;
  const decimals = plain.includes('.') ? Math.min(2, plain.split('.')[1]?.length ?? 0) : 0;
  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function normalizeDashboardMetric(value?: string, unit?: string): DashboardMetricDisplay {
  const rawValue = value == null || String(value).trim() === '' ? '—' : String(value).trim();
  const normalizedValue = rawValue === '—' ? rawValue : formatNumberLike(rawValue);
  const normalizedUnit = normalizeUnit(unit);
  const displayLength = normalizedValue.length + (normalizedUnit ? normalizedUnit.length + 1 : 0);
  const density: DashboardMetricDensity =
    displayLength >= 18 ? 'dense' : displayLength >= 11 ? 'compact' : 'normal';

  return { value: normalizedValue, unit: normalizedUnit, density };
}
