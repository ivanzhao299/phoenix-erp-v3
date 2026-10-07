import { DataSource, QueryRunner } from 'typeorm';
import { SalesAnalyticsService } from './sales-analytics.service';

// Explicitly opt in with the port of the task's ephemeral local PG container.
// Never consume project DB_* credentials or connect to a production database.
const port = Number(process.env.PRICE_ANOMALY_PG_PORT || 0);
const pgDescribe = port ? describe : describe.skip;

pgDescribe('price anomalies on isolated PostgreSQL', () => {
  let ds: DataSource;
  let runner: QueryRunner;
  let service: SalesAnalyticsService;
  const scope = { isGlobal: true, allowedCompanyCodes: ['COMP-A'] };

  beforeAll(async () => {
    ds = new DataSource({ type: 'postgres', host: '127.0.0.1', port, username: 'acceptance', database: 'acceptance', synchronize: false, entities: [], migrations: [] });
    await ds.initialize();
    runner = ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query(`CREATE TEMP TABLE sal_sales_orders (
      id integer PRIMARY KEY, order_no text, customer_code text, customer_name text,
      company_code text, created_at timestamptz, created_by text, status text
    ) ON COMMIT DROP`);
    await runner.query(`CREATE TEMP TABLE sal_order_items (
      sales_order_id integer, product_code text, product_name text,
      actual_unit_price numeric, resolved_unit_price numeric,
      floor_price numeric, below_floor_price boolean
    ) ON COMMIT DROP`);
    await runner.query(`INSERT INTO sal_sales_orders VALUES
      (1,'POSITIVE','CUS-A','Customer A','COMP-A','2026-10-01','fixture','APPROVED'),
      (2,'NEGATIVE','CUS-A','Customer A','COMP-A','2026-10-02','fixture','APPROVED'),
      (3,'WITHIN_THRESHOLD','CUS-A','Customer A','COMP-A','2026-10-03','fixture','APPROVED'),
      (4,'OTHER_COMPANY','CUS-B','Customer B','COMP-B','2026-10-04','fixture','APPROVED'),
      (5,'DRAFT','CUS-A','Customer A','COMP-A','2026-10-05','fixture','DRAFT')`);
    await runner.query(`INSERT INTO sal_order_items VALUES
      (1,'P1','Product One',120,100,80,false),
      (2,'P1','Product One',50,100,80,true),
      (3,'P1','Product One',103,100,80,false),
      (4,'P1','Product One',200,100,80,false),
      (5,'P1','Product One',300,100,80,false)`);
    service = new SalesAnalyticsService({ query: (sql: string, params: unknown[]) => runner.query(sql, params) } as never, { get: () => scope } as never);
  });

  afterAll(async () => {
    if (runner) { await runner.rollbackTransaction(); await runner.release(); }
    if (ds?.isInitialized) await ds.destroy();
  });

  it('reproduces the old output-alias expression error 42703', async () => {
    await runner.query('SAVEPOINT alias_repro');
    await expect(runner.query('SELECT 1 AS diff_rate ORDER BY ABS(diff_rate)')).rejects.toMatchObject({ driverError: { code: '42703' } });
    await runner.query('ROLLBACK TO SAVEPOINT alias_repro');
  });

  it('executes the real service SQL, absolute ordering, status exclusion and threshold', async () => {
    scope.isGlobal = true;
    const rows = await service.getPriceAnomalies({ threshold: 5, limit: 10 });
    expect(rows.map((row: { sales_order_no: string }) => row.sales_order_no)).toEqual(['OTHER_COMPANY', 'NEGATIVE', 'POSITIVE']);
    expect(rows.map((row: { diff_rate: string }) => Number(row.diff_rate))).toEqual([100, -50, 20]);
  });

  it('retains company scope and LIMIT without introducing writes', async () => {
    scope.isGlobal = false;
    const rows = await service.getPriceAnomalies({ threshold: 5, limit: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].sales_order_no).toBe('NEGATIVE');
    expect(rows[0].company_code).toBe('COMP-A');
  });
});
