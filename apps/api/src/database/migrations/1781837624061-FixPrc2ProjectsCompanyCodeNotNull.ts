import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: 清 company_code NULL→'' 占位 + 去重(NOT NULL 前置必需)
 *
 * g198-P0-2 — 修 prc2_projects.company_code nullable 让 uq_prc2_projects_company_project 真生效
 *
 * Why: @Unique('uq_prc2_projects_company_project', ['companyCode', 'projectCode'])
 * 但 company_code nullable。PG NULL ≠ NULL → company_code IS NULL 时同 projectCode
 * 可无限重复(NULL, 'P-001') 任意行数。
 *
 * 用户 2026-06-19 拍板:不许无公司项目。所以 NOT NULL DEFAULT ''(配 DTO 校验拒空)。
 *
 * 同表 idx_prc2_proj_company 已经用了 partial 但 uq 没用,这次直接堵列层而非改 uq。
 */
export class FixPrc2ProjectsCompanyCodeNotNull1781837624061 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) NULL → ''(占位,与 chanjet 一致用 '' 而非 '__NA__')
    await queryRunner.query(`
      UPDATE prc2_projects
      SET company_code = ''
      WHERE company_code IS NULL
    `);

    // 2) 去重:同 (company_code, project_code) 保留 MAX(id) 的行
    await queryRunner.query(`
      DELETE FROM prc2_projects a
      USING prc2_projects b
      WHERE a.id < b.id
        AND a.company_code = b.company_code
        AND a.project_code = b.project_code
    `);

    // 3) ALTER NOT NULL DEFAULT ''
    await queryRunner.query(`
      ALTER TABLE prc2_projects
        ALTER COLUMN company_code SET DEFAULT '',
        ALTER COLUMN company_code SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE prc2_projects
        ALTER COLUMN company_code DROP NOT NULL,
        ALTER COLUMN company_code DROP DEFAULT
    `);
  }
}
