const { Client } = require('pg');
const fs = require('fs');

async function check() {
  const client = new Client({
    host: '127.0.0.1',
    port: 5432,
    user: 'postgres',
    password: 'password',
    database: 'phoenix_erp'
  });
  await client.connect();
  const res = await client.query('SELECT * FROM mon_device_property_history LIMIT 10');
  fs.writeFileSync('db_out.json', JSON.stringify(res.rows, null, 2));
  await client.end();
}
check().catch(e => fs.writeFileSync('db_out.json', e.message));
