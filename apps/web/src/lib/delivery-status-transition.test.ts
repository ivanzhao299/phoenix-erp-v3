import { describe, expect, it } from 'vitest';
import {
  DELIVERY_ACTION_STATUS,
  resolveDeliveryStatus,
} from './delivery-status-transition';

describe('delivery action status transition', () => {
  it.each(Object.entries(DELIVERY_ACTION_STATUS))(
    'updates %s immediately to %s when the mutation has no full entity',
    (endpoint, status) => {
      expect(resolveDeliveryStatus(endpoint, undefined)).toBe(status);
    },
  );

  it('prefers the status returned by the server', () => {
    expect(resolveDeliveryStatus('complete', { status: 'PARTIALLY_SIGNED' }))
      .toBe('PARTIALLY_SIGNED');
  });

  it('does not invent a transition for an unknown action', () => {
    expect(resolveDeliveryStatus('unknown-action', {})).toBeUndefined();
  });
});
