import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: CREATE OR REPLACE FUNCTION(非数据 DML;函数体含 TG_OP='UPDATE' 文本仅为触发器逻辑)
 *
 * 修复:biz_projects 状态流转(submit/freeze/restore/archive)对 admin 也失败(500)。
 * 根因:20260605_mdm1_01_biz_projects.sql 的 fn_biz_projects_check_company 在
 *   BEFORE INSERT OR UPDATE 每次都校验 NEW.company_code 必须是 ACTIVE COMPANY。
 *   纯状态流转的 UPDATE 不改 company_code,但触发器仍校验 → 公司一旦被冻结/归档/编码漂移,
 *   其下项目任何状态流转永久锁死。与权限无关(admin 同样中招)。
 * 修法:仅在 INSERT 或 company_code 实际变化时才校验公司有效性;纯状态/字段流转放行。
 *   符合"project_code/公司归属一经发布,只在改挂公司时才校验公司有效性"的本意。
 */
export class FixBizProjectsCompanyTrigger1782056418112 implements MigrationInterface {
  name = 'FixBizProjectsCompanyTrigger1782056418112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_biz_projects_check_company() RETURNS TRIGGER AS $$
      BEGIN
        -- 纯状态/字段流转(未改 company_code)的 UPDATE 不再校验公司当前是否 ACTIVE,
        -- 否则公司被冻结/归档/编码漂移后项目状态永久锁死。仅 INSERT 或改挂公司时校验。
        IF TG_OP = 'UPDATE' AND NEW.company_code IS NOT DISTINCT FROM OLD.company_code THEN
          RETURN NEW;
        END IF;
        IF NEW.company_code IS NULL THEN
          RAISE EXCEPTION 'biz_projects.company_code 不能为空';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM sys_organizations
           WHERE org_code = NEW.company_code AND org_type = 'COMPANY' AND status = 'ACTIVE'
        ) THEN
          RAISE EXCEPTION 'biz_projects.company_code=% 在 sys_organizations 中无对应 COMPANY (ACTIVE)', NEW.company_code;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 还原为原始严格版(每次 INSERT/UPDATE 都校验)
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_biz_projects_check_company() RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.company_code IS NULL THEN
          RAISE EXCEPTION 'biz_projects.company_code 不能为空';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM sys_organizations
           WHERE org_code = NEW.company_code AND org_type = 'COMPANY' AND status = 'ACTIVE'
        ) THEN
          RAISE EXCEPTION 'biz_projects.company_code=% 在 sys_organizations 中无对应 COMPANY (ACTIVE)', NEW.company_code;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
  }
}
