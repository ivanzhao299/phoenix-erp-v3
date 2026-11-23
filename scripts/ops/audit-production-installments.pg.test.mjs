import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { netGradeCapacityCheck } from './audit-production-installments.mjs';

const url = process.env.OFFICIAL_INVENTORY_PG_URL;
test('audit combines posted RAW and ordinary allocations once per grade and preserves negative ordinary findings', { skip: !url }, async () => {
  const target = new URL(url);
  assert.equal(target.hostname, '127.0.0.1');
  assert.equal(target.pathname, '/installments_fixture');
  const { Client } = createRequire(resolve('apps/api/package.json'))('pg');
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    await db.query(`
      CREATE TEMP TABLE brd_daily_logs(id int,house_code text,log_date date,eggs_by_grade jsonb);
      CREATE TEMP TABLE production_inbound_documents(id int,company_code text,house_code text,production_date date,state text);
      CREATE TEMP TABLE production_inbound_lines(document_id int,line_no int,grade_code text);
      CREATE TEMP TABLE production_inbound_allocations(document_id int,line_no int,daily_log_id int,quantity int,direction int);
      INSERT INTO brd_daily_logs VALUES (1,'H','2026-11-20','{"G":100,"B":5}');
      INSERT INTO production_inbound_documents VALUES
        (1,'C','H','2026-11-20','POSTED'),(2,'C','H','2026-11-20','POSTED'),(3,'C','H','2026-11-20','DRAFT');
      INSERT INTO production_inbound_lines VALUES (1,1,'G'),(2,1,'G'),(3,1,'G');
      INSERT INTO production_inbound_allocations VALUES (1,1,1,65,1),(2,1,1,5,-1),(3,1,1,100,1);
    `);
    assert.deepEqual((await db.query(netGradeCapacityCheck(false))).rows, []);
    await db.query(`
      CREATE TEMP TABLE production_raw_receipts(id int,company_code text,house_code text,production_date date,state text);
      CREATE TEMP TABLE production_raw_receipt_segments(receipt_id int,daily_log_id int,grade_code text,quantity int);
      INSERT INTO production_raw_receipts VALUES (10,'C','H','2026-11-20','POSTED'),(11,'C','H','2026-11-20','READY');
      INSERT INTO production_raw_receipt_segments VALUES (10,1,'G',40),(10,1,'B',5),(11,1,'G',1000);
    `);
    const read = async () => (await db.query(netGradeCapacityCheck(true))).rows;
    assert.deepEqual(await read(), []);
    await db.query("UPDATE production_raw_receipt_segments SET quantity=41 WHERE receipt_id=10 AND grade_code='G'");
    const over = await read();
    assert.equal(over.length, 1);
    assert.equal(Number(over[0].quantity), 101);
    await db.query("UPDATE production_inbound_allocations SET quantity=66 WHERE document_id=2");
    const inconsistent = await read();
    assert.equal(inconsistent.length, 1);
    assert.equal(Number(inconsistent[0].ordinary_qty), -1);
    assert.equal(Number(inconsistent[0].raw_qty), 41);
  } finally {
    await db.end();
  }
});
