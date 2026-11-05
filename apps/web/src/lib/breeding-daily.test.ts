import { describe, expect, it } from 'vitest';
import {
  cullingReasonLabel,
  dailyReportEggTotal,
  dailyReportInboundIdempotencyKey,
  gradeQuantityTotal,
  hasDailyReportInput,
  isDailyReportHouseMissing,
} from '@/lib/breeding-daily';

describe('daily report submission input', () => {
  it('accepts a positive 9-grade breakdown without a scalar egg total', () => {
    expect(gradeQuantityTotal({ GRADE_1: '100', GRADE_2: '100' })).toBe(200);
    expect(hasDailyReportInput({ gradeQty: { GRADE_1: '100', GRADE_2: '100' } })).toBe(true);
  });

  it('does not treat an all-zero grade breakdown as input', () => {
    expect(gradeQuantityTotal({ GRADE_1: '', GRADE_2: '0' })).toBe(0);
    expect(hasDailyReportInput({ gradeQty: { GRADE_1: '', GRADE_2: '0' } })).toBe(false);
  });

  it('omits a blank scalar total so the API can derive it from grades', () => {
    expect(dailyReportEggTotal('', true)).toBeUndefined();
    expect(dailyReportEggTotal('200', true)).toBe(200);
    expect(dailyReportEggTotal('', false)).toBe(0);
  });
});

describe('isDailyReportHouseMissing', () => {
  it('blocks the empty value used by the loading chicken house selector option', () => {
    expect(isDailyReportHouseMissing('')).toBe(true);
  });

  it('treats blank values as missing and real house codes as selected', () => {
    expect(isDailyReportHouseMissing('   ')).toBe(true);
    expect(isDailyReportHouseMissing(null)).toBe(true);
    expect(isDailyReportHouseMissing(undefined)).toBe(true);
    expect(isDailyReportHouseMissing('HENHOUSE-001')).toBe(false);
  });
});

describe('daily report inbound identity', () => {
  it('uses the same bounded key for retries from both screens', () => {
    const first = dailyReportInboundIdempotencyKey('2026-10-30', 'HOUSE-A');
    expect(first).toBe(dailyReportInboundIdempotencyKey('2026-10-30', 'HOUSE-A'));
    expect(first).toMatch(/^DAILY-2026-10-30-HOUSE-A-/);
    expect(first!.length).toBeLessThanOrEqual(64);
  });

  it('does not create an identity for an incomplete report context', () => {
    expect(dailyReportInboundIdempotencyKey('', 'HOUSE-A')).toBeUndefined();
    expect(dailyReportInboundIdempotencyKey('2026-10-30', ' ')).toBeUndefined();
  });
});

describe('cullingReasonLabel', () => {
  it('renders known historical culling reason codes as Chinese labels', () => {
    expect(cullingReasonLabel('INJURY')).toBe('严重外伤');
    expect(cullingReasonLabel('SICKNESS')).toBe('患病');
    expect(cullingReasonLabel('LOW_PRODUCTION')).toBe('产蛋率低');
    expect(cullingReasonLabel('AGE')).toBe('老龄');
  });

  it('prefers runtime dictionary labels and preserves unknown non-empty values', () => {
    expect(cullingReasonLabel('OTHER', { OTHER: '其他原因' })).toBe('其他原因');
    expect(cullingReasonLabel('CUSTOM_REASON')).toBe('CUSTOM_REASON');
    expect(cullingReasonLabel('')).toBe('—');
  });
});
