import { OfficialInventoryLedgerCost1794977000000 } from '../../../database/migrations/1794977000000-OfficialInventoryLedgerCost';
import { OrgOwnershipService } from '../../org/services/org-ownership.service';
import { DataSource } from 'typeorm';
import { ProductionCutoverManifests1794976000000 } from '../../../database/migrations/1794976000000-ProductionCutoverManifests';
import { FlockReportCorrection1794903000000 } from '../../../database/migrations/1794903000000-FlockReportCorrection';
import { FlockBaseSchema1794899000000 } from '../../../database/migrations/1794899000000-FlockBaseSchema';
import { OfficialProductionReportGrain1794975000000 } from '../../../database/migrations/1794975000000-OfficialProductionReportGrain';
import { EggSourceProfiles1794400001000 } from '../../../database/migrations/1794400001000-EggSourceProfiles';
import { FlockLifecycleLedger1794900000000 } from '../../../database/migrations/1794900000000-FlockLifecycleLedger';
import { FlockProductionProvenance1794901000000 } from '../../../database/migrations/1794901000000-FlockProductionProvenance';
import { FlockActivitySources1794902000000 } from '../../../database/migrations/1794902000000-FlockActivitySources';
import { OfficialInventoryCutover1794971000000 } from '../../../database/migrations/1794971000000-OfficialInventoryCutover';
import { ProductionInboundDocuments1794972000000 } from '../../../database/migrations/1794972000000-ProductionInboundDocuments';
import { ProductionHandoverAndPeriods1794973000000 } from '../../../database/migrations/1794973000000-ProductionHandoverAndPeriods';
import { ProductionInstallmentDictionaries1794974000000 } from '../../../database/migrations/1794974000000-ProductionInstallmentDictionaries';

