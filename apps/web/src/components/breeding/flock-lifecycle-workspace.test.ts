import { describe, expect, it } from 'vitest';
import { buildDocumentQuery, lifecycleLegacyLocation, sectionForKind } from './flock-lifecycle-workspace';

function parse(location: string) {
  return new URL(location, 'https://erp.invalid');
}

describe('flock lifecycle routes', () => {
  it('opens admissions on desktop and retains the mobile mortality house picker', () => {
    expect(lifecycleLegacyLocation(false, {})).toBe('/breeding/flock-lifecycle/admissions');
    expect(lifecycleLegacyLocation(true, {})).toBe('/mobile/flock-lifecycle/losses?entry=mortality');
  });

  it('retains the exact historical report and shift when resolving a legacy form link', () => {
    const result = parse(lifecycleLegacyLocation(true, {
      kind: 'REPORT_CORRECTION', houseCode: 'HOUSE-A', date: '2026-11-12', dailyLogId: '384', shift: 'PM',
    }));
    expect(result.pathname).toBe('/mobile/flock-lifecycle/corrections');
    expect(Object.fromEntries(result.searchParams)).toEqual({
      kind: 'REPORT_CORRECTION', formHouseCode: 'HOUSE-A', date: '2026-11-12', dailyLogId: '384', shift: 'PM',
    });
  });

  it('keeps the designated house/day review independent of the personal inbox and form inputs', () => {
    const result = parse(lifecycleLegacyLocation(false, {
      review: 'pending', kind: 'MORTALITY', houseCode: 'HOUSE-A', date: '2026-11-12', mine: 'true',
    }));
    expect(result.pathname).toBe('/breeding/flock-lifecycle/turnaround');
    expect(result.hash).toBe('#flock-documents');
    expect(Object.fromEntries(buildDocumentQuery('turnaround', 'houses', result.searchParams, true))).toEqual({
      limit: '25', review: 'pending', houseCode: 'HOUSE-A', date: '2026-11-12',
    });
  });

  it('preserves document cursor filters while ignoring selected details and form inputs', () => {
    const search = new URLSearchParams({
      sourceHouseCode: 'A', targetHouseCode: 'B', status: 'POSTED', doc: 'uuid', formHouseCode: 'C', cursor: 'cursor',
    });
    expect(Object.fromEntries(buildDocumentQuery('transfers', 'all', search, false))).toEqual({
      limit: '25', sourceHouseCode: 'A', targetHouseCode: 'B', status: 'POSTED', kinds: 'TRANSFER', cursor: 'cursor',
    });
    expect(sectionForKind('SELL_HELD')).toBe('held-deliveries');
  });

  it('passes through the pending action and creator filter only for the personal worklist', () => {
    const search = new URLSearchParams({ mine: 'true', houseCode: 'HOUSE-A' });
    expect(Object.fromEntries(buildDocumentQuery('inbox', 'approve', search, false))).toEqual({
      limit: '25', houseCode: 'HOUSE-A', mine: 'true', action: 'approve',
    });
  });
});
