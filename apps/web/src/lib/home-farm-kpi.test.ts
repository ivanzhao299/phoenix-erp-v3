import { describe, expect, it } from 'vitest';
import { buildHomeFarmKpi, sumCanonicalFlockStock } from './home-farm-kpi';

describe('buildHomeFarmKpi', () => {
  it('uses brd_flocks current_qty as the authoritative current stock source', () => {
    const kpi = buildHomeFarmKpi(
      {
        rows: [
          { current_qty: 5000, eggs: 120 },
          { current_qty: 6000, eggs: 80 },
        ],
        totals: { current_qty: 11000, eggs: 200 },
      },
      null,
      { rows: [] },
      {
        data: [
          { flock_no: 'F-001', current_qty: 900 },
          { flock_no: 'F-002', current_qty: '1300' },
        ],
      },
    );

    expect(kpi.totalStock).toBe(2200);
    expect(kpi.layRate).toBe(9.1);
  });

  it('keeps a scoped empty brd_flocks response at zero instead of falling back to stale hen-report stock', () => {
    const kpi = buildHomeFarmKpi(
      { totals: { current_qty: 11000, eggs: 200 } },
      null,
      { rows: [] },
      { data: [] },
    );

    expect(kpi.totalStock).toBe(0);
    expect(kpi.layRate).toBe(0);
  });

  it('excludes non-current flock lifecycle states from the current-stock KPI', () => {
    expect(sumCanonicalFlockStock([
      { status: 'ACTIVE', current_qty: 1000 },
      { status: 'LAYING', current_qty: 800 },
      { status: 'PEAK', current_qty: 500 },
      { status: 'GROWING', current_qty: 200 },
      { status: 'CLOSED', current_qty: 100 },
    ])).toBe(1800);
  });

  it('uses daily logs for feed and water when today has breeding log entries', () => {
    const kpi = buildHomeFarmKpi(
      {
        rows: [
          { current_qty: 1000, eggs: 820 },
          { current_qty: 1200, eggs: 960 },
        ],
        totals: { current_qty: 2200, eggs: 1780, feed: 999, logged_houses: 2 },
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

  it('falls back to hen-report feed totals when daily logs do not include feed data', () => {
    const kpi = buildHomeFarmKpi(
      {
        rows: [],
        totals: { feed: 315, water: 480 },
      },
      null,
      {
        rows: [
          { eggs_produced: 100 },
          { mortality_qty: 1 },
        ],
      },
    );

    expect(kpi.feedToday).toBe(315);
    expect(kpi.waterToday).toBe(480);
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
