import { describe, expect, it } from 'vitest';
import { cullingReasonLabel, isDailyReportHouseMissing } from '@/lib/breeding-daily';

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
