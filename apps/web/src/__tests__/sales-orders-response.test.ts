import { describe, expect, it } from 'vitest';
import { normalizeSalesOrdersPage } from '@/lib/sales-orders-response';

describe('normalizeSalesOrdersPage', () => {
  const draft = { id: '1', order_no: 'SO-1', status: 'DRAFT' };

  it('preserves a normal paginated response', () => {
    expect(normalizeSalesOrdersPage({ data: [draft], total: 21 })).toEqual({
      rows: [draft],
      total: 21,
    });
  });

  it('accepts an API envelope and items-based pagination', () => {
    expect(normalizeSalesOrdersPage({ data: { items: [draft], count: 1 } })).toEqual({
      rows: [draft],
      total: 1,
    });
  });

  it('accepts a bare array and safely rejects malformed payloads', () => {
    expect(normalizeSalesOrdersPage([draft])).toEqual({ rows: [draft], total: 1 });
    expect(normalizeSalesOrdersPage(null)).toEqual({ rows: [], total: 0 });
  });
});
