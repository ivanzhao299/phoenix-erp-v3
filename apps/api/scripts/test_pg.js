const { Client } = require('pg');
const client = new Client({ user: 'mac', host: '127.0.0.1', database: 'postgres' });
client.connect()
  .then(() => { console.log('✅ Connected successfully'); client.end(); })
  .catch(err => console.error('❌ Connection error', err));
