import { describe, expect, it } from 'vitest';
import { DASHBOARD_ALERTS_PAGE_SIZE, getDashboardAlertPage } from './dashboard-alert-pagination';

const alerts = (count: number) => Array.from({ length: count }, (_, id) => ({ id }));

describe('dashboard alert pagination', () => {
  it('keeps an empty list on a single empty page', () => {
    expect(getDashboardAlertPage([], 1)).toMatchObject({
      currentPage: 1,
      totalPages: 1,
      totalItems: 0,
      pageItems: [],
    });
  });

  it('shows one alert on page one without adding pagination rows', () => {
    const result = getDashboardAlertPage(alerts(1), 1);
    expect(result).toMatchObject({ currentPage: 1, totalPages: 1, totalItems: 1 });
    expect(result.pageItems).toHaveLength(1);
  });

  it('shows all alerts when the list fits within one page', () => {
    const result = getDashboardAlertPage(alerts(DASHBOARD_ALERTS_PAGE_SIZE), 1);
    expect(result.currentPage).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.pageItems).toHaveLength(DASHBOARD_ALERTS_PAGE_SIZE);
  });

  it('splits larger lists into fixed-size pages and reports the total', () => {
    const result = getDashboardAlertPage(alerts(DASHBOARD_ALERTS_PAGE_SIZE + 1), 2);
    expect(result).toMatchObject({ currentPage: 2, totalPages: 2, totalItems: DASHBOARD_ALERTS_PAGE_SIZE + 1 });
    expect(result.pageItems).toHaveLength(1);
    expect(result.pageItems[0]).toEqual({ id: DASHBOARD_ALERTS_PAGE_SIZE });
  });

  it('clamps a stale page after refresh or dismissals shrink the list', () => {
    const result = getDashboardAlertPage(alerts(1), 4);
    expect(result).toMatchObject({ currentPage: 1, totalPages: 1 });
    expect(result.pageItems).toHaveLength(1);
  });

  it('normalizes invalid page sizes without creating an unbounded page', () => {
    const result = getDashboardAlertPage(alerts(2), 1, 0);
    expect(result.pageSize).toBe(DASHBOARD_ALERTS_PAGE_SIZE);
    expect(result.pageItems).toHaveLength(2);
  });
});
