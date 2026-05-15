import { DataSource } from 'typeorm';

const ds = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: 'password', // assuming default local dev credentials
  database: 'phoenix_erp',
});

async function run() {
  await ds.initialize();
  const res = await ds.query(`SELECT count(*), max(log_date) FROM mon_device_property_history`);
  console.log("Total records:", res[0]);
  
  const sample = await ds.query(`SELECT * FROM mon_device_property_history LIMIT 5`);
  console.log("Sample:", sample);
  await ds.destroy();
}
run().catch(console.error);
