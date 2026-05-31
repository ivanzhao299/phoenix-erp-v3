-- DDL 17: 物流模块（log_*）表结构规范化（幂等）
-- 物流表在 V2 阶段通过非标准方式创建，本脚本补全迁移记录
-- 支持：全量部署（CREATE TABLE IF NOT EXISTS）和增量更新（ALTER … ADD COLUMN IF NOT EXISTS）

-- ① 车辆档案
-- 修复：序列必须在 CREATE TABLE 之前创建（否则 DEFAULT nextval 引用不存在的序列，
--       在全新数据库上 CREATE TABLE 失败 — 此前被 deploy.yml `|| true` 吞掉）
CREATE SEQUENCE IF NOT EXISTS log_vehicles_id_seq;
CREATE TABLE IF NOT EXISTS log_vehicles (
  plate_no     TEXT          NOT NULL,
  model        TEXT,
  capacity_kg  NUMERIC(18,2),
  status       TEXT          DEFAULT 'ACTIVE',
  store_code   VARCHAR(64)   DEFAULT 'ALL',
  created_at   TEXT,
  updated_at   TEXT,
  id           BIGINT        DEFAULT nextval('log_vehicles_id_seq'),
  PRIMARY KEY (plate_no)
);

-- ② 司机档案
CREATE TABLE IF NOT EXISTS log_drivers (
  driver_id   TEXT NOT NULL,
  name        TEXT,
  license_no  TEXT,
  phone       TEXT,
  status      TEXT DEFAULT 'ACTIVE',
  created_at  TEXT,
  updated_at  TEXT,
  PRIMARY KEY (driver_id)
);

-- ③ 线路档案
CREATE TABLE IF NOT EXISTS log_routes (
  route_code   TEXT          NOT NULL,
  start_point  TEXT,
  end_point    TEXT,
  distance_km  NUMERIC(18,2),
  est_hours    NUMERIC(18,2),
  created_at   TEXT,
  updated_at   TEXT,
  PRIMARY KEY (route_code)
);

-- ④ 配送波次
CREATE SEQUENCE IF NOT EXISTS log_dispatch_id_seq;
CREATE TABLE IF NOT EXISTS log_dispatch (
  dispatch_no  TEXT          NOT NULL,
  plate_no     TEXT,
  driver_id    TEXT,
  driver       TEXT,
  vehicle      TEXT,
  date         TEXT,
  route        TEXT,
  stores       TEXT,
  status       TEXT          DEFAULT 'PENDING',
  store_code   VARCHAR(64)   DEFAULT 'ALL',
  created_at   TIMESTAMP     DEFAULT now(),
  updated_at   TEXT,
  id           BIGINT        DEFAULT nextval('log_dispatch_id_seq'),
  PRIMARY KEY (dispatch_no)
);

-- ⑤ 签收记录
CREATE SEQUENCE IF NOT EXISTS log_receipts_id_seq;
CREATE TABLE IF NOT EXISTS log_receipts (
  id           INTEGER       NOT NULL DEFAULT nextval('log_receipts_id_seq'),
  receipt_no   TEXT,
  dispatch_no  TEXT,
  wave_no      TEXT,
  store_code   TEXT,
  store_name   TEXT,
  signee       TEXT,
  plate_no     TEXT,
  receive_date TEXT,
  qty          INTEGER,
  missing_qty  TEXT,
  condition    TEXT,
  status       TEXT          DEFAULT 'PENDING',
  remark       TEXT,
  sign_time    VARCHAR(255),
  created_at   VARCHAR(255),
  updated_at   TEXT,
  PRIMARY KEY (id)
);

-- 补列（idempotent ALTER，不影响已有数据）
ALTER TABLE log_receipts ADD COLUMN IF NOT EXISTS remark TEXT;

-- ⑥ 物流异常
CREATE SEQUENCE IF NOT EXISTS log_exceptions_id_seq;
CREATE TABLE IF NOT EXISTS log_exceptions (
  id           INTEGER       NOT NULL DEFAULT nextval('log_exceptions_id_seq'),
  exp_no       TEXT,
  exception_no TEXT,
  dispatch_no  TEXT,
  driver       TEXT,
  exp_type     TEXT,
  issue        TEXT,
  description  TEXT,
  severity     VARCHAR(20)   DEFAULT 'LOW',
  status       TEXT          DEFAULT 'OPEN',
  created_at   VARCHAR(255),
  updated_at   TEXT,
  PRIMARY KEY (id)
);

-- 修复序列起点（防止已有数据的 id 冲突）
SELECT setval(
  'log_receipts_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM log_receipts), 0), 1),
  true
);
SELECT setval(
  'log_exceptions_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM log_exceptions), 0), 1),
  true
);
SELECT setval(
  'log_dispatch_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM log_dispatch), 0), 1),
  true
);
SELECT setval(
  'log_vehicles_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM log_vehicles), 0), 1),
  true
);
