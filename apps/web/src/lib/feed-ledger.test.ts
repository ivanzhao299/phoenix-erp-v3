import { describe, expect, it } from 'vitest';
import { normalizeFeedLedgerRows } from './feed-ledger';

describe('BUG-20260717-0002 feed ledger response normalization', () => {
  it('keeps nullable legacy values from crashing the ledger render', () => {
    const [row] = normalizeFeedLedgerRows([{
      id: null,
      material_name: '玉米',
      prev_stock: null,
      inbound_qty: '12.5',
      outbound_detail: null,
      outbound_total: null,
      current_stock: undefined,
      daily_usage: null,
      days_left: null,
      note: null,
    }]);

    expect(row).toMatchObject({
      id: null,
      material_name: '玉米',
      prev_stock: 0,
      inbound_qty: 12.5,
      outbound_detail: {},
      outbound_total: 0,
      current_stock: 0,
      daily_usage: 0,
      days_left: null,
      note: '',
    });
    expect(row.prev_stock.toLocaleString()).toBe('0');
  });

  it('returns an empty state for an unexpected response payload', () => {
    expect(normalizeFeedLedgerRows(null)).toEqual([]);
    expect(normalizeFeedLedgerRows({ data: null })).toEqual([]);
  });
});
