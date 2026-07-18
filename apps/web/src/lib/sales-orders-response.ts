export interface SalesOrdersPage<T> {
  rows: T[];
  total: number;
}

/**
 * Accept the list shapes used by paginated endpoints and by the global API
 * envelope. Unknown/malformed payloads stay empty instead of crashing render.
 */
export function normalizeSalesOrdersPage<T>(payload: unknown): SalesOrdersPage<T> {
  if (Array.isArray(payload)) return { rows: payload as T[], total: payload.length };
  if (!payload || typeof payload !== 'object') return { rows: [], total: 0 };

  const record = payload as Record<string, unknown>;
  const nested = record.data;
  if (nested && !Array.isArray(nested) && typeof nested === 'object') {
    return normalizeSalesOrdersPage<T>(nested);
  }

  const rows = Array.isArray(record.data)
    ? record.data as T[]
    : Array.isArray(record.items)
      ? record.items as T[]
      : Array.isArray(record.rows)
        ? record.rows as T[]
        : [];
  const rawTotal = record.total ?? record.count;
  const parsedTotal = Number(rawTotal);

  return {
    rows,
    total: Number.isFinite(parsedTotal) ? parsedTotal : rows.length,
  };
}
