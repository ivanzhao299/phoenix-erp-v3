/**
 * 补全 brd_farms / brd_houses / brd_flocks 的 UNIQUE 约束
 * 供 ON CONFLICT 使用
 * 用法: node migrations/fix_brd_constraints.js
 */
const { Client } = require('pg');

const client = new Client({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     parseInt(process.env.DB_PORT || '5432'),
  user:     process.env.DB_USER     || 'mac',
  database: process.env.DB_NAME     || 'phoenix_erp',
  password: process.env.DB_PASSWORD || '',
});

const steps = [
  // brd_farms — farm_code 唯一约束
  [`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='brd_farms_farm_code_key' AND conrelid='brd_farms'::regclass) THEN
        ALTER TABLE brd_farms ADD CONSTRAINT brd_farms_farm_code_key UNIQUE (farm_code);
      END IF;
    END $$`, 'brd_farms UNIQUE(farm_code)'],

  // brd_houses — house_code 唯一约束
  [`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='brd_houses_house_code_key' AND conrelid='brd_houses'::regclass) THEN
        ALTER TABLE brd_houses ADD CONSTRAINT brd_houses_house_code_key UNIQUE (house_code);
      END IF;
    END $$`, 'brd_houses UNIQUE(house_code)'],

  // brd_flocks — flock_no 唯一约束
  [`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='brd_flocks_flock_no_key' AND conrelid='brd_flocks'::regclass) THEN
        ALTER TABLE brd_flocks ADD CONSTRAINT brd_flocks_flock_no_key UNIQUE (flock_no);
      END IF;
    END $$`, 'brd_flocks UNIQUE(flock_no)'],

  // brd_daily_logs — (log_date, house_code) 唯一约束
  [`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='brd_daily_logs_date_house_key' AND conrelid='brd_daily_logs'::regclass) THEN
        ALTER TABLE brd_daily_logs ADD CONSTRAINT brd_daily_logs_date_house_key UNIQUE (log_date, house_code);
      END IF;
    END $$`, 'brd_daily_logs UNIQUE(log_date, house_code)'],

  // prc_purchase_orders — po_no 唯一约束（三单比对需要）
  [`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='prc_purchase_orders_po_no_key' AND conrelid='prc_purchase_orders'::regclass) THEN
        ALTER TABLE prc_purchase_orders ADD CONSTRAINT prc_purchase_orders_po_no_key UNIQUE (po_no);
      END IF;
    END $$`, 'prc_purchase_orders UNIQUE(po_no)'],

  // ord_orders — order_no 唯一约束
  [`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ord_orders_order_no_key' AND conrelid='ord_orders'::regclass) THEN
        ALTER TABLE ord_orders ADD CONSTRAINT ord_orders_order_no_key UNIQUE (order_no);
      END IF;
    END $$`, 'ord_orders UNIQUE(order_no)'],
];

async function run() {
  await client.connect();
  console.log('🔗 连接成功，补全 UNIQUE 约束...\n');
  let ok = 0, fail = 0;
  for (const [sql, label] of steps) {
    try {
      await client.query(sql);
      console.log('✅', label);
      ok++;
    } catch(e) {
      console.error('❌', label, '—', e.message);
      fail++;
    }
  }
  console.log(`\n${'─'.repeat(45)}`);
  console.log(`✅ ${ok}  ❌ ${fail}`);
  if (!fail) console.log('🎉 约束全部就绪，Phase 10E 将正常运行！');
  await client.end();
}
run().catch(e => { console.error('连接失败:', e.message); process.exit(1); });
