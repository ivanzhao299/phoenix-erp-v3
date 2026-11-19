import { describe, expect, it } from 'vitest';
import { buildMortalityRequest } from './mortality-payload';
import type { FarmLog } from './mobile-api';

const values = { mortality_qty: 3, elimination_qty: 2, reason: '核对' };
const row: FarmLog = { id: 7, house_code: 'H1', flock_no: 'F1', log_date: '2026-11-10',
  eggs_produced: 100, mortality_qty: 1, shift: '早班' };
describe('mobile mortality report identity', () => {
  it('edits the existing report without copying eggs, identity or grades', () => {
    const request = buildMortalityRequest([row], 'H1', row.log_date, values);
    expect(request).toMatchObject({ method: 'PUT', path: '/api/v3/farm/daily-logs/7' });
    expect(request.body).not.toHaveProperty('eggs_produced');
    expect(request.body).not.toHaveProperty('flock_no');
    expect(request.body).not.toHaveProperty('eggs_by_grade');
    expect(request.body.mortality_qty).toBe(3);
  });
  it('creates a DAILY report with no fabricated flock or repeated eggs', () => {
    const request = buildMortalityRequest([], 'H1', row.log_date, values);
    expect(request).toMatchObject({ method: 'POST', body: { house_code: 'H1', shift: 'DAILY' } });
    expect(request.body).not.toHaveProperty('flock_no');
    expect(request.body).not.toHaveProperty('eggs_produced');
  });
  it('requires a per-shift correction when the daily total is ambiguous', () => {
    expect(() => buildMortalityRequest([row, { ...row, id: 8, shift: '晚班' }], 'H1', row.log_date, values)).toThrow('逐班');
  });
});
