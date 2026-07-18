import { describe, expect, it } from 'vitest';
import { getOpenShiftId } from './source-receive-submit';

describe('getOpenShiftId', () => {
  it('returns the server shift id only for an open shift', () => {
    expect(getOpenShiftId({ id: 42, status: 'OPEN' })).toBe(42);
    expect(getOpenShiftId({ id: 'shift-7', status: 'OPEN' })).toBe('shift-7');
  });

  it('rejects missing, closed, or unsaved shifts', () => {
    expect(getOpenShiftId(null)).toBeNull();
    expect(getOpenShiftId({ id: 42, status: 'CLOSED' })).toBeNull();
    expect(getOpenShiftId({ status: 'OPEN' })).toBeNull();
  });
});

