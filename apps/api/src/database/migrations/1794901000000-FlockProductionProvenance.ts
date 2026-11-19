/** @allow-data-dml: DDL-only immutable/overlap trigger event UPDATE OR DELETE is a scanner false positive; up has no business data DML. */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class FlockProductionProvenance1794901000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS brd_egg_day_routes (
      company_code text NOT NULL,house_code text NOT NULL,production_date date NOT NULL,
      entry_mode text NOT NULL CHECK(entry_mode IN ('TEMP_PRODUCTION','PACKAGING')),
      PRIMARY KEY(company_code,house_code,production_date)
    );
    CREATE TABLE IF NOT EXISTS brd_egg_source_receipts (
      company_code text NOT NULL, source_key text NOT NULL, daily_log_id bigint NOT NULL,
      occupancy_id text NOT NULL REFERENCES brd_flock_occupancies(id), house_code text NOT NULL,
      production_date date NOT NULL, quantity integer NOT NULL CHECK(quantity>0), entry_mode text NOT NULL,
      PRIMARY KEY(company_code,source_key)
    );
    CREATE TABLE IF NOT EXISTS inv_flock_source_links (
      id text PRIMARY KEY,batch_no text NOT NULL,daily_log_id bigint NOT NULL,
      occupancy_id text NOT NULL REFERENCES brd_flock_occupancies(id),flock_no text NOT NULL,
      house_code text NOT NULL,company_code text NOT NULL,production_date date NOT NULL,
      source_key text NOT NULL,grading_code text NOT NULL DEFAULT '',
      source_input_qty numeric NOT NULL CHECK(source_input_qty>0),batch_output_qty numeric NOT NULL CHECK(batch_output_qty>0),
      allocated_output_qty numeric CHECK(allocated_output_qty>=0),
      precision text NOT NULL CHECK(precision IN ('EXACT','RELATED_INPUT','INHERITED')),
      source_profile_snapshot jsonb NOT NULL,origin_batch_no text NOT NULL,
      UNIQUE(batch_no,daily_log_id,source_key,grading_code)
    );
    CREATE INDEX IF NOT EXISTS ix_inv_flock_source_batch ON inv_flock_source_links(batch_no);
    CREATE INDEX IF NOT EXISTS ix_inv_flock_source_daily ON inv_flock_source_links(daily_log_id);
    DROP TRIGGER IF EXISTS flock_source_links_immutable ON inv_flock_source_links;
    CREATE TRIGGER flock_source_links_immutable BEFORE UPDATE OR DELETE ON inv_flock_source_links
      FOR EACH ROW EXECUTE FUNCTION phoenix_flock_immutable();
    DROP TRIGGER IF EXISTS flock_source_receipts_immutable ON brd_egg_source_receipts;
    CREATE TRIGGER flock_source_receipts_immutable BEFORE UPDATE OR DELETE ON brd_egg_source_receipts
      FOR EACH ROW EXECUTE FUNCTION phoenix_flock_immutable();
    DROP TRIGGER IF EXISTS flock_egg_routes_immutable ON brd_egg_day_routes;
    CREATE TRIGGER flock_egg_routes_immutable BEFORE UPDATE OR DELETE ON brd_egg_day_routes
      FOR EACH ROW EXECUTE FUNCTION phoenix_flock_immutable()`);
  }
  public async down(q: QueryRunner): Promise<void> {
    for(const table of ['inv_flock_source_links','brd_egg_source_receipts','brd_egg_day_routes']) {
      if(await q.hasTable(table)) {
        const [r]=await q.query(`SELECT COUNT(*)::integer AS n FROM "${table}"`);
        if(r.n) throw new Error(`Production provenance has facts in ${table}; reviewed recovery required`);
      }
    }
    await q.query('DROP TABLE IF EXISTS inv_flock_source_links; DROP TABLE IF EXISTS brd_egg_source_receipts; DROP TABLE IF EXISTS brd_egg_day_routes');
  }
}
