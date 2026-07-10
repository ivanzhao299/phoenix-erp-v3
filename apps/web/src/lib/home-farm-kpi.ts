export interface HomeFarmKpiState {
  totalStock: number;
  layRate: number;
  eggsToday: number;
  feedToday: number | null;
  waterToday: number | null;
  alarmCount: number;
}

type MetricField = string | readonly string[];

function asRows(payload: any): any[] {
  const rows = payload?.data?.rows ?? payload?.data ?? payload?.rows ?? payload;
  return Array.isArray(rows) ? rows : [];
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function firstKnownNumber(source: any, fields: MetricField[]): number | null {
  for (const field of fields) {
    const keys = Array.isArray(field) ? field : [field];
    let cursor = source;
    let exists = true;
    for (const key of keys) {
      if (cursor == null || !(key in Object(cursor))) {
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

function sumKnownRows(rows: any[], fields: MetricField[]): number | null {
  let hasKnown = false;
  const total = rows.reduce((sum, row) => {
    const value = firstKnownNumber(row, fields);
    if (value == null) return sum;
    hasKnown = true;
    return sum + value;
  }, 0);
  return hasKnown ? total : null;
}

function sumIotHouses(iot: any, field: 'feedToday' | 'waterToday'): number | null {
  const houses = iot?.data?.houses || [];
  return Array.isArray(houses) ? sumKnownRows(houses, [field]) : null;
}

export function buildHomeFarmKpi(hen: any, iot: any, dailyLogs: any): HomeFarmKpiState {
  const rows = asRows(hen);
  const totals = hen?.totals || hen?.data?.totals || null;
  const dailyRows = asRows(dailyLogs);

  const totalStockFromRows = rows.reduce((sum: number, row: any) => (
    sum + (asNumber(row.current_qty) || asNumber(row.total_qty))
  ), 0);
  const eggsFromRows = rows.reduce((sum: number, row: any) => (
    sum + (asNumber(row.eggs) || asNumber(row.eggs_produced))
  ), 0);
  const totalStock = totalStockFromRows || firstKnownNumber(totals, ['current_qty', 'total_qty', 'stock']) || 0;
  const eggsToday = eggsFromRows || firstKnownNumber(totals, ['eggs', 'eggs_produced']) || 0;
  const layRate = totalStock > 0 ? +(eggsToday / totalStock * 100).toFixed(1) : 0;

  const henFeedKg = firstKnownNumber(totals, ['feed', 'feed_consumed', 'feedKg']);
  const henWaterL = firstKnownNumber(totals, ['water', 'water_consumed', 'waterL']);
  const logFeedKg = sumKnownRows(dailyRows, ['feed_consumed', 'feedKg', 'feed']);
  const logWaterL = sumKnownRows(dailyRows, ['water_consumed', 'waterL', 'water']);
  const iotFeedKg = sumIotHouses(iot, 'feedToday');
  const iotWater = sumIotHouses(iot, 'waterToday');
  const iotWaterL = iotWater == null ? null : iotWater * 1000;

  return {
    totalStock,
    layRate,
    eggsToday,
    feedToday: henFeedKg ?? logFeedKg ?? iotFeedKg,
    waterToday: henWaterL ?? logWaterL ?? iotWaterL,
    alarmCount: firstKnownNumber(iot?.data?.summary, ['totalAlarms']) ?? 0,
  };
}
