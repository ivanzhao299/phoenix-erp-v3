const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { randomUUID } = require('node:crypto');
const { diagnose } = require('./flock-lifecycle-diagnostic.cjs');

const url = process.env.FLOCK_REVIEW_PG_URL;
test('readiness diagnostics distinguish legacy anomalies from valid shift reporting', { skip: !url }, async () => {
  const target = new URL(url);
  assert.equal(target.hostname, '127.0.0.1');
  assert.equal(target.pathname, '/phoenix_flock_review');
  const { Client } = createRequire(resolve('apps/api/package.json'))('pg');
  const client = new Client({ connectionString: url });
  const schema = 'remediation_' + randomUUID().replaceAll('-', '');
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query(`
      CREATE TABLE brd_flock_occupancies(id text,company_code text,house_code text,flock_no text,began_on date,ended_on date);
      CREATE TABLE brd_flock_balances(flock_no text,house_code text,quantity integer,closed_on date);
      CREATE TABLE brd_flock_events(id text,document_id text,company_code text,house_code text,kind text,
        occupancy_id text,quantity_delta integer,business_date date,recorded_at timestamptz);
      CREATE TABLE production_cutover_scopes(company_code text,house_code text,state text,first_production_date date);
      CREATE TABLE brd_daily_logs(id integer,company_code text,house_code text,flock_no text,occupancy_id text,log_date date,
        shift text,eggs_by_grade jsonb,opening_qty int,closing_qty int,mortality_qty int,elimination_qty int);
      INSERT INTO brd_flock_balances VALUES ('F','B',100,NULL);
      INSERT INTO brd_flock_occupancies VALUES ('old','C','A','F','2026-11-10','2026-11-12'),('new','C','B','F','2026-11-12',NULL);
      INSERT INTO brd_flock_events VALUES
        ('1','d1','C','A','BASELINE','old',100,'2026-11-10','2026-11-10'),
        ('2','d2','C','A','MORTALITY','old',-10,'2026-11-11','2026-11-11'),
        ('3','d3','C','B','CLEAN_START',NULL,0,'2026-11-13','2026-11-13'),
        ('4','d4','C','B','CLEAN_ACCEPT',NULL,0,'2026-11-14','2026-11-14'),
        ('5','move','C','A','TRANSFER_OUT','old',-90,'2026-11-12','2026-11-15'),
        ('6','move','C','B','TRANSFER_IN','new',90,'2026-11-12','2026-11-15'),
        ('7','undo','C','A','REVERSE_MORTALITY','old',10,'2026-11-11','2026-11-16');
      INSERT INTO production_cutover_scopes VALUES ('C','B','ACTIVE','2026-11-12');
      INSERT INTO brd_daily_logs VALUES
        (1,'C','B','F','new','2026-11-16','AM','{"G":10,"G0":0}',100,99,0,0),
        (2,'C','B','F','new','2026-11-16','PM','{"G":"20"}',100,99,0,0),
        (3,'C','A','F',NULL,'2026-11-09','AM','{"G":5}',100,100,0,0),
        (4,'C','A','F',NULL,'2026-11-09','PM','{"G":6}',100,100,0,0);
    `);
    const report = await diagnose(client);
    function rows(name) {
      const check = report.checks.find(check => check.check === name);
      assert.ok(check, name);
      assert.notEqual(check.state, 'BLOCKED_SCHEMA', name + ' ' + check.sqlstate);
      return check.rows;
    }
    assert.equal(report.activationApproved, false);
    assert.deepEqual(rows('house_business_date_sequence').map(row => row.document_id), ['move']);
    assert.deepEqual(rows('occupancy_event_balances').map(row => [row.occupancy_id, Number(row.event_birds)]),
      [['old', 10], ['new', 90]]);
    assert.deepEqual(rows('legacy_daily_granularity').map(row => row.house_code), ['A']);
    assert.equal(rows('discontinuous_snapshots').length, 0);
    assert.deepEqual(rows('formal_report_grade_values').map(row => row.id), [2]);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM brd_flock_events')).rows[0].n, 7);
  } finally {
    await client.query('ROLLBACK');
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
