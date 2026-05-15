const { DataSource } = require('typeorm');

async function bootstrap() {
  console.log('--- Phase 4.5 -> 5: Creating mon_* tables ---');

  const pgSource = new DataSource({
    type: 'postgres',
    host: 'host.docker.internal',
    port: 5432,
    username: 'postgres',
    password: 'password',
    database: 'phoenix_erp',
  });
  await pgSource.initialize();
  console.log('✅ PostgreSQL connected');

  const ddl = `
    -- 1. mon_device_property_dict
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

    -- 2. mon_house_device_mapping
    CREATE TABLE IF NOT EXISTS mon_house_device_mapping (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      erp_farm_code VARCHAR(50) NOT NULL,
      erp_house_code VARCHAR(50) UNIQUE NOT NULL,
      status VARCHAR(20) DEFAULT 'ACTIVE',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. mon_device_realtime_snapshot
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

    -- 4. mon_device_alert_event
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

    -- 5. mon_device_property_history
    CREATE TABLE IF NOT EXISTS mon_device_property_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      erp_house_code VARCHAR(50) NOT NULL,
      property_code VARCHAR(50) NOT NULL,
      value DECIMAL(18,2),
      collect_time BIGINT,
      log_date DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_mon_history_search ON mon_device_property_history(erp_house_code, property_code, log_date);

    -- 6. mon_device_property_daily_agg
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
  `;

  try {
    await pgSource.query(ddl);
    console.log('✅ mon_* tables created successfully!');
  } catch (e) {
    console.error('❌ Failed to create schema:', e.message);
  } finally {
    await pgSource.destroy();
  }
}

bootstrap();
