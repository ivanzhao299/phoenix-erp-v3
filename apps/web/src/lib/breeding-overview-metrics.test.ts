import { describe, expect, it } from 'vitest';
import {
  asDailyLogRows,
  dailyLogDateKey,
  dailyLogMortalityTotal,
  sumBreedingOverviewTodayMetrics,
} from './breeding-overview-metrics';

describe('breeding overview daily metrics', () => {
  it('normalizes date-only and ISO daily log dates without shifting through UTC', () => {
    expect(dailyLogDateKey('2026-07-07')).toBe('2026-07-07');
    expect(dailyLogDateKey('2026-07-07T00:00:00.000Z')).toBe('2026-07-07');
  });

  it('sums today eggs from submitted daily reports only', () => {
    const metrics = sumBreedingOverviewTodayMetrics([
      { log_date: '2026-07-07', eggs_produced: 120 },
      { log_date: '2026-07-07T08:15:00.000Z', eggs_produced: '80' },
      { log_date: '2026-07-06', eggs_produced: 999 },
    ], '2026-07-07');

    expect(metrics.eggs).toBe(200);
  });

  it('treats today dead-cull as mortality plus elimination', () => {
    const metrics = sumBreedingOverviewTodayMetrics([
      { business_date: '2026-07-07', mortality_qty: 2, elimination_qty: 3 },
      { log_date: '2026-07-07', mortality_qty: '1', elimination_qty: '4' },
      { log_date: '2026-07-08', mortality_qty: 20, elimination_qty: 20 },
    ], '2026-07-07');

    expect(metrics.mortality).toBe(10);
    expect(dailyLogMortalityTotal({ mortality_qty: 0, elimination_qty: '' })).toBe(0);
  });

  it('unwraps CRUD array response shapes used by the breeding page', () => {
    expect(asDailyLogRows({ data: [{ id: 1 }, { id: 2 }] })).toHaveLength(2);
    expect(asDailyLogRows({ data: { rows: [{ id: 3 }] } })).toEqual([{ id: 3 }]);
    expect(asDailyLogRows([{ id: 4 }])).toEqual([{ id: 4 }]);
  });
});
