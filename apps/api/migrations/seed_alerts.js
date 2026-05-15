/**
 * 注入演示预警数据到 mon_device_alert_event
 * 用法: node migrations/seed_alerts.js
 */
const { Client } = require('pg');
const c = new Client({ host: '127.0.0.1', port: 5432, user: process.env.DB_USER || 'mac', database: 'phoenix_erp', password: '' });

const HOUSES = ['A001','A002','A003','A004','A005','A006','B001'];
const PROPS  = [
  { code:'2001', name:'平均温度', unit:'℃',  hi:32, lo:18 },
  { code:'2083', name:'平均湿度', unit:'%',  hi:85, lo:40 },
  { code:'2090', name:'CO₂浓度', unit:'ppm', hi:1500, lo:0 },
  { code:'2096', name:'氨气浓度', unit:'ppm', hi:20, lo:0 },
];
const TYPES  = ['OVER_HIGH','UNDER_LOW','OFFLINE','DATA_GAP','VOLATILITY'];
const STATUS = ['OPEN','OPEN','OPEN','CONFIRMED','CLOSED'];

async function run() {
  await c.connect();

  // 补全表结构（添加前端需要的列）
  await c.query(`
    ALTER TABLE mon_device_alert_event
      ADD COLUMN IF NOT EXISTS alert_no       VARCHAR(64),
      ADD COLUMN IF NOT EXISTS property_name  VARCHAR(64),
      ADD COLUMN IF NOT EXISTS property_code  VARCHAR(16),
      ADD COLUMN IF NOT EXISTS current_val    DECIMAL(10,3),
      ADD COLUMN IF NOT EXISTS threshold_val  DECIMAL(10,3),
      ADD COLUMN IF NOT EXISTS unit           VARCHAR(16),
      ADD COLUMN IF NOT EXISTS alert_type     VARCHAR(32),
      ADD COLUMN IF NOT EXISTS triggered_at   BIGINT,
      ADD COLUMN IF NOT EXISTS resolve_note   TEXT,
      ADD COLUMN IF NOT EXISTS resolved_at    TIMESTAMP,
      ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMP DEFAULT NOW()
  `).catch(e => console.warn('列补全:', e.message));
  console.log('✅ mon_device_alert_event 结构已更新');

  // 注入 30 条演示预警
  let n = 0;
  for (let i = 0; i < 30; i++) {
    const house  = HOUSES[i % HOUSES.length];
    const prop   = PROPS[i % PROPS.length];
    const type   = TYPES[i % TYPES.length];
    const status = STATUS[i % STATUS.length];
    const daysAgo = Math.floor(Math.random() * 7);
    const ts = Date.now() - daysAgo * 86400000 - Math.random() * 86400000;
    const currentVal = type === 'OVER_HIGH'
      ? prop.hi + Math.random() * 5
      : type === 'UNDER_LOW'
        ? prop.lo - Math.random() * 5
        : null;
    const threshVal = type === 'OVER_HIGH' ? prop.hi : type === 'UNDER_LOW' ? prop.lo : null;
    const alertNo = `PHX-${house}-${prop.code}-${String(ts).slice(-6)}`;

    await c.query(`
      INSERT INTO mon_device_alert_event
        (erp_house_code, property_code, property_name, alert_type,
         current_val, threshold_val, unit, status,
         alert_no, triggered_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
    `, [house, prop.code, prop.name, type,
        currentVal?.toFixed(2) ?? null,
        threshVal ?? null, prop.unit, status,
        alertNo, Math.floor(ts)]);
    n++;
  }
  console.log(`✅ 注入 ${n} 条演示预警数据`);
  console.log('刷新"环境预警中心"页面即可看到预警列表和KPI卡。');
  await c.end();
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
