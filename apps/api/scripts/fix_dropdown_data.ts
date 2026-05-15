import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  console.log('--- 检查/修复字典和库区数据 ---');

  // 1. 确保 sys_dict 表存在
  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS sys_dict (
      id SERIAL PRIMARY KEY,
      dict_type VARCHAR(64),
      dict_label_zh VARCHAR(128),
      dict_value VARCHAR(64),
      sort_no INT DEFAULT 0,
      status VARCHAR(32) DEFAULT 'ACTIVE'
    )
  `);

  // 确保 WMS_INBOUND_TYPE 字典存在
  const dictRows = await dataSource.query(`SELECT * FROM sys_dict WHERE dict_type = 'WMS_INBOUND_TYPE'`);
  if (dictRows.length === 0) {
    console.log('⚠️ 发现缺失 WMS_INBOUND_TYPE 字典，正在注入...');
    await dataSource.query(`
      INSERT INTO sys_dict (dict_type, dict_label_zh, dict_value, sort_no) VALUES 
      ('WMS_INBOUND_TYPE', '生产入库', 'PROD_IN', 1),
      ('WMS_INBOUND_TYPE', '采购入库', 'PURCHASE_IN', 2),
      ('WMS_INBOUND_TYPE', '调拨入库', 'TRANSFER_IN', 3),
      ('WMS_INBOUND_TYPE', '退货入库', 'RETURN_IN', 4)
    `);
    console.log('✅ WMS_INBOUND_TYPE 字典注入成功');
  } else {
    console.log('✅ WMS_INBOUND_TYPE 字典已存在');
  }

  // 2. 确保 wms_warehouses 库区表存在
  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS wms_warehouses (
      warehouse_code VARCHAR(32) PRIMARY KEY,
      warehouse_name_zh VARCHAR(128),
      type VARCHAR(32),
      status VARCHAR(32) DEFAULT 'ACTIVE',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const whRows = await dataSource.query(`SELECT * FROM wms_warehouses`);
  if (whRows.length === 0) {
    console.log('⚠️ 发现库区表为空，正在注入默认库区...');
    await dataSource.query(`
      INSERT INTO wms_warehouses (warehouse_code, warehouse_name_zh, type, status) VALUES 
      ('WH-A', '成品冷藏区A', 'COLD', 'ACTIVE'),
      ('WH-B', '包材存放区', 'NORMAL', 'ACTIVE'),
      ('WH-C', '饲料存放区', 'NORMAL', 'ACTIVE')
    `);
    console.log('✅ 库区数据注入成功');
  } else {
    console.log('✅ 库区数据已存在');
  }

  await app.close();
}

bootstrap().catch(console.error);
