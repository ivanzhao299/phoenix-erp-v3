-- IoT 监控表组（幂等）
-- iot-sync.service.ts 在 onModuleInit 中会移除 property_code FK 约束（IoT 数据动态）

CREATE TABLE IF NOT EXISTS mon_device_property_dict (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_code VARCHAR(50) UNIQUE NOT NULL,
  name_zh VARCHAR(100) NOT NULL,
  system_category VARCHAR(50) DEFAULT 'other',
  metric_type VARCHAR(50) DEFAULT 'continuous',
  display_level INTEGER DEFAULT 4,
  ui_component_type VARCHAR(50) DEFAULT 'matrix',
  unit VARCHAR(20),
  threshold_high DECIMAL(18,2),
  threshold_low DECIMAL(18,2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mon_house_device_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  erp_farm_code VARCHAR(50) NOT NULL,
  erp_house_code VARCHAR(50) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mon_device_realtime_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  erp_house_code VARCHAR(50) NOT NULL REFERENCES mon_house_device_mapping(erp_house_code),
  property_code VARCHAR(50) NOT NULL REFERENCES mon_device_property_dict(property_code),
  value DECIMAL(18,2),
  is_alarm INTEGER DEFAULT 0,
  collect_time BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(erp_house_code, property_code)
);

CREATE TABLE IF NOT EXISTS mon_device_alert_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  erp_house_code VARCHAR(50) NOT NULL,
  property_code VARCHAR(50) NOT NULL,
  property_name VARCHAR(100),
  current_val DECIMAL(18,2),
  threshold_val DECIMAL(18,2),
  unit VARCHAR(20),
  triggered_at BIGINT,
  closed_at BIGINT,
  status VARCHAR(20) DEFAULT 'OPEN',
  confirmed_by VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mon_device_property_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  erp_house_code VARCHAR(50) NOT NULL,
  property_code VARCHAR(50) NOT NULL,
  value DECIMAL(18,2),
  collect_time BIGINT,
  log_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mon_history_search
  ON mon_device_property_history(erp_house_code, property_code, log_date);

CREATE TABLE IF NOT EXISTS mon_device_property_daily_agg (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  erp_house_code VARCHAR(50) NOT NULL,
  property_code VARCHAR(50) NOT NULL,
  agg_date DATE NOT NULL,
  avg_val DECIMAL(18,2),
  max_val DECIMAL(18,2),
  min_val DECIMAL(18,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(erp_house_code, property_code, agg_date)
);
