import { DataSource } from 'typeorm';

const ds = new DataSource({
  type: 'postgres',
  host: '127.0.0.1', // explicit IP to avoid macOS socket EPERM
  port: 5432,
  username: 'postgres',
  password: 'password', // check if password is correct. Usually we just use postgres/postgres or no password
  database: 'phoenix_erp',
});

async function run() {
  try {
    await ds.initialize();
    const res = await ds.query(`SELECT count(*), max(log_date) FROM mon_device_property_history`);
    console.log("Total records:", res[0]);
    
    const sample = await ds.query(`SELECT id, erp_house_code, property_code, value, collect_time, log_date FROM mon_device_property_history LIMIT 5`);
    console.log("Sample:", sample);
    await ds.destroy();
  } catch(e) {
    console.error("DB Error:", e.message);
  }
}
run();
