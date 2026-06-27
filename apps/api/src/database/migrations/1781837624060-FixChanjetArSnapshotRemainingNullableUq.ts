import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: 清 NULL→'' 占位 + 去重(NOT NULL 前置必需)
 *
 * g198-P0-1 — 收紧 chanjet_ar_snapshot 唯一约束剩余 nullable 列
 *
 * Why: 上一版只修 dept_code(1781835697682),但 uq_chanjet_ar_v2 还含
 * assistant_customer_code / subject_id 两列,仍 nullable → PG NULL ≠ NULL
 * 规则下唯一约束实际只对"三列都非 NULL"行有效。subject_id 写入路径有
 * `r.subjectId ? ... : null` 漏洞,理论可残留。
 *
 * Fix: 与 dept_code 同方案 — 列 NULL → '',去重保留 MAX(id),ALTER NOT NULL
 * DEFAULT ''。铁律遵守:不写好业财,只修 ERP 自己快照表。
 */
export class FixChanjetArSnapshotRemainingNullableUq1781837624060 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ⚠ 顺序:先去重(NULL 视作 '')→ UPDATE → ALTER。与上一迁移同模式。
    //   此时 dept_code 已 NOT NULL(上一迁移已落),只对 customer/subject COALESCE。

    // 1) 去重
    await queryRunner.query(`
      DELETE FROM chanjet_ar_snapshot a
      USING chanjet_ar_snapshot b
      WHERE a.id < b.id
        AND a.bookid = b.bookid
        AND a.period = b.period
        AND a.dept_code = b.dept_code
        AND COALESCE(a.assistant_customer_code, '') = COALESCE(b.assistant_customer_code, '')
        AND COALESCE(a.subject_id, '')              = COALESCE(b.subject_id, '')
    `);

    // 2) NULL → ''
    await queryRunner.query(`
      UPDATE chanjet_ar_snapshot
      SET assistant_customer_code = COALESCE(assistant_customer_code, ''),
          subject_id              = COALESCE(subject_id, '')
      WHERE assistant_customer_code IS NULL OR subject_id IS NULL
    `);

    // 3) ALTER
    await queryRunner.query(`
      ALTER TABLE chanjet_ar_snapshot
        ALTER COLUMN assistant_customer_code SET DEFAULT '',
        ALTER COLUMN assistant_customer_code SET NOT NULL,
        ALTER COLUMN subject_id              SET DEFAULT '',
        ALTER COLUMN subject_id              SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chanjet_ar_snapshot
        ALTER COLUMN assistant_customer_code DROP NOT NULL,
        ALTER COLUMN assistant_customer_code DROP DEFAULT,
        ALTER COLUMN subject_id              DROP NOT NULL,
        ALTER COLUMN subject_id              DROP DEFAULT
    `);
  }
}
