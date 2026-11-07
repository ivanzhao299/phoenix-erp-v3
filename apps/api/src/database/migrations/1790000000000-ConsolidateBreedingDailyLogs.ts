import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: 合并历史多班次日报为 DAILY，并保留可回滚快照。
 */
export class ConsolidateBreedingDailyLogs1790000000000 implements MigrationInterface {
  name = 'ConsolidateBreedingDailyLogs1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.startTransaction();
    try {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS brd_daily_logs_498_499_backup (
          id integer PRIMARY KEY,
          row_data jsonb NOT NULL
        )
      `);
      await queryRunner.query(`
        INSERT INTO brd_daily_logs_498_499_backup (id, row_data)
        SELECT id, to_jsonb(d)
        FROM brd_daily_logs d
        ON CONFLICT (id) DO NOTHING
      `);
      await queryRunner.query(`
        WITH ranked AS (
          SELECT id,
                 FIRST_VALUE(id) OVER (
                   PARTITION BY log_date, house_code
                   ORDER BY CASE WHEN shift = 'DAILY' THEN 0 ELSE 1 END, id
                 ) AS survivor_id
          FROM brd_daily_logs
        ), totals AS (
          SELECT r.survivor_id,
                 COALESCE(SUM(COALESCE(d.eggs_produced, 0)), 0)::int AS eggs_produced,
                 COALESCE(SUM(COALESCE(d.good_eggs, 0)), 0)::int AS good_eggs,
                 COALESCE(SUM(COALESCE(d.broken_eggs, 0)), 0)::int AS broken_eggs,
                 COALESCE(SUM(COALESCE(d.dirty_eggs, 0)), 0)::int AS dirty_eggs,
                 COALESCE(SUM(COALESCE(d.bad_eggs, 0)), 0)::int AS bad_eggs,
                 COALESCE(SUM(COALESCE(d.mortality_qty, 0)), 0)::int AS mortality_qty,
                 COALESCE(SUM(COALESCE(d.elimination_qty, 0)), 0)::int AS elimination_qty,
                 COALESCE(SUM(COALESCE(d.feed_consumed, 0)), 0) AS feed_consumed,
                 COALESCE(SUM(COALESCE(d.water_consumed, 0)), 0) AS water_consumed,
                 COALESCE((
                   SELECT jsonb_object_agg(e.key, e.qty)
                   FROM (
                     SELECT e.key, SUM((e.value #>> '{}')::numeric) AS qty
                     FROM brd_daily_logs x
                     JOIN ranked rx ON rx.id = x.id
                     CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(x.eggs_by_grade) = 'object' THEN x.eggs_by_grade ELSE '{}'::jsonb END) e
                     WHERE rx.survivor_id = r.survivor_id
                     GROUP BY e.key
                   ) e
                 ), '{}'::jsonb) AS eggs_by_grade
          FROM brd_daily_logs d
          JOIN ranked r ON r.id = d.id
          GROUP BY r.survivor_id
        )
        UPDATE brd_daily_logs d
           SET shift = 'DAILY',
               eggs_produced = t.eggs_produced,
               good_eggs = t.good_eggs,
               broken_eggs = t.broken_eggs,
               dirty_eggs = t.dirty_eggs,
               bad_eggs = t.bad_eggs,
               mortality_qty = t.mortality_qty,
               elimination_qty = t.elimination_qty,
               feed_consumed = t.feed_consumed,
               water_consumed = t.water_consumed,
               eggs_by_grade = t.eggs_by_grade,
               updated_at = CURRENT_TIMESTAMP
          FROM totals t
         WHERE d.id = t.survivor_id
      `);
      await queryRunner.query(`
        DELETE FROM brd_daily_logs d
        USING (
          SELECT id,
                 FIRST_VALUE(id) OVER (
                   PARTITION BY log_date, house_code
                   ORDER BY CASE WHEN shift = 'DAILY' THEN 0 ELSE 1 END, id
                 ) AS survivor_id
          FROM brd_daily_logs
        ) duplicates
        WHERE d.id = duplicates.id
          AND duplicates.id <> duplicates.survivor_id
      `);
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.startTransaction();
    try {
      await queryRunner.query(`DELETE FROM brd_daily_logs WHERE id IN (SELECT id FROM brd_daily_logs_498_499_backup)`);
      await queryRunner.query(`
        INSERT INTO brd_daily_logs
        SELECT (jsonb_populate_record(NULL::brd_daily_logs, row_data)).*
        FROM brd_daily_logs_498_499_backup
      `);
      await queryRunner.query(`DROP TABLE brd_daily_logs_498_499_backup`);
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    }
  }
}
