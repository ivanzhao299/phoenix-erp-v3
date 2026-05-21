-- 修复 mon_house_device_mapping：补齐 IoT 同步代码所需的缺失列（幂等）
ALTER TABLE mon_house_device_mapping
  ADD COLUMN IF NOT EXISTS vendor_farm_id  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS vendor_house_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS mapped_by       VARCHAR(50),
  ADD COLUMN IF NOT EXISTS mapped_at       TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS sync_freq_min   INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS alert_config_json TEXT;

-- 种入传感器属性字典（6 个标准监控指标，幂等）
-- property_code 来自第三方 IoT API，与 iot-sync.service.ts / seed_alerts.js 保持一致
INSERT INTO mon_device_property_dict
  (property_code, name_zh, unit, system_category, metric_type, display_level, threshold_high, threshold_low, is_active)
VALUES
  ('2001', '平均温度',  '℃',  'climate',  'continuous', 1, 32.00, 18.00, true),
  ('2002', '室外温度',  '℃',  'climate',  'continuous', 3, NULL,  NULL,  true),
  ('2083', '平均湿度',  '%',   'climate',  'continuous', 1, 85.00, 40.00, true),
  ('2090', 'CO₂浓度',  'ppm', 'air',      'continuous', 2, 1500.00, NULL, true),
  ('2096', '氨气浓度',  'ppm', 'air',      'continuous', 2, 20.00, NULL,  true),
  ('2097', '负压',      'Pa',  'air',      'continuous', 3, NULL,  NULL,  true)
ON CONFLICT (property_code) DO NOTHING;
