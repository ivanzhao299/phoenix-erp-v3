import { describe, expect, it } from 'vitest';
import { allowedAction, positiveQuantity, receiveSummary, validateReceive } from './replenishment';

describe('replenishment safety rules', () => {
  it('rejects empty, NaN, zero and negative quantities', () => {
    for (const value of ['', 'x', Number.NaN, 0, -1, true, [1], null]) expect(positiveQuantity(value)).toBeNull();
    expect(positiveQuantity('1.25')).toBe(1.25);
  });
  it('validates each transfer batch independently', () => {
    expect(validateReceive({ batchNo: 'A', expected: 10, received: '8', damaged: '2', note: '' })).toBeNull();
    expect(validateReceive({ batchNo: 'A', expected: 10, received: '9', damaged: '2', note: '' })).toBe('overExpected');
    expect(validateReceive({ batchNo: 'A', expected: 10, received: '-1', damaged: '0', note: '' })).toBe('negative');
    expect(validateReceive({ batchNo: 'A', expected: -1, received: '0', damaged: '0', note: '' })).toBe('negative');
    expect(validateReceive({ batchNo: 'A', expected: 10, received: 'x', damaged: '0', note: '' })).toBe('invalidNumber');
  });
  it('summarises short and damaged quantities live', () => {
    expect(receiveSummary([{ batchNo: 'A', expected: 10, received: '7', damaged: '1', note: '' }, { batchNo: 'B', expected: 5, received: '5', damaged: '0', note: '' }])).toEqual({ expected: 15, received: 12, damaged: 1, shortage: 2 });
  });
  it('exposes only legal actions for state and permission', () => {
    expect(allowedAction('SUBMITTED', { canCreate: true, canApprove: false, canEdit: true })).toBeNull();
    expect(allowedAction('DISPATCHED', { canCreate: false, canApprove: false, canEdit: true })).toBe('receive');
    expect(allowedAction('CANCELLED', { canCreate: true, canApprove: true, canEdit: true })).toBeNull();
  });
});
