import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: register WMS issue-outbound dictionaries, atomic menu and least-privilege role grants.
 */
export class AddWmsIssueOutboundGovernance1785200000000 implements MigrationInterface {
  name = 'AddWmsIssueOutboundGovernance1785200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE wms_inbound
        ADD COLUMN IF NOT EXISTS item_name VARCHAR(160),
        ADD COLUMN IF NOT EXISTS item_type VARCHAR(24),
        ADD COLUMN IF NOT EXISTS material_type VARCHAR(48),
        ADD COLUMN IF NOT EXISTS material_code VARCHAR(64),
        ADD COLUMN IF NOT EXISTS sku_code VARCHAR(64),
        ADD COLUMN IF NOT EXISTS unit VARCHAR(24)
    `);
    await queryRunner.query(`
      ALTER TABLE wms_outbound
        ADD COLUMN IF NOT EXISTS item_name VARCHAR(160),
        ADD COLUMN IF NOT EXISTS item_type VARCHAR(24),
        ADD COLUMN IF NOT EXISTS material_type VARCHAR(48),
        ADD COLUMN IF NOT EXISTS material_code VARCHAR(64),
        ADD COLUMN IF NOT EXISTS sku_code VARCHAR(64),
        ADD COLUMN IF NOT EXISTS unit VARCHAR(24),
        ADD COLUMN IF NOT EXISTS destination_code VARCHAR(64),
        ADD COLUMN IF NOT EXISTS destination_warehouse_code VARCHAR(64),
        ADD COLUMN IF NOT EXISTS destination_store_code VARCHAR(64),
        ADD COLUMN IF NOT EXISTS department_code VARCHAR(64),
        ADD COLUMN IF NOT EXISTS project_code VARCHAR(64),
        ADD COLUMN IF NOT EXISTS receiver_username VARCHAR(128),
        ADD COLUMN IF NOT EXISTS purpose_code VARCHAR(64)
    `);
    await queryRunner.query(`
      ALTER TABLE inv_batches
        ADD COLUMN IF NOT EXISTS item_type VARCHAR(24),
        ADD COLUMN IF NOT EXISTS material_type VARCHAR(48),
        ADD COLUMN IF NOT EXISTS material_code VARCHAR(64),
        ADD COLUMN IF NOT EXISTS unit VARCHAR(24)
    `);
    await queryRunner.query(`
      ALTER TABLE inv_ledger
        ADD COLUMN IF NOT EXISTS material_code VARCHAR(64),
        ADD COLUMN IF NOT EXISTS warehouse_code VARCHAR(64),
        ADD COLUMN IF NOT EXISTS company_code VARCHAR(64),
        ADD COLUMN IF NOT EXISTS business_type VARCHAR(48),
        ADD COLUMN IF NOT EXISTS destination_type VARCHAR(32),
        ADD COLUMN IF NOT EXISTS destination_code VARCHAR(64),
        ADD COLUMN IF NOT EXISTS project_code VARCHAR(64),
        ADD COLUMN IF NOT EXISTS department_code VARCHAR(64),
        ADD COLUMN IF NOT EXISTS unit VARCHAR(24)
    `);
    await queryRunner.query(`
      ALTER TABLE wms_inbound
        ALTER COLUMN qty TYPE NUMERIC(14,3) USING qty::numeric(14,3)
    `);
    await queryRunner.query(`
      ALTER TABLE wms_outbound
        ALTER COLUMN qty TYPE NUMERIC(14,3) USING qty::numeric(14,3)
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS IDX_wms_outbound_issue_type ON wms_outbound(type, status, date)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS IDX_wms_outbound_cost_object ON wms_outbound(company_code, project_code, department_code)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS IDX_inv_batches_material_code ON inv_batches(material_code)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS IDX_inv_ledger_business_type ON inv_ledger(business_type, created_at)`);

    await queryRunner.query(`
      INSERT INTO sys_dict
        (dict_type, dict_code, dict_label_zh, dict_label_lo, dict_label_en, dict_value, sort_no, status, name)
      VALUES
        ('INV_OUTBOUND_TYPE','LOGISTICS_USE','后勤领用',NULL,'Logistics Issue','LOGISTICS_USE',60,'ACTIVE','出库类型'),
        ('INV_OUTBOUND_TYPE','SPARE_PART_USE','配件领用',NULL,'Spare Part Issue','SPARE_PART_USE',70,'ACTIVE','出库类型'),
        ('INV_OUTBOUND_TYPE','OFFICE_USE','办公领用',NULL,'Office Issue','OFFICE_USE',80,'ACTIVE','出库类型'),
        ('INV_OUTBOUND_TYPE','MAINTENANCE_USE','维修领用',NULL,'Maintenance Issue','MAINTENANCE_USE',90,'ACTIVE','出库类型'),
        ('INV_OUTBOUND_DEST_TYPE','DEPARTMENT','部门',NULL,'Department','DEPARTMENT',50,'ACTIVE','出库去向'),
        ('INV_OUTBOUND_DEST_TYPE','PROJECT','项目',NULL,'Project','PROJECT',60,'ACTIVE','出库去向'),
        ('INV_OUTBOUND_DEST_TYPE','EMPLOYEE','员工',NULL,'Employee','EMPLOYEE',70,'ACTIVE','出库去向'),
        ('INV_OUTBOUND_DEST_TYPE','SUPPLIER','供应商',NULL,'Supplier','SUPPLIER',80,'ACTIVE','出库去向'),
        ('INV_OUTBOUND_DEST_TYPE','OTHER','其他',NULL,'Other','OTHER',90,'ACTIVE','出库去向')
      ON CONFLICT (dict_type, dict_code) DO UPDATE SET
        dict_label_zh = EXCLUDED.dict_label_zh,
        dict_label_en = EXCLUDED.dict_label_en,
        dict_value = EXCLUDED.dict_value,
        sort_no = EXCLUDED.sort_no,
        status = EXCLUDED.status
    `);

    await queryRunner.query(`
      INSERT INTO sys_menu
        (menu_code, menu_name_zh, menu_name_lo, domain, parent_code, sort_order, icon, route)
      VALUES
        ('MENU_WMS_ISSUE','生产与后勤领用',NULL,'WMS','MENU_WMS',35,'PackageMinus','/warehouse/issues')
      ON CONFLICT (menu_code) DO UPDATE SET
        menu_name_zh = EXCLUDED.menu_name_zh,
        domain = EXCLUDED.domain,
        parent_code = EXCLUDED.parent_code,
        sort_order = EXCLUDED.sort_order,
        icon = EXCLUDED.icon,
        route = EXCLUDED.route
    `);

    await queryRunner.query(`
      INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
      SELECT r.role_id, m.menu_id, v.perm_codes
      FROM (VALUES
        ('ROLE_ADMIN','*'),
        ('ROLE_WMS_MGR','A,C,D,E,V,X'),
        ('ROLE_WMS_OP','C,E,V'),
        ('ROLE_FARM_MGR','C,E,V')
      ) AS v(role_code, perm_codes)
      JOIN sys_role r ON r.role_code = v.role_code
      JOIN sys_menu m ON m.menu_code = 'MENU_WMS_ISSUE'
      ON CONFLICT (role_id, menu_id) DO UPDATE SET perm_codes = EXCLUDED.perm_codes
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const fractionalRows = await queryRunner.query(`
      SELECT
        EXISTS (SELECT 1 FROM wms_inbound WHERE qty <> trunc(qty)) OR
        EXISTS (SELECT 1 FROM wms_outbound WHERE qty <> trunc(qty)) AS has_fractional
    `);
    if (fractionalRows[0]?.has_fractional) {
      throw new Error('Cannot downgrade WMS quantities: fractional inventory documents exist.');
    }

