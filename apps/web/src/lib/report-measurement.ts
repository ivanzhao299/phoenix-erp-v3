/** A missing measurement and a measured zero have different business meanings. */
export function reportMeasurement(value: number | string | null | undefined, missing: number, partialLabel: string) {
  if (value == null) return '—';
  return missing > 0 ? `${value} (${partialLabel})` : String(value);
}
