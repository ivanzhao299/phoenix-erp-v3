import { describe, expect, it } from 'vitest';
import { buildHomeFarmKpi } from './home-farm-kpi';

describe('buildHomeFarmKpi', () => {
  it('keeps feed from hen-report totals and fills water from daily logs when hen totals omit water', () => {
    const kpi = buildHomeFarmKpi(
      {
        rows: [
          { current_qty: 1000, eggs: 820 },
          { current_qty: 1200, eggs: 960 },
        ],
        totals: { current_qty: 2200, eggs: 1780, feed: 315, logged_houses: 2 },
      },
      null,
      {
        rows: [
          { feed_consumed: 100, water_consumed: 230 },
          { feed_consumed: 215, water_consumed: 270 },
        ],
      },
    );

    expect(kpi.feedToday).toBe(315);
    expect(kpi.waterToday).toBe(500);
    expect(kpi.layRate).toBe(80.9);
  });

  it('treats entered zero feed and water as known values instead of missing data', () => {
    const kpi = buildHomeFarmKpi(
      { rows: [], totals: {} },
      { data: { summary: { totalAlarms: 3 }, houses: [{ feedToday: 12, waterToday: 0.4 }] } },
      { data: [{ feed_consumed: 0, water_consumed: 0 }] },
    );

    expect(kpi.feedToday).toBe(0);
    expect(kpi.waterToday).toBe(0);
    expect(kpi.alarmCount).toBe(3);
  });

  it('falls back to IoT house summaries and converts water tons to liters only when logs are absent', () => {
    const kpi = buildHomeFarmKpi(
      null,
      {
        data: {
          summary: { totalAlarms: 1 },
          houses: [
            { feedToday: '10.5', waterToday: '0.3' },
            { feedToday: 9.5, waterToday: 0.2 },
          ],
        },
      },
      [],
    );

    expect(kpi.feedToday).toBe(20);
    expect(kpi.waterToday).toBe(500);
    expect(kpi.alarmCount).toBe(1);
  });
});
