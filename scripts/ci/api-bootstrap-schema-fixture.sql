-- ISOLATED TEST SCHEMA ONLY. No production execution or business seed.
-- Legacy runtime-only tables have no canonical migration yet (governance backlog).
CREATE TABLE IF NOT EXISTS sys_settings (
  key VARCHAR(64) PRIMARY KEY, value TEXT, updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sys_cron_heartbeat (
  job_name VARCHAR(80) PRIMARY KEY, last_run_at TIMESTAMP, last_status VARCHAR(16),
  last_detail TEXT, last_success_at TIMESTAMP, last_failure_at TIMESTAMP,
  success_count BIGINT DEFAULT 0, fail_count BIGINT DEFAULT 0, updated_at TIMESTAMP DEFAULT NOW()
);

-- CI business regression schema formerly supplied by GenericCrud startup.
-- Final empty table definitions only: no historical repairs, seeds or sequence resets.
CREATE TABLE IF NOT EXISTS brd_farms (
  farm_code VARCHAR(50) PRIMARY KEY,
  farm_name VARCHAR(100),
  location VARCHAR(200),
  status VARCHAR(20) DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  houses INT DEFAULT 0,
  capacity INT DEFAULT 0,
  updated_at TIMESTAMP,
  store_code VARCHAR(64) DEFAULT 'ALL',
  company_code VARCHAR(64),
  mapped_site_code VARCHAR(64)
);
CREATE TABLE IF NOT EXISTS brd_houses (
  house_code VARCHAR(50) PRIMARY KEY,
  house_name VARCHAR(100),
  farm_code VARCHAR(50),
  status VARCHAR(20) DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  farm_name VARCHAR(100),
  house_type VARCHAR(50),
  capacity INT DEFAULT 0,
  current_birds INT DEFAULT 0,
  updated_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS brd_flocks (
  flock_no VARCHAR(50) PRIMARY KEY,
  house_code VARCHAR(50),
  farm_code VARCHAR(50),
  strain VARCHAR(50),
  placement_date DATE,
  placement_age INT,
  initial_qty INT,
  current_qty INT,
  status VARCHAR(20) DEFAULT 'GROWING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  start_date DATE,
  current_lay_rate DECIMAL(5,2),
  updated_at TIMESTAMP,
  breed_type VARCHAR(50),
  source_farm VARCHAR(100),
  cost DECIMAL(10,2) DEFAULT 0,
  target_weeks INT DEFAULT 80,
  elimination_date DATE,
  peak_lay_rate DECIMAL(5,2),
  feed_conversion_ratio DECIMAL(5,3),
  batch_no VARCHAR(50),
  store_code VARCHAR(64) DEFAULT 'ALL'
);
CREATE TABLE IF NOT EXISTS brd_vaccinations (
           id           SERIAL PRIMARY KEY,
           flock_no     VARCHAR(50),
           vaccine      VARCHAR(100),
           plan_date    DATE,
           actual_date  DATE,
           batch_no     VARCHAR(50),
           status       VARCHAR(20) DEFAULT 'PENDING',
           created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         );
CREATE TABLE IF NOT EXISTS brd_immune_plans (
           id          SERIAL PRIMARY KEY,
           plan_no     VARCHAR(50) UNIQUE,
           flock_no    VARCHAR(50),
           house_code  VARCHAR(50),
           vaccine     VARCHAR(100),
           plan_date   DATE,
           actual_date DATE,
           status      VARCHAR(20) DEFAULT 'PENDING',
           created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         );
CREATE TABLE IF NOT EXISTS brd_withdrawal_alerts (
           id          SERIAL PRIMARY KEY,
           flock_no    VARCHAR(50),
           drug_name   VARCHAR(100),
           end_date    DATE,
           days_left   INT DEFAULT 0,
           status      VARCHAR(20) DEFAULT 'ACTIVE',
           created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         );
CREATE TABLE IF NOT EXISTS pkg_audit_logs (
           id           SERIAL PRIMARY KEY,
           entity_type  VARCHAR(50),
           entity_id    VARCHAR(100),
           action       VARCHAR(50),
           before_data  TEXT,
           after_data   TEXT,
           reason       TEXT,
           operator_id  INTEGER,
           terminal_id  VARCHAR(80),
           created_at   TIMESTAMP DEFAULT NOW()
         );
CREATE TABLE IF NOT EXISTS pkg_label_print_logs (
           id                  SERIAL PRIMARY KEY,
           box_code            VARCHAR(100),
           packaging_batch_id  VARCHAR(80),
           label_template_id   VARCHAR(80),
           printer_id          VARCHAR(80),
           print_type          VARCHAR(20) DEFAULT 'NORMAL',
           print_status        VARCHAR(20) DEFAULT 'PRINTED',
           printed_by          VARCHAR(100),
           reprint_reason      TEXT,
           old_label_code      VARCHAR(100),
           new_label_code      VARCHAR(100),
           printed_at          TIMESTAMP DEFAULT NOW(),
           created_at          TIMESTAMP DEFAULT NOW()
         );
CREATE TABLE IF NOT EXISTS pkg_qc_inspections (
           id                        SERIAL PRIMARY KEY,
           source_batch_id           VARCHAR(80),
           sample_qty                INTEGER DEFAULT 0,
           broken_qty                INTEGER DEFAULT 0,
           dirty_qty                 INTEGER DEFAULT 0,
           leaking_qty               INTEGER DEFAULT 0,
           abnormal_shape_qty        INTEGER DEFAULT 0,
           floor_egg_qty             INTEGER DEFAULT 0,
           average_weight            NUMERIC(8,2),
           shell_cleanliness_ok      BOOLEAN DEFAULT TRUE,
           odor_ok                   BOOLEAN DEFAULT TRUE,
           container_cleanliness_ok  BOOLEAN DEFAULT TRUE,
           qc_result                 VARCHAR(30) DEFAULT 'PENDING',
           comment                   TEXT,
           inspector_id              INTEGER,
           inspector_name            VARCHAR(100),
           inspected_at              TIMESTAMP,
           created_at                TIMESTAMP DEFAULT NOW()
         );

CREATE TABLE IF NOT EXISTS wms_zones (
           id         SERIAL PRIMARY KEY,
           zone_code  VARCHAR(30) UNIQUE,
           zone_name  VARCHAR(100),
           warehouse  VARCHAR(50),
           status     VARCHAR(20) DEFAULT 'ACTIVE',
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           warehouse_code VARCHAR(50)
         );

CREATE TABLE IF NOT EXISTS wms_inbound_items (
           id              SERIAL PRIMARY KEY,
           task_no         VARCHAR(64),
           batch_no        VARCHAR(64),
           product_code    VARCHAR(64),
           qty             INT DEFAULT 0,
           expected_qty    INT DEFAULT 0,
           actual_qty      INT DEFAULT 0,
           broken_qty      INT DEFAULT 0,
           warehouse_code  VARCHAR(64),
           location_code   VARCHAR(64),
           created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         );

-- Quality regression legacy tables: empty controlled test schema, no data repair.
CREATE TABLE IF NOT EXISTS qa_inspections (
  id           SERIAL PRIMARY KEY,
  inspect_no   VARCHAR(50) UNIQUE,
  house_code   VARCHAR(50),
  inspect_date DATE,
  inspector    VARCHAR(100),
  result       VARCHAR(20),
  score        DECIMAL(5,2),
  status       VARCHAR(20) DEFAULT 'PENDING',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  batch_no VARCHAR(64),
  sku_code VARCHAR(64),
  sample_qty INTEGER DEFAULT 0,
  issues TEXT,
  check_shell BOOLEAN DEFAULT false,
  check_weight BOOLEAN DEFAULT false,
  check_cleanness BOOLEAN DEFAULT false,
  check_grade BOOLEAN DEFAULT false,
  check_pack BOOLEAN DEFAULT false,
  check_label BOOLEAN DEFAULT false,
  insp_no VARCHAR(64),
  henhouse VARCHAR(64),
  "checkType" VARCHAR(32),
  "checkTime" VARCHAR(32),
  items INTEGER DEFAULT 0,
  "failItems" INTEGER DEFAULT 0,
  remark TEXT,
  env_snapshot_json TEXT,
  items_json TEXT,
  fail_items_json TEXT
);
CREATE TABLE IF NOT EXISTS qa_non_conformance (
  id           SERIAL PRIMARY KEY,
  ncr_no       VARCHAR(50) UNIQUE,
  source       VARCHAR(100),
  description  TEXT,
  severity     VARCHAR(20) DEFAULT 'LOW',
  status       VARCHAR(20) DEFAULT 'OPEN',
  assignee     VARCHAR(100),
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  nc_no VARCHAR(50),
  issue_type VARCHAR(50),
  batch_no VARCHAR(64),
  store_code VARCHAR(30),
  action_taken TEXT
);
