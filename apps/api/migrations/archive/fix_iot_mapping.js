/**
 * 修复 mon_house_device_mapping 表缺失的 IoT 字段，
 * 并从厂商 API 拉取真实的 vendor_house_id 列表
 * 用法: node migrations/fix_iot_mapping.js
 */
const { Client } = require('pg');

const APP_ID     = 'lwfhny_api';
const APP_SECRET = '9q8XClpru43YX0DavdkjSkocbN0WrXwK';
const API_BASE   = 'http://data.znmc.co';

const db = new Client({
  host: '127.0.0.1', port: 5432,
  user: process.env.DB_USER || 'mac',
  database: 'phoenix_erp', password: ''
});

async function getToken() {
  const res = await fetch(`${API_BASE}/open/api/auth/token/get`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId: APP_ID, appSecret: APP_SECRET }),
  });
  const j = await res.json();
  if (!j.success) throw new Error('Token 获取失败: ' + j.msg);
  return j.data.accessToken;
}

async function apiPost(token, path, body = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!j.success) throw new Error(`API ${path} 失败: ` + j.msg);
  return j.data;
}

async function run() {
  await db.connect();

  // 1. 补全 mon_house_device_mapping 缺失列
  console.log('📐 补全 mon_house_device_mapping 列结构...');
  await db.query(`
    ALTER TABLE mon_house_device_mapping
      ADD COLUMN IF NOT EXISTS vendor_farm_id    VARCHAR(64),
      ADD COLUMN IF NOT EXISTS vendor_house_id   VARCHAR(64),
      ADD COLUMN IF NOT EXISTS farm_name         VARCHAR(100),
      ADD COLUMN IF NOT EXISTS house_name        VARCHAR(100),
      ADD COLUMN IF NOT EXISTS sync_freq_min     INTEGER DEFAULT 5,
      ADD COLUMN IF NOT EXISTS alert_config_json TEXT,
      ADD COLUMN IF NOT EXISTS mapped_by         VARCHAR(64) DEFAULT 'system'
  `);
  console.log('✅ 列补全完成\n');

  // 2. 查当前映射表
  const mappings = await db.query(
    `SELECT erp_house_code, vendor_house_id FROM mon_house_device_mapping ORDER BY erp_house_code`
  );
  console.log('📋 当前 ERP 鸡舍映射:');
  mappings.rows.forEach(r =>
    console.log(`  ${r.erp_house_code} → vendor_house_id: ${r.vendor_house_id || '❌ 未配置'}`)
  );
  console.log('');

  // 3. 从 IoT 平台获取真实鸡舍列表
  console.log('🌐 连接 IoT 平台获取真实鸡舍列表...');
  let token;
  try {
    token = await getToken();
    console.log('✅ Token 获取成功\n');
  } catch(e) {
    console.error('❌ IoT 平台连接失败:', e.message);
    console.log('请检查网络或 appId/appSecret 配置');
    await db.end();
    return;
  }

  // 尝试几个可能的鸡舍列表接口
  const paths = [
    '/open/api/farm/house/list',
    '/open/api/house/list',
    '/open/api/user/farm/list',
  ];

  for (const path of paths) {
    try {
      const data = await apiPost(token, path, {});
      console.log(`✅ 接口 ${path} 返回数据:`);
      console.log(JSON.stringify(data, null, 2).slice(0, 2000));
      break;
    } catch(e) {
      console.log(`  接口 ${path}: ${e.message}`);
    }
  }

  await db.end();
  console.log('\n完成。拿到 vendor_house_id 后，用以下 SQL 更新映射:');
  console.log("UPDATE mon_house_device_mapping SET vendor_house_id='真实ID' WHERE erp_house_code='A001';");
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
