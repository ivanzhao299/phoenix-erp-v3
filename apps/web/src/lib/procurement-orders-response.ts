export interface ProcurementOrdersPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Keep the order list and its displayed total consistent when an older API or
 * response gateway omits the count (or returns zero alongside a non-empty page).
 */
export function normalizeProcurementOrdersPage<T>(
  payload: unknown,
  fallbackPage = 1,
  fallbackPageSize = 20,
): ProcurementOrdersPage<T> {
  if (!payload || typeof payload !== "object") {
    return { items: [], total: 0, page: fallbackPage, pageSize: fallbackPageSize };
  }

  const record = payload as Record<string, unknown>;
  const nested = record.data;
  if (nested && !Array.isArray(nested) && typeof nested === "object") {
    return normalizeProcurementOrdersPage<T>(nested, fallbackPage, fallbackPageSize);
  }

  const items = Array.isArray(record.items)
    ? record.items as T[]
    : Array.isArray(record.data)
      ? record.data as T[]
      : [];
  const parsedTotal = Number(record.total ?? record.count);
  const total = Number.isFinite(parsedTotal) && parsedTotal >= items.length
    ? parsedTotal
    : items.length;
  const parsedPage = Number(record.page);
  const parsedPageSize = Number(record.pageSize);

  return {
    items,
    total,
    page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : fallbackPage,
    pageSize: Number.isFinite(parsedPageSize) && parsedPageSize > 0
      ? parsedPageSize
      : fallbackPageSize,
  };
}
