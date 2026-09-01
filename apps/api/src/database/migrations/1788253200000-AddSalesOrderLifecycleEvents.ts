/**
 * @allow-data-dml: seed override permission and one truthful MIGRATED_SNAPSHOT baseline per existing order
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSalesOrderLifecycleEvents1788253200000 implements MigrationInterface {
  name = 'AddSalesOrderLifecycleEvents1788253200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sal_order_lifecycle_events (
        id BIGSERIAL PRIMARY KEY,
        event_id UUID NOT NULL,
        sales_order_id BIGINT NOT NULL REFERENCES sal_sales_orders(id),
        order_no VARCHAR(80) NOT NULL,
        event_type VARCHAR(64) NOT NULL,
        from_status VARCHAR(32),
        to_status VARCHAR(32),
        actor_user_id VARCHAR(100),
        actor_name VARCHAR(200),
        actor_type VARCHAR(20) NOT NULL,
        reason_code VARCHAR(64),
        comment TEXT,
        source_endpoint VARCHAR(300),
        source_module VARCHAR(40) NOT NULL,
        source_ref_type VARCHAR(40),
        source_ref_id VARCHAR(100),
        source_ref_no VARCHAR(100),
        request_id VARCHAR(100),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_sal_order_lifecycle_event_id UNIQUE (event_id),
        CONSTRAINT ck_sal_order_lifecycle_actor_type CHECK
          (actor_type IN ('USER','WORKFLOW','SYSTEM','MOBILE','INTEGRATION'))
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_sal_order_lifecycle_order_time ON sal_order_lifecycle_events(sales_order_id, occurred_at, id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_sal_order_lifecycle_source ON sal_order_lifecycle_events(source_ref_type, source_ref_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_sal_order_lifecycle_order_no_time ON sal_order_lifecycle_events(order_no, occurred_at)`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_ar_sales_order_source
      ON fin_ar_invoices(source_type, source_id)
      WHERE source_type='SALES_ORDER' AND source_id IS NOT NULL
    `);

    await queryRunner.query(`
      INSERT INTO sal_order_lifecycle_events (
        event_id,sales_order_id,order_no,event_type,to_status,actor_type,
        source_module,metadata,occurred_at,created_at
      )
      SELECT md5('sales-order-migrated-snapshot:' || so.id::text)::uuid,
             so.id,so.order_no,'MIGRATED_SNAPSHOT',so.status,'SYSTEM',
             'SALES_ORDER',jsonb_build_object('historicalDetailAvailable',false),NOW(),NOW()
      FROM sal_sales_orders so
      ON CONFLICT (event_id) DO NOTHING
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_sal_order_lifecycle_event_mutation()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'sal_order_lifecycle_events is append-only';
      END $$
    `);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_sal_order_lifecycle_events_append_only ON sal_order_lifecycle_events`);
    await queryRunner.query(`
      CREATE TRIGGER trg_sal_order_lifecycle_events_append_only
      BEFORE UPDATE OR DELETE ON sal_order_lifecycle_events
      FOR EACH ROW EXECUTE FUNCTION prevent_sal_order_lifecycle_event_mutation()
    `);
    await queryRunner.query(`REVOKE UPDATE, DELETE ON sal_order_lifecycle_events FROM PUBLIC`);

    await queryRunner.query(`
      INSERT INTO sys_menu (menu_code, menu_name_zh, domain, parent_code, route, sort_order)
      VALUES ('MENU_SALES2_ORDER_OVERRIDE', '销售订单人工纠偏', 'SALES', 'MENU_SALES2_ORDER', NULL, 990)
      ON CONFLICT (menu_code) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
      SELECT p.role_id, override_menu.menu_id, 'A'
      FROM sys_role_menu_permission p
      JOIN sys_menu order_menu ON order_menu.menu_id=p.menu_id AND order_menu.menu_code='MENU_SALES2_ORDER'
      CROSS JOIN sys_menu override_menu
      WHERE override_menu.menu_code='MENU_SALES2_ORDER_OVERRIDE'
        AND ('A'=ANY(string_to_array(p.perm_codes, ',')) OR p.role_id IN (
          SELECT role_id FROM sys_role WHERE role_code IN ('ROLE_ADMIN','ROLE_SALES_MGR')
        ))
      ON CONFLICT (role_id, menu_id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM sys_role_menu_permission WHERE menu_id IN (SELECT menu_id FROM sys_menu WHERE menu_code='MENU_SALES2_ORDER_OVERRIDE')`);
    await queryRunner.query(`DELETE FROM sys_menu WHERE menu_code='MENU_SALES2_ORDER_OVERRIDE'`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_sal_order_lifecycle_events_append_only ON sal_order_lifecycle_events`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS prevent_sal_order_lifecycle_event_mutation()`);
    await queryRunner.query(`DROP TABLE IF EXISTS sal_order_lifecycle_events`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_fin_ar_sales_order_source`);
  }
}
