import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: V1-3 新菜单及标准角色的最小权限种子，业务单据不做任何回填
 */
export class CreateStoreReplenishmentOrchestration1788134400000 implements MigrationInterface {
  name = 'CreateStoreReplenishmentOrchestration1788134400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE store_replenishment_requests (
        id BIGSERIAL PRIMARY KEY,
        request_no VARCHAR(64) NOT NULL UNIQUE,
        store_id BIGINT NOT NULL REFERENCES store_master(id),
        company_code VARCHAR(64) NOT NULL,
        target_warehouse_code VARCHAR(64) NOT NULL REFERENCES wms_warehouses(warehouse_code),
        source_warehouse_code VARCHAR(64) REFERENCES wms_warehouses(warehouse_code),
        requested_date DATE NOT NULL DEFAULT CURRENT_DATE,
        urgency VARCHAR(16) NOT NULL DEFAULT 'NORMAL' CHECK (urgency IN ('NORMAL','URGENT')),
        status VARCHAR(32) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','DISPATCHED','RECEIVED','CLOSED','REJECTED','CANCELLED')),
        reason TEXT NOT NULL DEFAULT '',
        requested_by VARCHAR(128) NOT NULL,
        submitted_at TIMESTAMPTZ,
        approved_by VARCHAR(128),
        approved_at TIMESTAMPTZ,
        transfer_no VARCHAR(64) REFERENCES wms_transfer(transfer_no),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE store_replenishment_request_lines (
        id BIGSERIAL PRIMARY KEY,
        request_id BIGINT NOT NULL REFERENCES store_replenishment_requests(id) ON DELETE CASCADE,
        sku_code VARCHAR(64) NOT NULL,
        sku_name VARCHAR(256) NOT NULL DEFAULT '',
        requested_qty NUMERIC(18,3) NOT NULL CHECK (requested_qty > 0),
        approved_qty NUMERIC(18,3) NOT NULL DEFAULT 0 CHECK (approved_qty >= 0),
        received_qty NUMERIC(18,3) NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
        remark TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_store_replenishment_request_sku UNIQUE (request_id, sku_code)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_store_replenishment_store_status ON store_replenishment_requests(store_id,status,created_at DESC)`);
    await queryRunner.query(`CREATE INDEX idx_store_replenishment_target_status ON store_replenishment_requests(target_warehouse_code,status)`);
    await queryRunner.query(`CREATE INDEX idx_store_replenishment_transfer ON store_replenishment_requests(transfer_no) WHERE transfer_no IS NOT NULL`);

    await queryRunner.query(`
      INSERT INTO sys_menu (menu_code,menu_name_zh,domain,parent_code,route,sort_order)
      VALUES ('MENU_STORE_REPLENISH','补货编排','STORE','MENU_STORE_MGR','/store/replenish',25)
      ON CONFLICT (menu_code) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO sys_role_menu_permission (role_id,menu_id,perm_codes)
      SELECT r.role_id,m.menu_id,v.perm_codes
      FROM (VALUES
        ('ROLE_STORE_MGR','V,C,E'),
        ('ROLE_WMS_OP','V,A,E'),
        ('ROLE_WMS_MGR','V,A,E')
      ) AS v(role_code,perm_codes)
      JOIN sys_role r ON r.role_code=v.role_code
      JOIN sys_menu m ON m.menu_code='MENU_STORE_REPLENISH'
      ON CONFLICT (role_id,menu_id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM sys_role_menu_permission WHERE menu_id IN (SELECT menu_id FROM sys_menu WHERE menu_code='MENU_STORE_REPLENISH')`);
    await queryRunner.query(`DELETE FROM sys_menu WHERE menu_code='MENU_STORE_REPLENISH'`);
    await queryRunner.query(`DROP TABLE IF EXISTS store_replenishment_request_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS store_replenishment_requests`);
  }
}
