import { describe, expect, it } from 'vitest';
import { normalizeGradingSourceBatch } from './grading-source';

describe('normalizeGradingSourceBatch', () => {
  it('subtracts dirty and cracked eggs from the persisted gross collection quantity', () => {
    expect(normalizeGradingSourceBatch({
      id: 7,
      house_code: 'H01',
      house_name: '一号舍',
      total_qty: 800,
      received_qty: 800,
      dirty_qty: 10,
      cracked_qty: 10,
    }, 0)).toMatchObject({
      received_qty: 800,
      dirty_qty: 10,
      cracked_qty: 10,
      available: 780,
    });
  });

  it('derives the net quantity for legacy payloads without received_qty', () => {
    expect(normalizeGradingSourceBatch({
      total_qty: 800,
      dirty_qty: 10,
      cracked_qty: 10,
    }, 0).available).toBe(780);
  });

  it('prefers the server-computed grading ceiling', () => {
    expect(normalizeGradingSourceBatch({
      total_qty: 200,
      received_qty: 200,
      dirty_qty: 2,
      cracked_qty: 2,
      gradable_qty: 196,
    }, 0).available).toBe(196);
  });
});
