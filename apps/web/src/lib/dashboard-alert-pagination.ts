/** The dashboard keeps the alert panel bounded while still exposing every alert. */
export const DASHBOARD_ALERTS_PAGE_SIZE = 5;

export interface AlertPage<T> {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  pageItems: T[];
}

/**
 * Return a safe, bounded page for a client-side alert list.
 *
 * Keeping the page clamp here means refreshes and dismissals cannot leave the
 * dashboard on an empty page after the list shrinks.
 */
export function getDashboardAlertPage<T>(
  items: readonly T[],
  requestedPage: number,
  pageSize = DASHBOARD_ALERTS_PAGE_SIZE,
): AlertPage<T> {
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0
    ? Math.max(1, Math.floor(pageSize))
    : DASHBOARD_ALERTS_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(items.length / safePageSize));
  const requested = Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1;
  const currentPage = Math.min(Math.max(1, requested), totalPages);
  const start = (currentPage - 1) * safePageSize;

  return {
    currentPage,
    totalPages,
    totalItems: items.length,
    pageSize: safePageSize,
    pageItems: items.slice(start, start + safePageSize),
  };
}
