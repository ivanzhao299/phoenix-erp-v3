import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  console.log('--- 开始创建 V2.0 仓储模块遗留兼容表及注入测试数据 ---');

  const sqls = [
    `CREATE TABLE IF NOT EXISTS wms_inbound (
      task_no VARCHAR(64) PRIMARY KEY,
      source_po_no VARCHAR(64),
      status VARCHAR(32) DEFAULT 'PENDING',
      warehouse_code VARCHAR(32),
      operator VARCHAR(64),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS wms_inbound_items (
      id SERIAL PRIMARY KEY,
      task_no VARCHAR(64),
      product_code VARCHAR(64),
      qty INT,
      received_qty INT DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS inv_batches (
      batch_no VARCHAR(64) PRIMARY KEY,
      product_code VARCHAR(64),
      qty INT,
      warehouse_code VARCHAR(32),
      location_code VARCHAR(64),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (const sql of sqls) {
    await dataSource.query(sql);
    console.log('✅ Executed Table Creation: ', sql.substring(0, 45) + '...');
  }

  console.log('--- 注入仓储测试数据 ---');
  
  // Clean up old data to avoid unique constraint errors during multiple test runs
  await dataSource.query(`DELETE FROM wms_inbound_items WHERE task_no = 'INB-TEST-001'`);
  await dataSource.query(`DELETE FROM wms_inbound WHERE task_no = 'INB-TEST-001'`);
  await dataSource.query(`DELETE FROM inv_batches WHERE batch_no = 'BATCH-TEST-001'`);

  const mockDataSqls = [
    `INSERT INTO wms_inbound (task_no, source_po_no, status, warehouse_code) VALUES ('INB-TEST-001', 'PO-2026-001', 'PENDING', 'WH-VTE-01')`,
    `INSERT INTO wms_inbound_items (task_no, product_code, qty, received_qty) VALUES ('INB-TEST-001', 'P-01', 500, 0)`,
    `INSERT INTO inv_batches (batch_no, product_code, qty, warehouse_code, location_code) VALUES ('BATCH-TEST-001', 'P-02', 1000, 'WH-VTE-01', 'LOC-01')`
  ];

  for (const sql of mockDataSqls) {
    await dataSource.query(sql);
    console.log('✅ Injected Data: ', sql);
  }

  console.log('--- V2.0 仓储测试环境准备完成 ---');
  await app.close();
}

bootstrap().catch(console.error);
