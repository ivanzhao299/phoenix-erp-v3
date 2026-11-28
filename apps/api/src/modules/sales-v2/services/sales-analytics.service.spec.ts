import { SalesAnalyticsService } from './sales-analytics.service';

describe('SalesAnalyticsService customer schema compatibility', () => {
  it('reads the canonical sal_customers customer_no in credit-risk analytics', async () => {
    const queries: string[] = [];
    const ds = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        if (queries.length === 1) return [{}];
        return [];
      }),
    };
    const cls = { get: jest.fn(() => ({ isGlobal: true, allowedCompanyCodes: [] })) };
    const service = new SalesAnalyticsService(ds as never, cls as never);

    await service.getCreditRisk();

    const customerQuery = queries.find((sql) => sql.includes('FROM sal_customers c2'));
    expect(customerQuery).toContain('c2.customer_no AS customer_code');
    expect(customerQuery).not.toContain('c2.customer_code');
  });
});

describe('SalesAnalyticsService price anomaly read contract', () => {
  it('sorts a materialized output alias and keeps threshold/limit/scope parameterized', async () => {
    const ds = { query: jest.fn(async () => []) };
    const cls = { get: jest.fn(() => ({ isGlobal: false, allowedCompanyCodes: ['COMP-A'] })) };
    const service = new SalesAnalyticsService(ds as never, cls as never);
    await service.getPriceAnomalies({ threshold: 7, limit: 12 });
    const [sql, params] = ds.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('SELECT * FROM (SELECT');
    expect(sql).toContain(') AS anomalies');
    expect(sql).toContain('ORDER BY ABS(anomalies.diff_rate) DESC, anomalies.created_at DESC');
    expect(sql).not.toContain('ORDER BY ABS(diff_rate)');
    expect(sql).toContain('AND so.company_code = ANY($3)');
    expect(params).toEqual([0.07, 12, ['COMP-A']]);
  });
});


describe('SalesAnalyticsService inventory turnover scope', () => {
  it('intersects an explicit company filter with both company and warehouse scope on every query', async () => {
    const ds = { query: jest.fn(async () => [{}]) };
    const cls = { get: jest.fn(() => ({
      isGlobal: false,
      allowedCompanyCodes: ['COMP-A', 'COMP-B'],
      allowedWarehouseCodes: ['WH-A'],
    })) };
    const service = new SalesAnalyticsService(ds as never, cls as never);

    await service.getInventoryTurnover('COMP-A');

    expect(ds.query).toHaveBeenCalledTimes(4);
    for (const [sql, params] of ds.query.mock.calls as unknown as [string, unknown[]][]) {
      expect(sql).toContain('company_code = ANY(');
      expect(sql).toContain('warehouse_code = ANY(');
      expect(params).toEqual([['COMP-A', 'COMP-B'], ['WH-A'], 'COMP-A']);
    }
  });

  it('returns empty scoped metrics when the requested company or warehouse scope is unavailable', async () => {
    const ds = { query: jest.fn(async () => [{}]) };
    const cls = { get: jest.fn(() => ({
      isGlobal: false,
      allowedCompanyCodes: ['COMP-A'],
      allowedWarehouseCodes: [],
    })) };
    const service = new SalesAnalyticsService(ds as never, cls as never);

    await service.getInventoryTurnover('COMP-B');

    expect(ds.query).toHaveBeenCalledTimes(4);
    for (const [sql, params] of ds.query.mock.calls as unknown as [string, unknown[]][]) {
      expect(sql).toContain('AND 1=0');
      expect(params).toEqual([]);
    }
  });
});
