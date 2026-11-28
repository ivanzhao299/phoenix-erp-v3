// Apply the CI-only schema fixture on the dedicated local PostgreSQL 18 database.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('../../apps/api/node_modules/pg');

async function bootstrap() {
  const db = new Client({
    host: '127.0.0.1', port: process.argv.includes('--baseline') ? 55434 : 55432,
    user: 'postgres', database: 'packaging_history_test',
  });
  await db.connect();
  try {
    const { rows: [identity] } = await db.query(
      "SELECT current_database() AS db,current_setting('server_version_num')::int AS version",
    );
    if (identity.db !== 'packaging_history_test' || identity.version < 180000) throw Error('ISOLATION_REQUIRED');
    const sql = fs.readFileSync(path.join(__dirname, '../ci/api-bootstrap-schema-fixture.sql'), 'utf8');
    await db.query(sql);
    process.stdout.write('CI_SCHEMA_FIXTURE_APPLIED\n');
  } finally {
    await db.end();
  }
}

bootstrap().catch(error => {
  process.stderr.write('BOOTSTRAP_FAILED ' + (error.code || error.name) + '\n');
  process.exitCode = 1;
});
