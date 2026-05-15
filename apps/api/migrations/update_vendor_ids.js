/**
 * 更新 mon_house_device_mapping 真实 vendor_house_id
 * 用法: node migrations/update_vendor_ids.js
 */
const { Client } = require('pg');
const db = new Client({
  host: '127.0.0.1', port: 5432,
  user: process.env.DB_USER || 'mac',
  database: 'phoenix_erp', password: ''
});

const MAPPING = [
  { erp: 'A001', vendorId: 1472, name: '1-1号' },
  { erp: 'A002', vendorId: 1471, name: '1-2号' },
  { erp: 'A003', vendorId: 1248, name: '1-3号' },
  { erp: 'A004', vendorId: 1249, name: '1-4号' },
  { erp: 'A005', vendorId: 1473, name: '1-5号' },
  { erp: 'A006', vendorId: 1474, name: '1-6号' },
];

async function run() {
  await db.connect();

  for (const m of MAPPING) {
    await db.query(`
      UPDATE mon_house_device_mapping
      SET vendor_house_id = $1,
          house_name      = $2,
          updated_at      = NOW()
      WHERE erp_house_code = $3
    `, [String(m.vendorId), m.name, m.erp]);
    console.log(`✅ ${m.erp} → vendor_house_id=${m.vendorId} (${m.name})`);
  }

  // B001 无 IoT 设备，标记为未接入（保留 ACTIVE 状态但 vendor_house_id 置空）
  await db.query(`
    UPDATE mon_house_device_mapping
    SET vendor_house_id = NULL, updated_at = NOW()
    WHERE erp_house_code = 'B001'
  `);
  console.log(`ℹ️  B001 → 无对应 IoT 设备，vendor_house_id 保持 NULL`);

  // 验证结果
  const r = await db.query(`
    SELECT erp_house_code, vendor_house_id, house_name, status
    FROM mon_house_device_mapping ORDER BY erp_house_code
  `);
  console.log('\n📋 最终映射表:');
  r.rows.forEach(x => console.log(`  ${x.erp_house_code} → ${x.vendor_house_id ?? 'NULL'} (${x.house_name ?? '-'}) [${x.status}]`));

  await db.end();
  console.log('\n✅ 完成！现在后端调用 /api/farm-device/sync/houses 可同步真实数据。');
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
