import { describe, expect, it } from 'vitest';
import { normalizeDashboardMetric } from './dashboard-kpi-format';

describe('normalizeDashboardMetric', () => {
  it('formats raw LAK integer strings with grouping for dashboard cards', () => {
    expect(normalizeDashboardMetric('1234567890', 'LAK')).toEqual({
      value: '1,234,567,890',
      unit: 'LAK',
      density: 'compact',
    });
  });

  it('keeps empty metrics as an em dash and strips noisy unit suffixes', () => {
    expect(normalizeDashboardMetric('', '条 · 设备告警')).toEqual({
      value: '—',
      unit: '条',
      density: 'normal',
    });
  });

  it('marks very long numeric displays as dense instead of relying on ellipsis', () => {
    expect(normalizeDashboardMetric('123456789012345', 'LAK')).toEqual({
      value: '123,456,789,012,345',
      unit: 'LAK',
      density: 'dense',
    });
  });

  it('preserves already formatted decimal values', () => {
    expect(normalizeDashboardMetric('12,345.67', '枚')).toEqual({
      value: '12,345.67',
      unit: '枚',
      density: 'compact',
    });
  });
});
