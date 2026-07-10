import { describe, expect, it } from 'vitest';
import { isDailyReportHouseMissing } from '@/lib/breeding-daily';

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
