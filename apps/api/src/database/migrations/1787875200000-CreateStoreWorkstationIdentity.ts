import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStoreWorkstationIdentity1787875200000 implements MigrationInterface {
  name = 'CreateStoreWorkstationIdentity1787875200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS store_master (
      id BIGSERIAL PRIMARY KEY, store_code VARCHAR(64) NOT NULL,
      store_name VARCHAR(128) NOT NULL, company_code VARCHAR(64) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE', timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
      business_day_cutoff TIME NOT NULL DEFAULT '00:00:00', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_store_master_code UNIQUE(store_code),
      CONSTRAINT chk_store_master_status CHECK (status IN ('ACTIVE','INACTIVE'))
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_store_master_company ON store_master(company_code)`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS store_aliases (
      id BIGSERIAL PRIMARY KEY, store_id BIGINT NOT NULL REFERENCES store_master(id),
      alias_type VARCHAR(32) NOT NULL, alias_code VARCHAR(128) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_store_alias_type_code UNIQUE(alias_type, alias_code),
      CONSTRAINT chk_store_alias_type CHECK (alias_type IN ('SITE','LEGACY_STORE_CODE')),
      CONSTRAINT chk_store_alias_status CHECK (status IN ('ACTIVE','INACTIVE'))
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_store_alias_store ON store_aliases(store_id)`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS store_memberships (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES sys_user(id),
      store_id BIGINT NOT NULL REFERENCES store_master(id), role VARCHAR(32) NOT NULL,
      effective_from TIMESTAMPTZ NULL, effective_to TIMESTAMPTZ NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_store_membership_status CHECK (status IN ('ACTIVE','INACTIVE')),
      CONSTRAINT chk_store_membership_role CHECK (role IN ('CASHIER','STORE_MANAGER','ADMIN')),
      CONSTRAINT chk_store_membership_period CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_store_membership_user_active ON store_memberships(user_id,status)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_store_membership_open_period
      ON store_memberships(user_id,store_id,role) WHERE status='ACTIVE' AND effective_to IS NULL`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS store_warehouse_bindings (
      id BIGSERIAL PRIMARY KEY, store_id BIGINT NOT NULL REFERENCES store_master(id),
      warehouse_code VARCHAR(64) NOT NULL REFERENCES wms_warehouses(warehouse_code),
      purpose VARCHAR(16) NOT NULL, priority INTEGER NOT NULL DEFAULT 100,
      status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE', effective_from TIMESTAMPTZ NULL, effective_to TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_store_binding_purpose CHECK (purpose IN ('SALES','RETURNS')),
      CONSTRAINT chk_store_binding_status CHECK (status IN ('ACTIVE','INACTIVE')),
      CONSTRAINT chk_store_binding_period CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_store_binding_active ON store_warehouse_bindings(store_id,purpose,status,priority)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_store_binding_open_period
      ON store_warehouse_bindings(store_id,warehouse_code,purpose) WHERE status='ACTIVE' AND effective_to IS NULL`);
    await queryRunner.query(`CREATE OR REPLACE FUNCTION enforce_store_site_alias() RETURNS trigger AS $$
      BEGIN IF NEW.alias_type='SITE' AND NOT EXISTS (SELECT 1 FROM sys_organizations o WHERE o.org_code=NEW.alias_code AND o.org_type='SITE' AND o.status='ACTIVE')
      THEN RAISE EXCEPTION 'SITE alias requires ACTIVE canonical SITE'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_store_site_alias ON store_aliases`);
    await queryRunner.query(`CREATE TRIGGER trg_store_site_alias BEFORE INSERT OR UPDATE/* schema lifecycle validation */ OF alias_type,alias_code,status ON store_aliases FOR EACH ROW WHEN (NEW.status='ACTIVE') EXECUTE FUNCTION enforce_store_site_alias()`);
    await queryRunner.query(`CREATE OR REPLACE FUNCTION enforce_store_operational_warehouse() RETURNS trigger AS $$
      BEGIN IF NOT EXISTS (SELECT 1 FROM wms_warehouses w WHERE w.warehouse_code=NEW.warehouse_code AND w.status='ACTIVE' AND w.domain='OPERATIONAL')
      THEN RAISE EXCEPTION 'store warehouse binding requires ACTIVE OPERATIONAL warehouse'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_store_operational_warehouse ON store_warehouse_bindings`);
    await queryRunner.query(`CREATE TRIGGER trg_store_operational_warehouse BEFORE INSERT OR UPDATE/* schema lifecycle validation */ OF warehouse_code,status ON store_warehouse_bindings FOR EACH ROW WHEN (NEW.status='ACTIVE') EXECUTE FUNCTION enforce_store_operational_warehouse()`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_store_operational_warehouse ON store_warehouse_bindings`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS enforce_store_operational_warehouse()`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_store_site_alias ON store_aliases`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS enforce_store_site_alias()`);
    await queryRunner.query(`DROP TABLE IF EXISTS store_warehouse_bindings`);
    await queryRunner.query(`DROP TABLE IF EXISTS store_memberships`);
    await queryRunner.query(`DROP TABLE IF EXISTS store_aliases`);
    await queryRunner.query(`DROP TABLE IF EXISTS store_master`);
  }
}
