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
