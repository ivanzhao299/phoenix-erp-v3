import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 修 chanjet_ar_snapshot.dept_code = NULL 导致唯一约束失效 → 历史重复
 *
 * Why: uq_chanjet_ar_v2(bookid, period, dept_code, assistant_customer_code, subject_id)
 *      因 PG 的 NULL ≠ NULL,dept_code IS NULL 时同往来单位+科目可无限重复
 *      生产端已出现 32 行真实数据 + N 份历史副本(用户截图 64 行)
 *
 * Fix: dept_code NULL → ''(空串占位),改 NOT NULL DEFAULT '';先按 5 字段
 *      只保留 MAX(id) 的那行清重复,再 ALTER 列。
 *
 * 不写好业财(铁律遵守);只清 ERP 自己的快照表残留。
 */
export class FixChanjetArDeptCodeNotNull1781835697682 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) NULL → ''
    await queryRunner.query(`
      UPDATE chanjet_ar_snapshot
      SET dept_code = ''
      WHERE dept_code IS NULL
    `);

    // 2) 按 5 字段去重:同 (bookid, period, dept_code, assistant_customer_code, subject_id)
    //    只保留 id 最大(即最新)的行
    await queryRunner.query(`
      DELETE FROM chanjet_ar_snapshot a
      USING chanjet_ar_snapshot b
      WHERE a.id < b.id
        AND a.bookid = b.bookid
        AND a.period = b.period
        AND a.dept_code = b.dept_code
        AND COALESCE(a.assistant_customer_code, '') = COALESCE(b.assistant_customer_code, '')
        AND COALESCE(a.subject_id, '') = COALESCE(b.subject_id, '')
    `);

    // 3) ALTER 列 NOT NULL DEFAULT ''
    await queryRunner.query(`
      ALTER TABLE chanjet_ar_snapshot
        ALTER COLUMN dept_code SET DEFAULT '',
        ALTER COLUMN dept_code SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chanjet_ar_snapshot
        ALTER COLUMN dept_code DROP NOT NULL,
        ALTER COLUMN dept_code DROP DEFAULT
    `);
    // 不还原已清掉的重复行(无法重建,且本就是垃圾数据)
  }
}