/** Synthetic fixture only. Caller must verify ownership and establish its own isolated schema. */
export async function installProductionInboundFixture(db: DataSource, grades: string[], options:{reportGrain?:boolean;cutoverManifests?:boolean}={}) {
    await db.query(`
      CREATE TABLE IF NOT EXISTS mst_products (product_code text PRIMARY KEY, status text, unit text, unit_zh text);
      ALTER TABLE mst_products ADD COLUMN IF NOT EXISTS variety_code text;
      CREATE TABLE IF NOT EXISTS packaging_specs (spec_code text PRIMARY KEY, status text, base_unit text, display_unit text, qty_per_unit numeric(10,2));
      CREATE TABLE IF NOT EXISTS product_grades (grade_code text PRIMARY KEY, status text, sort_order int, is_saleable boolean DEFAULT true, is_storable boolean DEFAULT true);
      CREATE TABLE IF NOT EXISTS product_skus (sku_code text PRIMARY KEY, product_code text, grade_code text, spec_code text, status text, effective_date date, expire_date date);
      ALTER TABLE product_skus ADD COLUMN IF NOT EXISTS variety_code text;
      CREATE TABLE IF NOT EXISTS sys_organizations (org_code text PRIMARY KEY, company_code text, org_type text, status text);
      CREATE TABLE IF NOT EXISTS ${OrgOwnershipService.FARM_TABLE} (farm_code text PRIMARY KEY, company_code text, mapped_site_code text, status text);
      CREATE TABLE IF NOT EXISTS brd_houses (house_code text PRIMARY KEY, farm_code text, status text);
      CREATE TABLE IF NOT EXISTS brd_flocks (flock_no text PRIMARY KEY, house_code text, breed_code text, strain text, status text);
      ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS breed_code text;
      ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS strain text;
      ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS status text;
      ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS farm_code text;
      ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS placement_date date;
      ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS start_date date;
      ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS elimination_date date;
      CREATE TABLE IF NOT EXISTS sys_dict (dict_type text, dict_code text, status text);
      CREATE TABLE IF NOT EXISTS md_product_varieties (variety_code text PRIMARY KEY, status text, effective_date date, expire_date date);
      CREATE TABLE IF NOT EXISTS md_variety_breeds (variety_code text, breed_code text, status text DEFAULT 'ACTIVE');
      CREATE TABLE IF NOT EXISTS md_sku_org_scope (sku_code text, scope_type text, scope_code text DEFAULT '', sale_enabled boolean DEFAULT true, stock_enabled boolean DEFAULT true, status text DEFAULT 'ACTIVE', effective_date date, expire_date date);
      CREATE TABLE IF NOT EXISTS brd_daily_logs (id serial PRIMARY KEY, log_date date, house_code text, eggs_by_grade jsonb);
      CREATE TABLE IF NOT EXISTS wms_warehouses (warehouse_code text PRIMARY KEY, company_code text, site_code text, status text, type text, domain text);
      CREATE TABLE IF NOT EXISTS wms_locations (location_code text PRIMARY KEY, warehouse_code text, status text);
      CREATE TABLE IF NOT EXISTS inv_batches (id serial PRIMARY KEY, batch_no varchar(64) UNIQUE, product_code text, company_code text,
        warehouse_code text, location_code text, egg_date date, inbound_date date, expire_date date,
        quality_grade text, packaging_spec text, source_type text, source_no text, qty numeric, qty_available numeric,
        status text, sku_code text, grade_code_std text, spec_code text, packaging_batch_ref text,
        collection_batch_ref text, unit text, material_code text, legacy_source text, base_quantity_version smallint, created_at timestamptz, updated_at timestamptz);
      ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS variety_code text,ADD COLUMN IF NOT EXISTS item_type text,
        ADD COLUMN IF NOT EXISTS material_type text,ADD COLUMN IF NOT EXISTS store_code text;
      ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS inventory_class text NOT NULL DEFAULT 'STANDARD';
      -- inv-opt 批次 4：跟随迁移末态（InvEggCostingColumns）
      ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS unit_cost numeric(18,6) NOT NULL DEFAULT 0;
      CREATE TABLE IF NOT EXISTS inv_ledger (id serial PRIMARY KEY, batch_no text REFERENCES inv_batches(batch_no), change_type text,
        qty_change numeric, operator text, store_code text, ref_no text, note text, batch_expire_date date,
        quality_grade text, company_code text, sku_code text, log_date date, warehouse_code text, location_code text);
      ALTER TABLE inv_ledger ADD COLUMN IF NOT EXISTS cost_change numeric(18,6),ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),ADD COLUMN IF NOT EXISTS material_code text; -- inv-opt 批次 4 迁移末态
      CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_batches_temp_production_source_identity
        ON inv_batches (company_code, source_type, source_no,
          COALESCE(sku_code, ''), COALESCE(grade_code_std, quality_grade, ''), COALESCE(spec_code, packaging_spec, ''))
        WHERE source_type = 'TEMP_PRODUCTION' AND source_no IS NOT NULL;
      TRUNCATE inv_ledger, inv_batches, product_skus, product_grades, mst_products, packaging_specs, sys_organizations,
        ${OrgOwnershipService.FARM_TABLE}, brd_houses, brd_flocks, md_variety_breeds, md_sku_org_scope, brd_daily_logs, wms_warehouses, wms_locations RESTART IDENTITY;
    `);
    const profileRunner = db.createQueryRunner();
    try { await new EggSourceProfiles1794400001000().up(profileRunner); }
    finally { await profileRunner.release(); }
    await db.query('TRUNCATE md_egg_source_profiles');
    await db.query("INSERT INTO mst_products VALUES ('PRD-EGG-RAW','ACTIVE','枚','枚')");
    await db.query("INSERT INTO packaging_specs VALUES ('LOOSE','ACTIVE','枚','枚',1)");
    for (const [i, grade] of grades.entries()) {
      await db.query("INSERT INTO product_grades VALUES ($1,'ACTIVE',$2)", [grade, i]);
      await db.query("INSERT INTO product_skus VALUES ($1,'PRD-EGG-RAW',$2,'LOOSE','ACTIVE')", [`SKU-${grade}`, grade]);
      await db.query("UPDATE product_skus SET variety_code='EGG_RED' WHERE sku_code=$1", [`SKU-${grade}`]);
      for (const company of ['COMP-A', 'COMP-B']) {
        await db.query("INSERT INTO md_sku_org_scope (sku_code, scope_type, scope_code) VALUES ($1,'COMPANY',$2)", [`SKU-${grade}`, company]);
      }
    }
    await db.query("UPDATE mst_products SET variety_code='EGG_RED' WHERE product_code='PRD-EGG-RAW'");
    await db.query("INSERT INTO md_product_varieties (variety_code,status,effective_date,expire_date) VALUES ('EGG_RED','ACTIVE',NULL,NULL) ON CONFLICT (variety_code) DO UPDATE SET status='ACTIVE'");
    await db.query("DELETE FROM sys_dict WHERE dict_type='BRD_BREED' AND dict_code='TEST_RED'");
    await db.query("INSERT INTO sys_dict (dict_type,dict_code,status) VALUES ('BRD_BREED','TEST_RED','ACTIVE')");
    await db.query("INSERT INTO md_variety_breeds VALUES ('EGG_RED','TEST_RED','ACTIVE')");
    for (const company of ['A', 'B']) {
      await db.query("INSERT INTO brd_flocks(flock_no,house_code,farm_code,breed_code,status,placement_date,start_date) VALUES ($1,$2,$3,'TEST_RED','LAYING','2026-01-01','2026-01-01')", [`FLOCK-${company}`, `HOUSE-${company}`, `FARM-${company}`]);
      await db.query(`INSERT INTO md_egg_source_profiles(profile_code,company_code,farm_code,site_code,house_code,product_mode,variety_code,effective_date)
        VALUES ($1,$2,$3,$4,$5,'VARIANT','EGG_RED','2026-01-01')`, [`PROFILE-${company}`, `COMP-${company}`, `FARM-${company}`, `SITE-${company}`, `HOUSE-${company}`]);
      await db.query("INSERT INTO sys_organizations VALUES ($1,$1,'COMPANY','ACTIVE')", [`COMP-${company}`]);
      await db.query(`INSERT INTO ${OrgOwnershipService.FARM_TABLE} VALUES ($1,$2,$3,'ACTIVE')`, [`FARM-${company}`, `COMP-${company}`, `SITE-${company}`]);
      await db.query("INSERT INTO brd_houses VALUES ($1,$2,'ACTIVE')", [`HOUSE-${company}`, `FARM-${company}`]);
      await db.query("INSERT INTO wms_warehouses VALUES ($1,$2,$3,'ACTIVE','EGG_FARM','OPERATIONAL')", [`WH-${company}`, `COMP-${company}`, `SITE-${company}`]);
      await db.query("INSERT INTO wms_locations VALUES ($1,$2,'ACTIVE')", [`LOC-${company}`, `WH-${company}`]);
    }
    await db.query("INSERT INTO brd_houses VALUES ('HOUSE-A2','FARM-A','ACTIVE')");
    await db.query("INSERT INTO mst_products(product_code,status,unit,unit_zh,variety_code) VALUES ('PRD-STD','ACTIVE','枚','枚',NULL)");
    await db.query("INSERT INTO product_skus(sku_code,product_code,grade_code,spec_code,status,variety_code) VALUES ('SKU-STD','PRD-STD','GRADE_1','LOOSE','ACTIVE',NULL)");
    await db.query("INSERT INTO md_sku_org_scope(sku_code,scope_type,scope_code,sale_enabled,stock_enabled) VALUES ('SKU-STD','COMPANY','COMP-A',false,true)");
    await db.query(`INSERT INTO md_egg_source_profiles(profile_code,company_code,farm_code,site_code,house_code,product_mode,variety_code,effective_date)
      VALUES ('PROFILE-A2','COMP-A','FARM-A','SITE-A','HOUSE-A2','STANDARD',NULL,'2026-01-01')`);
    await db.query("INSERT INTO wms_warehouses VALUES ('WH-A2','COMP-A','SITE-A','ACTIVE','EGG_FARM','OPERATIONAL')");
    await db.query("INSERT INTO wms_locations VALUES ('LOC-A2','WH-A2','ACTIVE'), ('LOC-A-OTHER','WH-A','ACTIVE')");
    await db.query(`ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS max_capacity int DEFAULT 5000, ADD COLUMN IF NOT EXISTS capacity int;
      ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS initial_qty int DEFAULT 1000,ADD COLUMN IF NOT EXISTS current_qty int DEFAULT 1000,
        ADD COLUMN IF NOT EXISTS company_code text,ADD COLUMN IF NOT EXISTS site_code text,ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
      ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS flock_no text,ADD COLUMN IF NOT EXISTS shift text DEFAULT 'DAILY',
        ADD COLUMN IF NOT EXISTS mortality_qty int DEFAULT 0,ADD COLUMN IF NOT EXISTS elimination_qty int DEFAULT 0,
        ADD COLUMN IF NOT EXISTS opening_qty int,ADD COLUMN IF NOT EXISTS closing_qty int,ADD COLUMN IF NOT EXISTS eggs_produced int DEFAULT 0,ADD COLUMN IF NOT EXISTS lay_rate numeric;
      ALTER TABLE sys_dict ADD COLUMN IF NOT EXISTS dict_label_zh text,ADD COLUMN IF NOT EXISTS dict_label_en text,ADD COLUMN IF NOT EXISTS dict_label_lo text,ADD COLUMN IF NOT EXISTS sort_no int;
      CREATE UNIQUE INDEX IF NOT EXISTS fixture_dict_unique ON sys_dict(dict_type,dict_code);
      CREATE TABLE IF NOT EXISTS file_metadata(file_id text PRIMARY KEY,status text,deleted_at timestamptz,visibility text,mime_type text,module_code text,owner_type text,owner_id text,company_code text,store_code text,uploaded_by text);
      CREATE TABLE IF NOT EXISTS pkg_source_batches(id int PRIMARY KEY,house_code text,flock_code text,received_qty int,production_date date,lay_date date,is_test boolean);
      CREATE TABLE IF NOT EXISTS pkg_grading_records(id int PRIMARY KEY,code text,is_test boolean);
      CREATE TABLE IF NOT EXISTS pkg_grading_source_links(grading_id int,source_batch_id int,input_qty int);
      CREATE TABLE IF NOT EXISTS pkg_packing_records(code text PRIMARY KEY,grading_code text,grading_codes_json jsonb,is_test boolean);
      INSERT INTO file_metadata VALUES('FILE-count','ACTIVE',NULL,'PROTECTED','application/pdf','FLOCK_LIFECYCLE','HOUSE','HOUSE-A','COMP-A','SITE-A','fixture-system') ON CONFLICT DO NOTHING;`);
    const flockRunner=db.createQueryRunner();await new FlockLifecycleLedger1794900000000().up(flockRunner);
    await new FlockProductionProvenance1794901000000().up(flockRunner);await new FlockActivitySources1794902000000().up(flockRunner);await new FlockReportCorrection1794903000000().up(flockRunner);await flockRunner.release();
    const officialRunner = db.createQueryRunner();
    try {
      await officialRunner.connect();
      await new OfficialInventoryCutover1794971000000().up(officialRunner);
      await new ProductionInboundDocuments1794972000000().up(officialRunner);
      await new ProductionHandoverAndPeriods1794973000000().up(officialRunner);
      await db.query(`ALTER TABLE sys_dict ADD COLUMN IF NOT EXISTS dict_value text;
        CREATE TABLE IF NOT EXISTS typeorm_metadata("type" text,"table" text,"name" text,"value" text)`);
      await new ProductionInstallmentDictionaries1794974000000().up(officialRunner);
      await new FlockBaseSchema1794899000000().up(officialRunner);
      if(options.reportGrain!==false)await new OfficialProductionReportGrain1794975000000().up(officialRunner);
      if(options.cutoverManifests!==false){await new ProductionCutoverManifests1794976000000().up(officialRunner);await new OfficialInventoryLedgerCost1794977000000().up(officialRunner);}
      await db.query('ALTER TABLE inv_ledger ADD COLUMN IF NOT EXISTS unit text,ADD COLUMN IF NOT EXISTS business_type text');
    } finally { await officialRunner.release(); }
}
