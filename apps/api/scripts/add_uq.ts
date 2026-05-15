import { DataSource } from 'typeorm';

async function run() {
  const pgSource = new DataSource({
    type: 'postgres', host: 'localhost', port: 5432, username: 'postgres', password: 'password', database: 'phoenix_erp',
  });
  await pgSource.initialize();
  try {
    await pgSource.query('ALTER TABLE mon_device_property_history ADD CONSTRAINT uq_mon_history UNIQUE (erp_house_code, property_code, collect_time);');
    console.log('Unique constraint added');
  } catch(e) {
    console.log('Error:', e.message);
  }
  await pgSource.destroy();
}
run();
