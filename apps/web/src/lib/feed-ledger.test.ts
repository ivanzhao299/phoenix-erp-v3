import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  createFeedLedgerSavePayload,
  normalizeFeedLedgerRows,
  unwrapFeedLedgerSaveResponse,
} from './feed-ledger';

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

describe('BUG-20260720-0002 feed ledger save contract', () => {
  const row = normalizeFeedLedgerRows([{ material_name: '玉米', inbound_qty: 8 }])[0];

  it('sends the endpoint-required items property instead of rows', () => {
    expect(createFeedLedgerSavePayload('2026-07-20', [row])).toEqual({
      date: '2026-07-20',
      items: [row],
    });
  });

  it('uses the server-authoritative rows after a successful save', () => {
    const savedRows = unwrapFeedLedgerSaveResponse({
      code: 200,
      data: [{ material_name: '玉米', inbound_qty: '8' }],
    });

    expect(savedRows[0].inbound_qty).toBe(8);
  });

  it('surfaces an HTTP-200 business failure instead of showing saved', () => {
    expect(() => unwrapFeedLedgerSaveResponse({
      code: 400,
      msg: '缺少 date 或 items',
    })).toThrow('缺少 date 或 items');
  });

  it('keeps the edit permission gate and visible failure feedback on the page', () => {
    const pageSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/(admin)/breeding/feed/page.tsx'),
      'utf8',
    );

    expect(pageSource).toContain("usePermission('MENU_BREEDING')");
    expect(pageSource).toContain('{canEdit && (');
    expect(pageSource).toContain('role="alert"');
    expect(pageSource).toContain('disabled={saving || loading}');
    expect(pageSource).toContain("overflow: 'auto'");
    expect(pageSource).toContain("flexWrap: 'wrap'");
  });
});
