/**
 * Phoenix ERP V3 — DB 迁移执行器
 * 用法: node migrations/run_migration.js
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
  // ── 1. prc_purchase_orders 补全所有必要字段 ─────────────────────────────────
  [`ALTER TABLE prc_purchase_orders ADD COLUMN IF NOT EXISTS supplier_code  VARCHAR(128)`,           '✅ prc_purchase_orders.supplier_code'],
  [`ALTER TABLE prc_purchase_orders ADD COLUMN IF NOT EXISTS supplier_name  VARCHAR(256)`,           '✅ prc_purchase_orders.supplier_name'],
  [`ALTER TABLE prc_purchase_orders ADD COLUMN IF NOT EXISTS subject        VARCHAR(256)`,           '✅ prc_purchase_orders.subject'],
  [`ALTER TABLE prc_purchase_orders ADD COLUMN IF NOT EXISTS total_amount   DECIMAL(18,2) DEFAULT 0`,'✅ prc_purchase_orders.total_amount'],
  [`ALTER TABLE prc_purchase_orders ADD COLUMN IF NOT EXISTS currency_code  VARCHAR(8) DEFAULT 'LAK'`,'✅ prc_purchase_orders.currency_code'],
  [`ALTER TABLE prc_purchase_orders ADD COLUMN IF NOT EXISTS status         VARCHAR(32) DEFAULT 'DRAFT'`,'✅ prc_purchase_orders.status'],
  [`ALTER TABLE prc_purchase_orders ADD COLUMN IF NOT EXISTS plan_qty       INT DEFAULT 0`,          '✅ prc_purchase_orders.plan_qty'],
  [`ALTER TABLE prc_purchase_orders ADD COLUMN IF NOT EXISTS received_qty   INT DEFAULT 0`,          '✅ prc_purchase_orders.received_qty'],
  [`ALTER TABLE prc_purchase_orders ADD COLUMN IF NOT EXISTS store_code     VARCHAR(32) DEFAULT 'ALL'`,'✅ prc_purchase_orders.store_code'],
  [`ALTER TABLE prc_purchase_orders ADD COLUMN IF NOT EXISTS expected_date  DATE`,                   '✅ prc_purchase_orders.expected_date'],
  [`ALTER TABLE prc_purchase_orders ADD COLUMN IF NOT EXISTS remark         TEXT`,                   '✅ prc_purchase_orders.remark'],
  [`ALTER TABLE prc_purchase_orders ADD COLUMN IF NOT EXISTS created_by     BIGINT`,                 '✅ prc_purchase_orders.created_by'],
  [`ALTER TABLE prc_purchase_orders ADD COLUMN IF NOT EXISTS approved_by    BIGINT`,                 '✅ prc_purchase_orders.approved_by'],
  [`ALTER TABLE prc_purchase_orders ADD COLUMN IF NOT EXISTS created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,'✅ prc_purchase_orders.created_at'],
  [`ALTER TABLE prc_purchase_orders ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,'✅ prc_purchase_orders.updated_at'],

  // ── 2. 迁移历史数据 ──────────────────────────────────────────────────────────
  [`INSERT INTO prc_purchase_orders (po_no,supplier_code,total_amount,currency_code,status,plan_qty,received_qty,store_code,created_by,created_at,updated_at)
    SELECT po_no,supplier_code,total_amount,currency_code,status,plan_qty,received_qty,store_code,created_by,created_at,updated_at
    FROM biz_purchase_order
    WHERE po_no NOT IN (SELECT COALESCE(po_no,'') FROM prc_purchase_orders)
    ON CONFLICT DO NOTHING`,
    '✅ 历史采购单数据迁移'],

  // ── 3. fin_transactions ──────────────────────────────────────────────────────
  [`ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS due_date     DATE`,                        '✅ fin_transactions.due_date'],
  [`ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS account_code VARCHAR(128)`,                '✅ fin_transactions.account_code'],
  [`ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS description   TEXT`,                       '✅ fin_transactions.description'],
  [`ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS status        VARCHAR(32) DEFAULT 'PENDING'`, '✅ fin_transactions.status'],
  [`UPDATE fin_transactions SET due_date = (created_at::date + INTERVAL '30 days')::date
    WHERE due_date IS NULL AND type IN ('AR','AP')`,
    '✅ fin_transactions.due_date 默认值回填'],


  // ── 4. brd_houses ────────────────────────────────────────────────────────────
  [`ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS max_capacity INT DEFAULT 50000`,                 '✅ brd_houses.max_capacity'],

  // ── 5. wms_inbound ───────────────────────────────────────────────────────────
  [`ALTER TABLE wms_inbound ADD COLUMN IF NOT EXISTS source_po_no VARCHAR(64)`,                      '✅ wms_inbound.source_po_no'],
  [`ALTER TABLE wms_inbound ADD COLUMN IF NOT EXISTS total_amount  DECIMAL(18,2) DEFAULT 0`,         '✅ wms_inbound.total_amount'],

  // ── 6. inv_batches ───────────────────────────────────────────────────────────
  [`ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS expire_date DATE`,                              '✅ inv_batches.expire_date'],

  // ── 7. sys_user ──────────────────────────────────────────────────────────────
  [`ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS password_hash VARCHAR(256)`,                       '✅ sys_user.password_hash'],

  // ── 8. 索引 ──────────────────────────────────────────────────────────────────
  [`CREATE INDEX IF NOT EXISTS idx_fin_txn_type_status ON fin_transactions(type,status)`,            '✅ 索引: fin_transactions(type,status)'],
  [`CREATE INDEX IF NOT EXISTS idx_prc_po_supplier     ON prc_purchase_orders(supplier_code) WHERE supplier_code IS NOT NULL`,'✅ 索引: prc_purchase_orders(supplier_code)'],
  [`CREATE INDEX IF NOT EXISTS idx_prc_po_status       ON prc_purchase_orders(status) WHERE status IS NOT NULL`,'✅ 索引: prc_purchase_orders(status)'],
  [`CREATE INDEX IF NOT EXISTS idx_inv_expire          ON inv_batches(expire_date) WHERE expire_date IS NOT NULL`,'✅ 索引: inv_batches(expire_date)'],
  [`CREATE INDEX IF NOT EXISTS idx_wms_source_po       ON wms_inbound(source_po_no) WHERE source_po_no IS NOT NULL`,'✅ 索引: wms_inbound(source_po_no)'],
];

async function run() {
  await client.connect();
  console.log('🔗 数据库连接成功，开始迁移...\n');

  let ok = 0, fail = 0;
  for (const [sql, label] of steps) {
    try {
      await client.query(sql);
      console.log(label);
      ok++;
    } catch (e) {
      // 字段已存在 → 忽略
      if (e.message.includes('already exists')) {
        console.log(`⏭  已存在跳过: ${label.replace('✅ ','')}`);
      } else {
        console.error(`❌ 失败: ${label}\n   原因: ${e.message}`);
        fail++;
      }
    }
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ 成功: ${ok}  ❌ 失败: ${fail}`);

  if (fail === 0) console.log('🎉 迁移全部完成！');
  else            console.log('⚠️  部分步骤失败，请检查上方错误信息');

  await client.end();
}

run().catch(e => { console.error('连接失败:', e.message); process.exit(1); });
