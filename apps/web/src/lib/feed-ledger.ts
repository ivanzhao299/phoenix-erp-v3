export interface FeedLedgerRow {
  id: number | null;
  ledger_date: string;
  material_name: string;
  unit: string;
  sort_order: number;
  prev_stock: number;
  inbound_qty: number;
  outbound_detail: Record<string, number>;
  outbound_total: number;
  current_stock: number;
  daily_usage: number;
  days_left: number | null;
  alert: 'CRITICAL' | 'WARN' | null;
  note: string;
}

export interface FeedLedgerSavePayload {
  date: string;
  items: FeedLedgerRow[];
}

export function createFeedLedgerSavePayload(
  date: string,
  rows: FeedLedgerRow[],
): FeedLedgerSavePayload {
  return { date, items: rows };
}

export function unwrapFeedLedgerSaveResponse(value: unknown): FeedLedgerRow[] {
  const response = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};

  if (typeof response.code === 'number' && response.code !== 200) {
    throw new Error(typeof response.msg === 'string' ? response.msg : '保存失败');
  }

  const rows = response.data ?? value;
  if (!Array.isArray(rows)) throw new Error('饲料台账保存回执无效，请刷新核对');
  return normalizeFeedLedgerRows(rows);
}

const finiteNumber = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export function normalizeFeedLedgerRows(value: unknown): FeedLedgerRow[] {
  if (!Array.isArray(value)) return [];

  return value.map((item) => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const rawDetail = row.outbound_detail && typeof row.outbound_detail === 'object' && !Array.isArray(row.outbound_detail)
      ? row.outbound_detail as Record<string, unknown>
      : {};
    const outboundDetail = Object.fromEntries(
      Object.entries(rawDetail).map(([house, quantity]) => [house, finiteNumber(quantity)]),
    );

    return {
      id: row.id == null ? null : finiteNumber(row.id),
      ledger_date: typeof row.ledger_date === 'string' ? row.ledger_date : '',
      material_name: typeof row.material_name === 'string' ? row.material_name : '',
      unit: typeof row.unit === 'string' ? row.unit : '',
      sort_order: finiteNumber(row.sort_order),
      prev_stock: finiteNumber(row.prev_stock),
      inbound_qty: finiteNumber(row.inbound_qty),
      outbound_detail: outboundDetail,
      outbound_total: finiteNumber(row.outbound_total),
      current_stock: finiteNumber(row.current_stock),
      daily_usage: finiteNumber(row.daily_usage),
      days_left: row.days_left == null ? null : finiteNumber(row.days_left),
      alert: row.alert === 'CRITICAL' || row.alert === 'WARN' ? row.alert : null,
      note: typeof row.note === 'string' ? row.note : '',
    };
  });
}

export function normalizeFeedLedgerHouses(value: unknown): Record<string, string> {
  if (!Array.isArray(value)) return {};
  const houses: Record<string, string> = Object.create(null);
  for (const house of value) {
    if (typeof house === 'string' && house) {
      houses[house] = house;
    } else if (house && typeof house.house_code === 'string' && house.house_code) {
      houses[house.house_code] = typeof house.house_name === 'string' && house.house_name
        ? house.house_name : house.house_code;
    }
  }
  return houses;
}
