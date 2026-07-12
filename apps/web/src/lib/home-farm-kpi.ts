export interface HomeFarmKpiState {
  totalStock: number;
  layRate: number;
  eggsToday: number;
  feedToday: number | null;
  waterToday: number | null;
  alarmCount: number;
}

type MetricField = string | readonly string[];
type MetricRecord = Record<string, unknown>;

function isRecord(value: unknown): value is MetricRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function getField(source: unknown, field: string): unknown {
  return isRecord(source) ? source[field] : undefined;
}

function asRows(payload: unknown): unknown[] {
  const data = getField(payload, 'data');
  const rows = getField(data, 'rows') ?? data ?? getField(payload, 'rows') ?? payload;
  return Array.isArray(rows) ? rows : [];
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function firstKnownNumber(source: unknown, fields: MetricField[]): number | null {
  for (const field of fields) {
    const keys = Array.isArray(field) ? field : [field];
    let cursor = source;
    let exists = true;
    for (const key of keys) {
      if (!isRecord(cursor) || !(key in cursor)) {
        exists = false;
        break;
      }
      cursor = cursor[key];
    }
    if (!exists || cursor == null || cursor === '') continue;
    const n = Number(cursor);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function sumKnownRows(rows: unknown[], fields: MetricField[]): number | null {
  let hasKnown = false;
  const total = rows.reduce<number>((sum, row) => {
    const value = firstKnownNumber(row, fields);
    if (value == null) return sum;
    hasKnown = true;
    return sum + value;
  }, 0);
  return hasKnown ? total : null;
}

function sumIotHouses(iot: unknown, field: 'feedToday' | 'waterToday'): number | null {
  const houses = getField(getField(iot, 'data'), 'houses') || [];
  return Array.isArray(houses) ? sumKnownRows(houses, [field]) : null;
}

export function buildHomeFarmKpi(hen: unknown, iot: unknown, dailyLogs: unknown): HomeFarmKpiState {
  const rows = asRows(hen);
  const totals = getField(hen, 'totals') || getField(getField(hen, 'data'), 'totals') || null;
  const dailyRows = asRows(dailyLogs);

  const totalStockFromRows = rows.reduce((sum: number, row: unknown) => (
    sum + (asNumber(getField(row, 'current_qty')) || asNumber(getField(row, 'total_qty')))
  ), 0);
  const eggsFromRows = rows.reduce((sum: number, row: unknown) => (
    sum + (asNumber(getField(row, 'eggs')) || asNumber(getField(row, 'eggs_produced')))
  ), 0);
  const totalStock = totalStockFromRows || firstKnownNumber(totals, ['current_qty', 'total_qty', 'stock']) || 0;
  const eggsToday = eggsFromRows || firstKnownNumber(totals, ['eggs', 'eggs_produced']) || 0;
  const layRate = totalStock > 0 ? +(eggsToday / totalStock * 100).toFixed(1) : 0;

  const logFeedKg = sumKnownRows(dailyRows, ['feed_consumed', 'feedKg', 'feed']);
  const logWaterL = sumKnownRows(dailyRows, ['water_consumed', 'waterL', 'water']);
  const henFeedKg = firstKnownNumber(totals, ['feed', 'feed_consumed', 'feedKg']);
  const henWaterL = firstKnownNumber(totals, ['water', 'water_consumed', 'waterL']);
  const iotFeedKg = sumIotHouses(iot, 'feedToday');
  const iotWater = sumIotHouses(iot, 'waterToday');
  const iotWaterL = iotWater == null ? null : iotWater * 1000;

  return {
    totalStock,
    layRate,
    eggsToday,
    feedToday: logFeedKg ?? henFeedKg ?? iotFeedKg,
    waterToday: logWaterL ?? henWaterL ?? iotWaterL,
    alarmCount: firstKnownNumber(getField(getField(iot, 'data'), 'summary'), ['totalAlarms']) ?? 0,
  };
}
