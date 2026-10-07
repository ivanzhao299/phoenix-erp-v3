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
