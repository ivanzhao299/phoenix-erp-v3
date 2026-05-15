import { DataSource } from 'typeorm';

async function bootstrap() {
  console.log('--- Phase 4.5 -> 5: Running ETL Migration in PostgreSQL ---');

  const pgSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'mac',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'phoenix_erp',
  });
  await pgSource.initialize();
  console.log('✅ PostgreSQL connected');

  // Helper to parse dirty dates
  function parseTimestamp(val: any): number | null {
    if (val == null) return null;
    if (typeof val === 'number') return val;
    const s = String(val).trim();
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    if (/^\d+\.\d+$/.test(s)) return parseInt(s.split('.')[0], 10);
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.getTime();
    return null;
  }

  function parseDateString(val: any): string | null {
    if (val == null) return null;
    const ts = parseTimestamp(val);
    if (ts) {
      return new Date(ts).toISOString().slice(0, 10);
    }
    return String(val).slice(0, 10);
  }

  try {
    await pgSource.query('BEGIN');

    console.log('Cleaning up existing mon_* tables for idempotent run...');
    await pgSource.query(`
      TRUNCATE TABLE mon_device_property_history, 
                     mon_device_property_daily_agg, 
                     mon_device_alert_event, 
                     mon_device_realtime_snapshot, 
                     mon_house_device_mapping, 
                     mon_device_property_dict 
      CASCADE;
    `);

    // 1. Property Dict
    console.log('Migrating property dict...');
    const dicts = await pgSource.query('SELECT * FROM farm_device_property_dict');
    for (const d of dicts) {
      await pgSource.query(`
        INSERT INTO mon_device_property_dict 
          (id, property_code, name_zh, system_category, metric_type, display_level, ui_component_type, unit, threshold_high, threshold_low, is_active, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT DO NOTHING
      `, [
        d.property_code, d.name_zh, d.system_category || 'other', d.metric_type || 'continuous',
        d.display_level || 4, d.ui_component_type || 'matrix', d.unit, 
        d.threshold_high ? Number(d.threshold_high) : null, 
        d.threshold_low ? Number(d.threshold_low) : null,
        d.alarm_enabled == 1
      ]);
    }

    // 2. House Device Mapping
    console.log('Migrating house mapping...');
    const maps = await pgSource.query('SELECT * FROM farm_house_interface_mapping');
    for (const m of maps) {
      await pgSource.query(`
        INSERT INTO mon_house_device_mapping 
          (id, erp_farm_code, erp_house_code, status, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT DO NOTHING
      `, [m.erp_farm_code, m.erp_house_code, m.status || 'ACTIVE']);
    }

    // 3. Realtime Snapshot
    console.log('Migrating snapshots...');
    const snaps = await pgSource.query('SELECT * FROM farm_device_realtime_snapshot');
    for (const s of snaps) {
      await pgSource.query(`
        INSERT INTO mon_device_realtime_snapshot 
          (id, erp_house_code, property_code, value, is_alarm, collect_time, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT DO NOTHING
      `, [
        s.erp_house_code, s.property_code, s.value ? Number(s.value) : null, 
        s.is_alarm || 0, parseTimestamp(s.collect_time)
      ]);
    }

    // 4. Alert Events
    console.log('Migrating alert events...');
    const alerts = await pgSource.query('SELECT * FROM farm_device_alert_event');
    for (const a of alerts) {
      await pgSource.query(`
        INSERT INTO mon_device_alert_event 
          (id, erp_house_code, property_code, property_name, current_val, threshold_val, unit, triggered_at, closed_at, status, confirmed_by, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        a.erp_house_code, a.property_code, a.property_name, 
        a.current_val ? Number(a.current_val) : null, 
        a.threshold_val ? Number(a.threshold_val) : null, a.unit, 
        parseTimestamp(a.triggered_at), parseTimestamp(a.closed_at), 
        a.status || 'OPEN', a.confirmed_by
      ]);
    }

    // 5. Daily Agg
    console.log('Migrating daily agg...');
    const aggs = await pgSource.query('SELECT * FROM farm_device_property_daily_agg');
    let aggCount = 0;
    for (const a of aggs) {
      await pgSource.query(`
        INSERT INTO mon_device_property_daily_agg 
          (id, erp_house_code, property_code, agg_date, avg_val, max_val, min_val, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        ON CONFLICT DO NOTHING
      `, [
        a.erp_house_code, a.property_code, parseDateString(a.agg_date), 
        a.avg_val ? Number(a.avg_val) : null, 
        a.max_val ? Number(a.max_val) : null, 
        a.min_val ? Number(a.min_val) : null
      ]);
      aggCount++;
    }

    // 6. History
    console.log('Migrating history... (this may take a while)');
    const hists = await pgSource.query('SELECT * FROM farm_device_property_history');
    let histCount = 0;
    for (const h of hists) {
      await pgSource.query(`
        INSERT INTO mon_device_property_history 
          (id, erp_house_code, property_code, value, collect_time, log_date, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      `, [
        h.erp_house_code, h.property_code, h.value ? Number(h.value) : null, 
        parseTimestamp(h.collect_time), parseDateString(h.log_date)
      ]);
      histCount++;
    }

    await pgSource.query('COMMIT');
    console.log('✅ ETL Migration Complete in PostgreSQL!');
  } catch (e: any) {
    await pgSource.query('ROLLBACK');
    console.error('❌ Migration failed:', e.message);
  } finally {
    await pgSource.destroy();
  }
}

bootstrap();
