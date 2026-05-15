const { DataSource } = require('typeorm');

async function test() {
  const ds = new DataSource({
    type: 'postgres', host: 'localhost', port: 5432, username: 'postgres', password: 'password', database: 'phoenix_erp'
  });
  await ds.initialize();
  
  const houseCode = 'A005';
  const properties = ['2001'];
  
  const maxRes = await ds.query('SELECT MAX(agg_date) as m FROM mon_device_property_daily_agg WHERE erp_house_code = $1', [houseCode]);
  console.log('maxDate:', maxRes);
  const m = maxRes[0].m;
  console.log('typeof m:', typeof m, m instanceof Date, m);
  
  // if m is a string "2026-04-22", then new Date(m).toISOString() is safe.
  let endDateStr = new Date().toISOString().slice(0, 10);
  if (m) {
    const dStr = m instanceof Date ? m.toISOString().slice(0, 10) : m;
    console.log('dStr:', dStr);
    if (dStr < endDateStr) endDateStr = dStr;
  }
  console.log('endDateStr:', endDateStr);
  
  const endDateObj = new Date(endDateStr);
  const startDateStr = new Date(endDateObj.getTime() - 7 * 864e5).toISOString().slice(0, 10);
  console.log('startDateStr:', startDateStr);
  
  const agg = await ds.query(`
    SELECT a.property_code, a.avg_val as value, a.agg_date as log_date
    FROM mon_device_property_daily_agg a
    WHERE a.erp_house_code = $1
      AND a.agg_date BETWEEN $2 AND $3
      AND a.property_code = $4
  `, [houseCode, startDateStr, endDateStr, properties[0]]);
  
  console.log('agg count:', agg.length);
  if (agg.length > 0) console.log('first agg:', agg[0]);
  
  const allAgg = await ds.query(`SELECT COUNT(*) FROM mon_device_property_daily_agg WHERE erp_house_code = $1 AND property_code = $2`, [houseCode, properties[0]]);
  console.log('all agg count:', allAgg);
  
  await ds.destroy();
}
test().catch(console.error);
