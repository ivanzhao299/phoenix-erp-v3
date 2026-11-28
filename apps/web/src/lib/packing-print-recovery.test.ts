import { describe, expect, it, vi } from 'vitest';
import { clearPendingPrint, readPendingPrint, recoverLatestPrintOperation, recoverPrintOperation, recoverPrintResult, retryPrintRequestWithSameKey, retryPrintResultWithSameKey, savePendingPrint, type PendingPrintOperation, type PendingPrintResultOperation } from './packing-print-recovery';

const operation: PendingPrintOperation = {
  actorId: 'ACTOR-A', packingCode: 'PACK-A', revision: 'REV-1', boxId: 'BOX-1', key: 'KEY-1',
  body: { packingCode: 'PACK-A', boxId: 'BOX-1', labelCode: 'LABEL-1', copies: 1, expectedRevision: 'REV-1' }, startedAt: '2026-11-28T00:00:00.000Z',
};
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
}

describe('packing print recovery', () => {
  it('persists by actor, original packing revision and box, and rejects a different identity', () => {
    const store = storage(); savePendingPrint(operation, store);
    expect(readPendingPrint('ACTOR-A', 'PACK-A', 'REV-1', 'BOX-1', store)).toEqual(operation);
    expect(readPendingPrint('ACTOR-B', 'PACK-A', 'REV-1', 'BOX-1', store)).toBeNull();
    expect(readPendingPrint('ACTOR-A', 'PACK-A', 'REV-2', 'BOX-1', store)).toBeNull();
    clearPendingPrint(operation, store);
    expect(readPendingPrint('ACTOR-A', 'PACK-A', 'REV-1', 'BOX-1', store)).toBeNull();
  });

  it('allows same-key request retry only after the server confirms NOT_FOUND', async () => {
    const request = vi.fn().mockResolvedValueOnce({ state: 'NOT_FOUND' }).mockResolvedValueOnce({ eventId: 'EVENT-1' });
    await expect(retryPrintRequestWithSameKey(operation, request)).resolves.toEqual({ eventId: 'EVENT-1' });
    expect(request.mock.calls).toEqual([
      [`operations/KEY-1?action=PRINT&packingCode=PACK-A`],
      ['labels/print-requests', { key: 'KEY-1', body: operation.body }],
    ]);
  });

  it.each([{ state: 'COMMITTED', eventId: 'EVENT-1' }, { state: 'PENDING' }])('refuses to resend when operation is $state', async (state) => {
    const request = vi.fn().mockResolvedValue(state);
    await expect(retryPrintRequestWithSameKey(operation, request)).rejects.toThrow('PRINT_RETRY_UNSAFE');
    expect(request.mock.calls.some(([path]) => path === 'labels/print-requests')).toBe(false);
  });

  it('recovers committed request and its event as evidence without sending any write', async () => {
    const events = [{ id: 'EVENT-1', event_type: 'PRINT_REQUEST' }];
    const request = vi.fn().mockResolvedValueOnce({ state: 'COMMITTED', eventId: 'EVENT-1' }).mockResolvedValueOnce(events);
    await expect(recoverPrintOperation(operation, request)).resolves.toMatchObject({ state: 'COMMITTED', eventId: 'EVENT-1', events });
    expect(request.mock.calls).toEqual([
      ['operations/KEY-1?action=PRINT&packingCode=PACK-A'],
      ['labels/print-requests/EVENT-1'],
    ]);
  });

  it('can query the current actor latest original print or result on another device without writes', async () => {
    const request = vi.fn().mockResolvedValue({ state: 'NOT_FOUND' });
    await recoverLatestPrintOperation('PACK-A', request);
    await recoverPrintResult('PACK-A', 'EVENT-1', request);
    expect(request.mock.calls).toEqual([
      ['history/PACK-A/my-operation?action=PRINT'],
      ['history/PACK-A/my-operation?action=PRINT_RESULT&requestId=EVENT-1'],
    ]);
  });

  it('retries a lost result write with the original key only when no result is recorded', async () => {
    const result: PendingPrintResultOperation = { actorId: 'ACTOR-A', packingCode: 'PACK-A', requestId: 'EVENT-1', key: 'RESULT-KEY', body: { packingCode: 'PACK-A', type: 'UNKNOWN' }, startedAt: operation.startedAt };
    const request = vi.fn().mockResolvedValueOnce({ state: 'NOT_FOUND' }).mockResolvedValueOnce({ eventId: 'RESULT-EVENT' });
    await retryPrintResultWithSameKey(result, request);
    expect(request.mock.calls).toEqual([
      ['operations/RESULT-KEY?action=PRINT_RESULT&packingCode=PACK-A'],
      ['labels/print-requests/EVENT-1/events', { key: 'RESULT-KEY', body: result.body }],
    ]);
    const alreadyRecorded = vi.fn().mockResolvedValue({ state: 'COMMITTED', eventId: 'RESULT-EVENT',result:{requestId:'EVENT-1'} });
    await expect(retryPrintResultWithSameKey(result, alreadyRecorded)).rejects.toThrow('PRINT_RESULT_RETRY_UNSAFE');
  });
});
