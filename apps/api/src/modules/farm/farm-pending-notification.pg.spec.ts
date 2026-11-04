import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { FarmService } from './farm.service';

/**
 * Real-PostgreSQL proof for the pending-ledger notification path (product
 * verdict A). Mocked manager tests cannot prove the two things this spec
 * exists for: the INSERT actually matches the production sys_notifications
 * schema, and ON CONFLICT successfully infers the PARTIAL unique index
 * (a failing inference is a hard PostgreSQL error, not a silent no-op).
 */
const fixtureUrl = process.env.ISSUE381_PG_URL;
const fixture = fixtureUrl ? describe : describe.skip;

fixture('Farm pending-ledger notifications on real PostgreSQL', () => {
  let db: DataSource;
  let svc: FarmService;
  const resolve = jest.fn().mockResolvedValue(['7', '9']);

  beforeAll(async () => {
    const url = new URL(fixtureUrl!);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/issue381_fixture' || !process.env.ISSUE381_FIXTURE_OWNER) {
      throw new Error('Owned loopback issue381_fixture required');
    }
    db = await new DataSource({ type: 'postgres', url: fixtureUrl, synchronize: false, migrationsRun: false,
      installExtensions: false, extra: { max: 8 } }).initialize();
    const owners: Array<{ owner_key: string }> = await db.query('SELECT owner_key FROM issue381_fixture_owner');
    if (owners.length !== 1 || owners[0].owner_key !== process.env.ISSUE381_FIXTURE_OWNER) {
      throw new Error('Fixture ownership mismatch');
    }
    await db.query(`
      CREATE TABLE IF NOT EXISTS sys_notifications (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id BIGINT NOT NULL,
        notification_type VARCHAR(32) NOT NULL DEFAULT 'WORKFLOW_TASK',
        title VARCHAR(256) NOT NULL,
        content TEXT NOT NULL,
        link_type VARCHAR(32), link_id VARCHAR(64),
        biz_type VARCHAR(32), biz_id VARCHAR(64), biz_no VARCHAR(80), company_code VARCHAR(64),
        status VARCHAR(16) NOT NULL DEFAULT 'UNREAD',
        read_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_notifications_farm_ledger_pending
        ON sys_notifications (user_id, biz_type, biz_no)
       WHERE biz_type = 'FARM_LEDGER_PENDING' AND biz_no IS NOT NULL;
      CREATE TABLE IF NOT EXISTS sys_user (user_id BIGINT PRIMARY KEY, username VARCHAR(64), status INT);
      -- The inbound spec may already have created a narrower brd_daily_logs;
      -- align the columns idempotently instead of assuming one definition.
      CREATE TABLE IF NOT EXISTS brd_daily_logs (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        log_date DATE, house_code VARCHAR(64), eggs_by_grade JSONB
      );
      ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS shift VARCHAR(32);
      ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS flock_no VARCHAR(64);
      ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS farm_code VARCHAR(64);
      ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS company_code VARCHAR(64);
      ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS eggs_produced NUMERIC;
      ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS mortality_qty NUMERIC;
      ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS business_date DATE;
      CREATE TABLE IF NOT EXISTS brd_flocks (
        flock_no VARCHAR(64) PRIMARY KEY, house_code VARCHAR(64),
        current_qty NUMERIC, initial_qty NUMERIC, current_lay_rate NUMERIC
      );
      TRUNCATE sys_notifications, brd_daily_logs RESTART IDENTITY;
      DELETE FROM sys_user WHERE user_id IN (7, 9);
      INSERT INTO sys_user(user_id, username, status) VALUES (7, 'keeper-a', 1), (9, 'keeper-b', 1);
    `);
  });

  afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

  beforeEach(async () => {
    await db.query('TRUNCATE sys_notifications, brd_daily_logs RESTART IDENTITY');
    resolve.mockClear();
    // Minimal ownership: house H1 resolves to company COMP-A.
    const entityManager = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        if (!sql) return [{ farm_code: 'FARM-A', site_code: 'SITE-A', company_code: 'COMP-A' }];
        return [];
      }),
    };
    svc = new FarmService(entityManager as never, {
      resolveHouse: jest.fn(async (houseCode: string) => ({ houseCode, farmCode: 'FARM-A', siteCode: 'SITE-A', companyCode: 'COMP-A' })),
    } as never, { resolve } as never);
    // The service shares the entity manager only for scope derivation; the
    // transaction body runs against the real database through this wrapper.
    (svc as any).entityManager = {
      query: (sql: string, params?: unknown[]) => db.query(sql, params),
      transaction: async (cb: (manager: { query: (sql: string, params?: unknown[]) => Promise<any[]> }) => Promise<unknown>) =>
        cb({ query: (sql: string, params?: unknown[]) => db.query(sql, params) }),
    };
  });

  type NoticeRow = { user_id: number; biz_no: string; title: string; content: string };
  const notices = async (): Promise<NoticeRow[]> => db.query(
    'SELECT user_id, biz_no, title, content FROM sys_notifications WHERE biz_type = $1 ORDER BY user_id, biz_no',
    ['FARM_LEDGER_PENDING'],
  );

  it('persists per-recipient notices from the submit skip path against the real schema', async () => {
    const result = await svc.submitBreedingDailyLog({
      log_date: '2026-10-20', shift: '早班', house_code: 'H1', company_code: 'COMP-A',
      eggs_produced: 120, mortality_qty: 0,
    });
    expect(result.ledgerSkipped).toBe(true);
    const rows = await notices();
    expect(rows.map((row: { user_id: number }) => row.user_id).sort()).toEqual([7, 9]);
    for (const row of rows as Array<{ biz_no: string }>) expect(row.biz_no).toBe('FARM_LEDGER_PENDING:COMP-A:2026-10-20:H1');
  });

  it('persists the diff notice from the update skip path', async () => {
    const inserted = await db.query(
      `INSERT INTO brd_daily_logs (log_date, house_code, shift, flock_no, company_code, eggs_produced, mortality_qty)
       VALUES ('2026-10-20', 'H1', '早班', 'FLOCK-1', 'COMP-A', 300, 0) RETURNING id`,
    );
    const result = await svc.updateBreedingDailyLog(Number(inserted[0].id), {
      house_code: 'H1', flock_no: 'FLOCK-1', log_date: '2026-10-20', company_code: 'COMP-A',
      eggs_produced: 500, mortality_qty: 0,
    });
    expect(result.ledgerSkipped).toBe(true);
    const rows = await notices();
    expect(rows).toHaveLength(2);
    expect(rows[0].content).toContain('200 枚');
    expect(rows[0].biz_no).toBe('FARM_LEDGER_PENDING:COMP-A:2026-10-20:H1');
  });

  it('keeps exactly one notice per recipient when the same skip fires concurrently', async () => {
    const payload = { log_date: '2026-10-21', shift: '早班', house_code: 'H1', company_code: 'COMP-A', eggs_produced: 80, mortality_qty: 0 };
    // Two concurrent submits of the same (company, date, house): the daily
    // row is upserted by both, and the partial unique index plus ON CONFLICT
    // inference must leave one notice per recipient, never duplicates.
    await Promise.allSettled([
      svc.submitBreedingDailyLog(payload),
      svc.submitBreedingDailyLog(payload),
    ]);
    const rows = await notices();
    expect(rows).toHaveLength(2); // one per recipient (7, 9), no duplicates
    expect(new Set(rows.map((row: { user_id: number }) => row.user_id)).size).toBe(2);
  });

  it('separates notices of two companies sharing one house code', async () => {
    const resultA = await svc.submitBreedingDailyLog({
      log_date: '2026-10-22', shift: '早班', house_code: 'H1', company_code: 'COMP-A',
      eggs_produced: 50, mortality_qty: 0,
    });
    const entityManagerB = { query: jest.fn(async () => []) };
    const svcB = new FarmService(entityManagerB as never, {
      resolveHouse: jest.fn(async () => ({ houseCode: 'H1', farmCode: 'FARM-B', siteCode: 'SITE-B', companyCode: 'COMP-B' })),
    } as never, { resolve } as never);
    (svcB as any).entityManager = (svc as any).entityManager;
    const resultB = await svcB.submitBreedingDailyLog({
      log_date: '2026-10-22', shift: '早班', house_code: 'H1', company_code: 'COMP-B',
      eggs_produced: 60, mortality_qty: 0,
    });
    expect(resultA.ledgerSkipped).toBe(true);
    expect(resultB.ledgerSkipped).toBe(true);
    const rows = await notices();
    expect(rows.map((row: { biz_no: string }) => row.biz_no).sort()).toEqual([
      'FARM_LEDGER_PENDING:COMP-A:2026-10-22:H1',
      'FARM_LEDGER_PENDING:COMP-B:2026-10-22:H1',
      'FARM_LEDGER_PENDING:COMP-A:2026-10-22:H1',
      'FARM_LEDGER_PENDING:COMP-B:2026-10-22:H1',
    ].sort());
  });
});
