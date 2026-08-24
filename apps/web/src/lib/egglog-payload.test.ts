import { describe, expect, it } from 'vitest';
import { buildEgglogPayload } from './egglog-payload';

describe('buildEgglogPayload', () => {
  it('maps the single mobile broken-egg input to PC BROKEN fields', () => {
    const payload = buildEgglogPayload(
      { eggs: 120, dirty: 3, broken: 5, temp: '27.5', humidity: '' },
      { house_code: 'H001', flock_no: 'F001', log_date: '2026-08-24', shift: '早班' },
    );

    expect(payload).toMatchObject({
      eggs_produced: 120,
      dirty_eggs: 3,
      broken_eggs: 5,
      eggs_by_grade: { DIRTY: 3, BROKEN: 5 },
      temp: 27.5,
      humidity: null,
    });
    expect(payload).not.toHaveProperty('bad_eggs');
  });

  it('keeps the saleable total explicit without inventing a GRADE_1..5 split', () => {
    const payload = buildEgglogPayload(
      { eggs: 99, dirty: 0, broken: 0, temp: '', humidity: '' },
      { house_code: 'H002', log_date: '2026-08-24', shift: '晚班' },
    );

    expect(payload.eggs_produced).toBe(99);
    expect(payload.eggs_by_grade).toEqual({ DIRTY: 0, BROKEN: 0 });
    expect(Object.keys(payload.eggs_by_grade)).not.toEqual(expect.arrayContaining(['GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5']));
  });
});
