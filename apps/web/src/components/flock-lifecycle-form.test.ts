// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearFlockCreate, createPendingFlockCreate, flockFormActor, flockFormIdentity, flockSettlementPreview,
  loadFlockCreate, retainFlockCreate,
} from './flock-lifecycle-form';

const identity = flockFormIdentity({ kind: 'REPORT_CORRECTION', houseCode: 'A', date: '2026-11-24', dailyLogId: '11', shift: 'PM' });
const owner = flockFormActor({ userId: 1, boundFarmCodes: ['F1'], perms_version: 2 })!;
const body = '{"kind":"REPORT_CORRECTION","houseCode":"A","sourceKey":"exact-replay","expectedVersion":4,"evidence":["FILE-proof"],"expectedReportHash":"immutable"}';

afterEach(() => {
  window.sessionStorage.clear();
  vi.useRealTimers();
});

describe('flock draft recovery', () => {
  it('replays the same serialized request for the same scoped form', () => {
    const pending = createPendingFlockCreate({ owner, identity, request: body, companyCode: 'CO', houseCode: 'A', sourceKey: 'exact-replay' });
    retainFlockCreate(pending);
    expect(loadFlockCreate(owner, identity)).toEqual(pending);
    expect(loadFlockCreate(owner, identity)?.request).toBe(body);
    const anotherShift = flockFormIdentity({ kind: 'REPORT_CORRECTION', houseCode: 'A', date: '2026-11-24', dailyLogId: '10', shift: 'AM' });
    expect(loadFlockCreate(owner, anotherShift)).toBeNull();
    clearFlockCreate(pending);
    expect(loadFlockCreate(owner, identity)).toBeNull();
  });

  it('hides and removes another scope’s recovery request', () => {
    retainFlockCreate(createPendingFlockCreate({ owner, identity, request: body, companyCode: 'CO', houseCode: 'A', sourceKey: 'exact-replay' }));
    const changedScope = flockFormActor({ userId: 1, boundFarmCodes: ['F2'], perms_version: 3 })!;
    expect(loadFlockCreate(changedScope, identity)).toBeNull();
    expect(loadFlockCreate(owner, identity)).toBeNull();
  });

  it('drops recovery requests after the retention interval', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T01:00:00Z'));
    retainFlockCreate(createPendingFlockCreate({ owner, identity, request: body, companyCode: 'CO', houseCode: 'A', sourceKey: 'exact-replay' }));
    vi.setSystemTime(new Date('2026-11-25T01:00:00Z'));
    expect(loadFlockCreate(owner, identity)).toBeNull();
  });
});

describe('held bird settlement preview', () => {
  it('uses a six-place price and rounds the positive product to cents', () => {
    expect(flockSettlementPreview('1.234567', 6)).toBe('7.41');
    expect(flockSettlementPreview('0.0025', 2)).toBe('0.01');
    expect(flockSettlementPreview('0.000001', 1)).toBe('0.00');
    expect(flockSettlementPreview('1.2345678', 6)).toBeNull();
  });
});
