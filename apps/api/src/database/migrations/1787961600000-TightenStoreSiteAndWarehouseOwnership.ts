/**
 * @allow-data-dml: alias_type SITE -> STORE_SITE is a schema-enum compatibility conversion.
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class TightenStoreSiteAndWarehouseOwnership1787961600000 implements MigrationInterface {
  name = 'TightenStoreSiteAndWarehouseOwnership1787961600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE store_aliases DROP CONSTRAINT IF EXISTS chk_store_alias_type`);
    await queryRunner.query(`ALTER TABLE store_aliases ADD CONSTRAINT chk_store_alias_type
      CHECK (alias_type IN ('STORE_SITE','LEGACY_STORE_CODE')) NOT VALID`);
    await queryRunner.query(`UPDATE store_aliases SET alias_type='STORE_SITE' WHERE alias_type='SITE'`);
    await queryRunner.query(`ALTER TABLE store_aliases VALIDATE CONSTRAINT chk_store_alias_type`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_store_alias_active_store_site_by_store
      ON store_aliases(store_id) WHERE alias_type='STORE_SITE' AND status='ACTIVE'`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_store_alias_active_store_site_by_site
      ON store_aliases(alias_code) WHERE alias_type='STORE_SITE' AND status='ACTIVE'`);

    await queryRunner.query(`CREATE OR REPLACE FUNCTION enforce_store_site_alias() RETURNS trigger AS $$
      BEGIN
        IF NEW.alias_type='STORE_SITE' AND NEW.status='ACTIVE' AND NOT EXISTS (
          SELECT 1
            FROM store_master s
            JOIN sys_organizations o ON o.org_code=NEW.alias_code
           WHERE s.id=NEW.store_id
             AND o.org_type='SITE'
             AND o.site_business_type='STORE'
             AND o.status='ACTIVE'
             AND o.company_code=s.company_code
        ) THEN
          RAISE EXCEPTION 'STORE_SITE alias requires ACTIVE STORE SITE in the same company';
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_store_site_alias ON store_aliases`);
    await queryRunner.query(`CREATE TRIGGER trg_store_site_alias
      BEFORE INSERT OR UPDATE OF store_id,alias_type,alias_code,status ON store_aliases
      FOR EACH ROW EXECUTE FUNCTION enforce_store_site_alias()`);

    await queryRunner.query(`ALTER TABLE wms_warehouses ADD COLUMN IF NOT EXISTS owner_store_id BIGINT NULL`);
    await queryRunner.query(`ALTER TABLE wms_warehouses DROP CONSTRAINT IF EXISTS fk_wms_warehouse_owner_store`);
    await queryRunner.query(`ALTER TABLE wms_warehouses ADD CONSTRAINT fk_wms_warehouse_owner_store
      FOREIGN KEY (owner_store_id) REFERENCES store_master(id) ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_wms_warehouse_owner_store
      ON wms_warehouses(owner_store_id) WHERE owner_store_id IS NOT NULL`);
    await queryRunner.query(`CREATE OR REPLACE FUNCTION enforce_warehouse_owner_store() RETURNS trigger AS $$
      BEGIN
        IF NEW.owner_store_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM store_master s
           WHERE s.id=NEW.owner_store_id AND s.status='ACTIVE' AND s.company_code=NEW.company_code
        ) THEN
          RAISE EXCEPTION 'warehouse owner store must be ACTIVE and belong to the same company';
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_warehouse_owner_store ON wms_warehouses`);
    await queryRunner.query(`CREATE TRIGGER trg_warehouse_owner_store
      BEFORE INSERT OR UPDATE OF owner_store_id,company_code ON wms_warehouses
      FOR EACH ROW EXECUTE FUNCTION enforce_warehouse_owner_store()`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_warehouse_owner_store ON wms_warehouses`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS enforce_warehouse_owner_store()`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_wms_warehouse_owner_store`);
    await queryRunner.query(`ALTER TABLE wms_warehouses DROP CONSTRAINT IF EXISTS fk_wms_warehouse_owner_store`);
    await queryRunner.query(`ALTER TABLE wms_warehouses DROP COLUMN IF EXISTS owner_store_id`);

    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_store_site_alias ON store_aliases`);
    await queryRunner.query(`CREATE OR REPLACE FUNCTION enforce_store_site_alias() RETURNS trigger AS $$
      BEGIN IF NEW.alias_type='SITE' AND NOT EXISTS (
        SELECT 1 FROM sys_organizations o
         WHERE o.org_code=NEW.alias_code AND o.org_type='SITE' AND o.status='ACTIVE'
      ) THEN RAISE EXCEPTION 'SITE alias requires ACTIVE canonical SITE'; END IF;
      RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_store_alias_active_store_site_by_site`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_store_alias_active_store_site_by_store`);
    await queryRunner.query(`ALTER TABLE store_aliases DROP CONSTRAINT IF EXISTS chk_store_alias_type`);
    await queryRunner.query(`UPDATE store_aliases SET alias_type='SITE' WHERE alias_type='STORE_SITE'`);
    await queryRunner.query(`ALTER TABLE store_aliases ADD CONSTRAINT chk_store_alias_type
      CHECK (alias_type IN ('SITE','LEGACY_STORE_CODE'))`);
    await queryRunner.query(`CREATE TRIGGER trg_store_site_alias
      BEFORE INSERT OR UPDATE OF alias_type,alias_code,status ON store_aliases
      FOR EACH ROW WHEN (NEW.status='ACTIVE') EXECUTE FUNCTION enforce_store_site_alias()`);
  }
}
