/** @allow-data-dml: DDL-only immutable/overlap trigger event UPDATE OR DELETE is a scanner false positive; up has no business data DML. */
import { MigrationInterface,QueryRunner } from 'typeorm';
export class FlockActivitySources1794902000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS brd_flock_admission_receipts (
      company_code text NOT NULL,source_kind text NOT NULL,receipt_reference text NOT NULL,document_id text NOT NULL UNIQUE REFERENCES brd_flock_documents(id),
      quantity integer NOT NULL CHECK(quantity>0),PRIMARY KEY(company_code,source_kind,receipt_reference)
    );
    CREATE TABLE IF NOT EXISTS brd_flock_activity_sources (
      activity_type text NOT NULL,activity_id text NOT NULL,occupancy_id text NOT NULL REFERENCES brd_flock_occupancies(id),
      flock_no text NOT NULL,house_code text NOT NULL,farm_code text NOT NULL,site_code text NOT NULL DEFAULT '',company_code text NOT NULL,
      business_date date NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(activity_type,activity_id)
    );
    CREATE TABLE IF NOT EXISTS brd_flock_sales_settlements (
      document_id text PRIMARY KEY REFERENCES brd_flock_documents(id),held_id text NOT NULL REFERENCES brd_flock_held_balances(id),
      company_code text NOT NULL,customer_code text NOT NULL,currency_code text NOT NULL,quantity integer NOT NULL CHECK(quantity>0),
      unit_price numeric(18,6) NOT NULL CHECK(unit_price>0),amount numeric(18,2) NOT NULL CHECK(amount>0),
      receipt_reference text NOT NULL,finance_status text NOT NULL DEFAULT 'PENDING_FINANCE',created_at timestamptz NOT NULL DEFAULT now()
    );
    DROP TRIGGER IF EXISTS flock_activity_immutable ON brd_flock_activity_sources;
    CREATE TRIGGER flock_activity_immutable BEFORE UPDATE OR DELETE ON brd_flock_activity_sources
      FOR EACH ROW EXECUTE FUNCTION phoenix_flock_immutable();
    DROP TRIGGER IF EXISTS flock_sales_settlement_immutable ON brd_flock_sales_settlements;
    CREATE TRIGGER flock_sales_settlement_immutable BEFORE UPDATE OR DELETE ON brd_flock_sales_settlements
      FOR EACH ROW EXECUTE FUNCTION phoenix_flock_immutable()`);
  }
  async down(q: QueryRunner): Promise<void> {
    for(const t of ['brd_flock_activity_sources','brd_flock_sales_settlements','brd_flock_admission_receipts']) if(await q.hasTable(t)) {
      const [r]=await q.query(`SELECT COUNT(*)::integer AS n FROM "${t}"`);
      if(r.n) throw new Error(`Flock activities contain facts in ${t}; recovery required`);
    }
    await q.query('DROP TABLE IF EXISTS brd_flock_sales_settlements; DROP TABLE IF EXISTS brd_flock_activity_sources; DROP TABLE IF EXISTS brd_flock_admission_receipts');
  }
}
