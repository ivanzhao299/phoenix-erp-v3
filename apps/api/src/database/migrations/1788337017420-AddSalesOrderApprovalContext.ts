/**
 * @allow-data-dml: deploy two disabled SALES_ORDER example rules; activation remains an explicit administrator action
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSalesOrderApprovalContext1788337017420 implements MigrationInterface {
  name = 'AddSalesOrderApprovalContext1788337017420';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE wf_approval_instances ADD COLUMN IF NOT EXISTS trigger_codes TEXT[] NOT NULL DEFAULT '{}'::text[]`);
    await queryRunner.query(`ALTER TABLE wf_approval_instances ADD COLUMN IF NOT EXISTS context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb`);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE wf_approval_instances ADD CONSTRAINT ck_wf_inst_sales_trigger_codes
          CHECK (biz_type <> 'SALES_ORDER' OR trigger_codes <@ ARRAY['BELOW_FLOOR_PRICE','CREDIT_OVER_LIMIT']::text[]);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_wf_inst_trigger_codes ON wf_approval_instances USING GIN(trigger_codes)`);

    await queryRunner.query(`
      INSERT INTO wf_approval_rules
        (rule_code,module_code,biz_type,min_amount,condition_json,approval_mode,enabled,priority,remark)
      VALUES
        ('SAL_SO_BELOW_FLOOR_EXAMPLE','MENU_SALES2_ORDER','SALES_ORDER',0,
         '{"triggerCodesAny":["BELOW_FLOOR_PRICE"]}'::jsonb,'SEQUENTIAL',FALSE,100,
         '低于底价审批示例；部署后保持停用，须管理员核对审批人后激活'),
        ('SAL_SO_CREDIT_OVER_LIMIT_EXAMPLE','MENU_SALES2_ORDER','SALES_ORDER',0,
         '{"triggerCodesAny":["CREDIT_OVER_LIMIT"]}'::jsonb,'SEQUENTIAL',FALSE,110,
         '信用超限审批示例；部署后保持停用，须管理员核对审批人后激活')
      ON CONFLICT (rule_code) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO wf_approval_rule_steps
        (rule_id,step_no,approver_type,approver_role,required_approval_count,allow_admin_override,
         sla_hours,reminder_interval_hours,max_reminders,escalation_enabled)
      SELECT r.id,1,'ROLE','ROLE_SALES_MGR',1,FALSE,48,12,3,FALSE
      FROM wf_approval_rules r
      WHERE r.rule_code IN ('SAL_SO_BELOW_FLOOR_EXAMPLE','SAL_SO_CREDIT_OVER_LIMIT_EXAMPLE')
        AND NOT EXISTS (
          SELECT 1 FROM wf_approval_rule_steps s WHERE s.rule_id=r.id AND s.step_no=1
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM wf_approval_rule_steps s USING wf_approval_rules r
      WHERE s.rule_id=r.id
        AND r.enabled=FALSE
        AND r.rule_code IN ('SAL_SO_BELOW_FLOOR_EXAMPLE','SAL_SO_CREDIT_OVER_LIMIT_EXAMPLE')
    `);
    await queryRunner.query(`
      DELETE FROM wf_approval_rules
      WHERE enabled=FALSE AND rule_code IN ('SAL_SO_BELOW_FLOOR_EXAMPLE','SAL_SO_CREDIT_OVER_LIMIT_EXAMPLE')
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_wf_inst_trigger_codes`);
    await queryRunner.query(`ALTER TABLE wf_approval_instances DROP CONSTRAINT IF EXISTS ck_wf_inst_sales_trigger_codes`);
    await queryRunner.query(`ALTER TABLE wf_approval_instances DROP COLUMN IF EXISTS context_snapshot`);
    await queryRunner.query(`ALTER TABLE wf_approval_instances DROP COLUMN IF EXISTS trigger_codes`);
  }
}
