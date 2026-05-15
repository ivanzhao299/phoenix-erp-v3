/**
 * 补全所有 brd_* 表的 V3 字段（一次性解决所有字段缺口）
 * 用法: node migrations/fix_brd_columns.js
 */
const { Client } = require('pg');
const c = new Client({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'mac',
  database: process.env.DB_NAME || 'phoenix_erp',
  password: process.env.DB_PASSWORD || '',
});

const steps = [
  // ── brd_farms ──────────────────────────────────────────────
  [`ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS farm_code  VARCHAR(50)`,              'brd_farms.farm_code'],
  [`ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS farm_name  VARCHAR(100)`,             'brd_farms.farm_name'],
  [`ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS location   VARCHAR(200)`,             'brd_farms.location'],
  [`ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS status     VARCHAR(20) DEFAULT 'ACTIVE'`, 'brd_farms.status'],
  [`ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`,  'brd_farms.created_at'],

  // ── brd_houses ─────────────────────────────────────────────
  [`ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS house_code   VARCHAR(50)`,           'brd_houses.house_code'],
  [`ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS house_name   VARCHAR(100)`,          'brd_houses.house_name'],
  [`ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS farm_code    VARCHAR(50)`,           'brd_houses.farm_code'],
  [`ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS max_capacity INT DEFAULT 50000`,     'brd_houses.max_capacity'],
  [`ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS status       VARCHAR(20) DEFAULT 'ACTIVE'`, 'brd_houses.status'],
  [`ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS created_at   TIMESTAMP DEFAULT NOW()`, 'brd_houses.created_at'],

  // ── brd_flocks ─────────────────────────────────────────────
  [`ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS flock_no       VARCHAR(50)`,         'brd_flocks.flock_no'],
  [`ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS house_code     VARCHAR(50)`,         'brd_flocks.house_code'],
  [`ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS farm_code      VARCHAR(50)`,         'brd_flocks.farm_code'],
  [`ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS strain         VARCHAR(50)`,         'brd_flocks.strain'],
  [`ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS placement_date DATE`,                'brd_flocks.placement_date'],
  [`ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS placement_age  INT DEFAULT 1`,       'brd_flocks.placement_age'],
  [`ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS initial_qty    INT DEFAULT 0`,       'brd_flocks.initial_qty'],
  [`ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS current_qty    INT DEFAULT 0`,       'brd_flocks.current_qty'],
  [`ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS status         VARCHAR(20) DEFAULT 'ACTIVE'`, 'brd_flocks.status'],
  [`ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS created_at     TIMESTAMP DEFAULT NOW()`, 'brd_flocks.created_at'],

  // ── brd_daily_logs ─────────────────────────────────────────
  [`ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS log_date     DATE`,              'brd_daily_logs.log_date'],
  [`ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS house_code   VARCHAR(50)`,       'brd_daily_logs.house_code'],
  [`ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS farm_code    VARCHAR(50)`,       'brd_daily_logs.farm_code'],
  [`ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS flock_no     VARCHAR(50)`,       'brd_daily_logs.flock_no'],
  [`ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS egg_count    INT DEFAULT 0`,     'brd_daily_logs.egg_count'],
  [`ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS broken_count INT DEFAULT 0`,     'brd_daily_logs.broken_count'],
  [`ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS death_count  INT DEFAULT 0`,     'brd_daily_logs.death_count'],
  [`ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS feed_kg      DECIMAL(10,2) DEFAULT 0`, 'brd_daily_logs.feed_kg'],
  [`ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS water_liter  DECIMAL(10,2) DEFAULT 0`, 'brd_daily_logs.water_liter'],
  [`ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS body_weight  DECIMAL(8,2)`,      'brd_daily_logs.body_weight'],
  [`ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS egg_weight   DECIMAL(8,2)`,      'brd_daily_logs.egg_weight'],
  [`ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS note         TEXT`,               'brd_daily_logs.note'],
  [`ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS recorded_by  BIGINT`,            'brd_daily_logs.recorded_by'],
  [`ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS created_at   TIMESTAMP DEFAULT NOW()`, 'brd_daily_logs.created_at'],

  // ── brd_vaccinations ───────────────────────────────────────
  [`ALTER TABLE brd_vaccinations ADD COLUMN IF NOT EXISTS flock_no        VARCHAR(50)`,  'brd_vaccinations.flock_no'],
  [`ALTER TABLE brd_vaccinations ADD COLUMN IF NOT EXISTS house_code      VARCHAR(50)`,  'brd_vaccinations.house_code'],
  [`ALTER TABLE brd_vaccinations ADD COLUMN IF NOT EXISTS vaccine_name    VARCHAR(128)`, 'brd_vaccinations.vaccine_name'],
  [`ALTER TABLE brd_vaccinations ADD COLUMN IF NOT EXISTS vaccinate_date  DATE`,         'brd_vaccinations.vaccinate_date'],
  [`ALTER TABLE brd_vaccinations ADD COLUMN IF NOT EXISTS qty_heads       INT DEFAULT 0`,'brd_vaccinations.qty_heads'],
  [`ALTER TABLE brd_vaccinations ADD COLUMN IF NOT EXISTS operator        VARCHAR(64)`,  'brd_vaccinations.operator'],
  [`ALTER TABLE brd_vaccinations ADD COLUMN IF NOT EXISTS note            TEXT`,          'brd_vaccinations.note'],
  [`ALTER TABLE brd_vaccinations ADD COLUMN IF NOT EXISTS created_at      TIMESTAMP DEFAULT NOW()`, 'brd_vaccinations.created_at'],
];

async function run() {
  await c.connect();
  console.log('🔗 连接成功，补全 brd_* 所有字段...\n');
  let ok = 0, skip = 0, fail = 0;
  for (const [sql, label] of steps) {
    try {
      await c.query(sql);
      console.log('✅', label);
      ok++;
    } catch(e) {
      if (e.message.includes('already exists') || e.message.includes('does not exist')) {
        console.log('⏭  跳过:', label);
        skip++;
      } else {
        console.error('❌', label, '—', e.message);
        fail++;
      }
    }
  }
  console.log(`\n${'─'.repeat(48)}`);
  console.log(`✅ ${ok}  ⏭  ${skip}  ❌ ${fail}`);
  if (!fail) console.log('\n🎉 brd_* 字段全部补齐！Phase 10E 将正常运行。');
  await c.end();
}
run().catch(e => { console.error('连接失败:', e.message); process.exit(1); });