    await queryRunner.query(`
      DELETE FROM sys_role_menu_permission p USING sys_menu m
      WHERE p.menu_id = m.menu_id AND m.menu_code = 'MENU_WMS_ISSUE'
    `);
    await queryRunner.query(`DELETE FROM sys_menu WHERE menu_code = 'MENU_WMS_ISSUE'`);
    await queryRunner.query(`
      DELETE FROM sys_dict
      WHERE (dict_type = 'INV_OUTBOUND_TYPE' AND dict_code IN (
        'LOGISTICS_USE','SPARE_PART_USE','OFFICE_USE','MAINTENANCE_USE'
      )) OR (dict_type = 'INV_OUTBOUND_DEST_TYPE' AND dict_code IN (
        'DEPARTMENT','PROJECT','EMPLOYEE','SUPPLIER','OTHER'
      ))
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_inv_ledger_business_type`);
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_inv_batches_material_code`);
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_wms_outbound_cost_object`);
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_wms_outbound_issue_type`);
    await queryRunner.query(`ALTER TABLE wms_inbound ALTER COLUMN qty TYPE INTEGER USING qty::integer`);
    await queryRunner.query(`ALTER TABLE wms_outbound ALTER COLUMN qty TYPE INTEGER USING qty::integer`);
    await queryRunner.query(`
      ALTER TABLE inv_ledger
        DROP COLUMN IF EXISTS unit,
        DROP COLUMN IF EXISTS department_code,
        DROP COLUMN IF EXISTS project_code,
        DROP COLUMN IF EXISTS destination_code,
        DROP COLUMN IF EXISTS destination_type,
        DROP COLUMN IF EXISTS business_type,
        DROP COLUMN IF EXISTS company_code,
        DROP COLUMN IF EXISTS warehouse_code,
        DROP COLUMN IF EXISTS material_code
    `);
    await queryRunner.query(`
      ALTER TABLE inv_batches
        DROP COLUMN IF EXISTS unit,
        DROP COLUMN IF EXISTS material_code,
        DROP COLUMN IF EXISTS material_type,
        DROP COLUMN IF EXISTS item_type
    `);
    await queryRunner.query(`
      ALTER TABLE wms_outbound
        DROP COLUMN IF EXISTS purpose_code,
        DROP COLUMN IF EXISTS receiver_username,
        DROP COLUMN IF EXISTS project_code,
        DROP COLUMN IF EXISTS department_code,
        DROP COLUMN IF EXISTS destination_store_code,
        DROP COLUMN IF EXISTS destination_warehouse_code,
        DROP COLUMN IF EXISTS destination_code,
        DROP COLUMN IF EXISTS unit,
        DROP COLUMN IF EXISTS sku_code,
        DROP COLUMN IF EXISTS material_code,
        DROP COLUMN IF EXISTS material_type,
        DROP COLUMN IF EXISTS item_type,
        DROP COLUMN IF EXISTS item_name
    `);
    await queryRunner.query(`
      ALTER TABLE wms_inbound
        DROP COLUMN IF EXISTS unit,
        DROP COLUMN IF EXISTS sku_code,
        DROP COLUMN IF EXISTS material_code,
        DROP COLUMN IF EXISTS material_type,
        DROP COLUMN IF EXISTS item_type,
        DROP COLUMN IF EXISTS item_name
    `);
  }
}
