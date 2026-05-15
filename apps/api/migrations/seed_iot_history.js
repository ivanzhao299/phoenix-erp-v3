/**
 * 补全 mon_device_property_history（详细时序）演示数据
 * 用法: node migrations/seed_iot_history.js
 */
const { Client } = require('pg');
const c = new Client({
  host: process.env.DB_HOST || '127.0.0.1',
  port: 5432, user: process.env.DB_USER || 'mac',
  database: process.env.DB_NAME || 'phoenix_erp', password: ''
});

const HOUSES = ['A001','A002','A003','A004','A005','A006','B001'];
const PROPS = [
  { code:'2001', base: 28.0, range: 3   },  // 平均温度
  { code:'2002', base: 32.0, range: 4   },  // 室外温度
  { code:'2083', base: 65.0, range: 10  },  // 平均湿度
  { code:'2090', base: 850,  range: 150 },  // CO₂
  { code:'2096', base: 12.0, range: 5   },  // NH₃
  { code:'2097', base:-18.0, range: 8   },  // 负压
];

async function run() {
  await c.connect();

  // 确保表存在
  await c.query(`
    CREATE TABLE IF NOT EXISTS mon_device_property_history (
      id BIGSERIAL PRIMARY KEY,
      erp_house_code VARCHAR(32) NOT NULL,
      property_code  VARCHAR(16) NOT NULL,
      value          DECIMAL(10,3),
      log_date       DATE NOT NULL,
      collect_time   BIGINT,
      created_at     TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('✅ mon_device_property_history 表已就绪');

  let inserted = 0;
  for (const hc of HOUSES) {
    for (let day = 0; day < 7; day++) {
      const dt = new Date();
      dt.setDate(dt.getDate() - day);
      const logDate = dt.toISOString().slice(0, 10);

      // 每天注入 24 个小时点
      for (let hour = 0; hour < 24; hour++) {
        const ts = new Date(dt);
        ts.setHours(hour, 0, 0, 0);
        const collectTime = ts.getTime();

        for (const p of PROPS) {
          const noise = (Math.random() - 0.5) * p.range * 0.3;
          const value = (p.base + noise).toFixed(3);
          await c.query(
            `INSERT INTO mon_device_property_history
               (erp_house_code, property_code, value, log_date, collect_time)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT DO NOTHING`,
            [hc, p.code, value, logDate, collectTime]
          ).catch(() => {});
          inserted++;
        }
      }
    }
    console.log(`  ✅ ${hc}: 7天 × 24小时 = ${7*24*PROPS.length} 条数据`);
  }

  console.log(`\n🎉 详细时序数据注入完成！共 ${inserted} 条`);
  console.log('刷新"历史数据"页面，选择鸡舍后点"查询"即可看到温度/湿度曲线。');
  await c.end();
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
