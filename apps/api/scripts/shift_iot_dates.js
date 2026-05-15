const { Client } = require('pg');

async function shiftDates() {
  const client = new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'mac',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'phoenix_erp',
  });

  try {
    await client.connect();
    console.log('✅ Connected to database. Shifting IoT dates to today...');

    // 1. Find the maximum date in the dataset
    const maxAggRes = await client.query('SELECT MAX(agg_date) as m FROM mon_device_property_daily_agg');
    const maxHistRes = await client.query('SELECT MAX(log_date) as m FROM mon_device_property_history');
    
    let maxDate = new Date('2020-01-01');
    if (maxAggRes.rows[0].m) {
      const d = new Date(maxAggRes.rows[0].m);
      if (d > maxDate) maxDate = d;
    }
    if (maxHistRes.rows[0].m) {
      const d = new Date(maxHistRes.rows[0].m);
      if (d > maxDate) maxDate = d;
    }

    if (maxDate.getFullYear() === 2020) {
      console.log('No data found to shift.');
      return;
    }

    console.log(`🔍 Found max date in dataset: ${maxDate.toISOString().slice(0, 10)}`);
    const today = new Date();
    // Calculate difference in days
    const diffTime = today.getTime() - maxDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    console.log(`⏱ Shifting all dates forward by ${diffDays} days...`);

    if (diffDays <= 0) {
      console.log('✅ Data is already up to date.');
      return;
    }

    // Shift daily_agg
    await client.query(`
      UPDATE mon_device_property_daily_agg 
      SET agg_date = agg_date + ($1 || ' days')::interval
    `, [diffDays]);
    console.log('✅ Shifted mon_device_property_daily_agg');

    // Shift history
    await client.query(`
      UPDATE mon_device_property_history 
      SET log_date = log_date + ($1 || ' days')::interval,
          collect_time = collect_time + ($1 * 86400000)
    `, [diffDays]);
    console.log('✅ Shifted mon_device_property_history');

    // Shift snapshots
    await client.query(`
      UPDATE mon_device_realtime_snapshot
      SET collect_time = collect_time + ($1 * 86400000)
    `, [diffDays]);
    console.log('✅ Shifted mon_device_realtime_snapshot');

    // Shift alert events
    await client.query(`
      UPDATE mon_device_alert_event
      SET triggered_at = triggered_at + ($1 * 86400000),
          closed_at = CASE WHEN closed_at IS NOT NULL THEN closed_at + ($1 * 86400000) ELSE NULL END
    `, [diffDays]);
    console.log('✅ Shifted mon_device_alert_event');

    console.log('🎉 All IoT dates have been successfully shifted to today!');
  } catch (err) {
    console.error('❌ Error shifting dates:', err);
  } finally {
    await client.end();
  }
}

shiftDates();
