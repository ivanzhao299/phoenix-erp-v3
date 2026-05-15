import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  console.log('--- 开始创建 V2.0 遗留兼容表 ---');

  const sqls = [
    `CREATE TABLE IF NOT EXISTS ord_orders (
      order_no VARCHAR(64) PRIMARY KEY,
      customer_code VARCHAR(64),
      customer_name VARCHAR(128),
      sales_rep VARCHAR(64),
      order_type VARCHAR(32),
      order_source VARCHAR(32),
      status VARCHAR(32),
      subtotal DECIMAL(18,2),
      discount DECIMAL(18,2),
      total_amount DECIMAL(18,2),
      need_price_approval INT DEFAULT 0,
      need_credit_approval INT DEFAULT 0,
      is_urgent INT DEFAULT 0,
      delivery_addr TEXT,
      expected_date VARCHAR(32),
      remark TEXT,
      created_by VARCHAR(64),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS ord_order_items (
      id SERIAL PRIMARY KEY,
      order_no VARCHAR(64),
      product_code VARCHAR(64),
      product_name_zh VARCHAR(128),
      qty INT,
      unit VARCHAR(32),
      unit_price DECIMAL(18,2),
      subtotal DECIMAL(18,2),
      batch_no VARCHAR(64)
    )`,
    `CREATE TABLE IF NOT EXISTS ord_approval_log (
      id SERIAL PRIMARY KEY,
      order_no VARCHAR(64),
      action VARCHAR(32),
      operator VARCHAR(64),
      remark TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS fin_transactions (
      id SERIAL PRIMARY KEY,
      account_code VARCHAR(64),
      ref_no VARCHAR(64),
      type VARCHAR(32),
      amount DECIMAL(18,2),
      currency VARCHAR(8) DEFAULT 'LAK',
      note TEXT,
      operator VARCHAR(64),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS shipped_date TIMESTAMP;`,
    `ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS received_date TIMESTAMP;`,
    `ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;`,
    `ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS account_code VARCHAR(64);`
  ];

  for (const sql of sqls) {
    await dataSource.query(sql);
    console.log('✅ Executed: ', sql.substring(0, 50) + '...');
  }

  console.log('--- V2.0 表结构创建完成 ---');
  await app.close();
}

bootstrap().catch(console.error);
