/**
 * Phoenix ERP V3 — 补全索引缺失字段 + 重建失败索引
 * 用法: node migrations/fix_indexes.js
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
  // ord_orders 补全所有 V3 字段
  [`ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS store_code    VARCHAR(64) NOT NULL DEFAULT 'ALL'`, 'ord_orders.store_code'],
  [`ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS customer_id   BIGINT`,                             'ord_orders.customer_id'],
  [`ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS order_type    VARCHAR(32) DEFAULT 'SALE'`,         'ord_orders.order_type'],
  [`ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS total_amount  DECIMAL(18,2) DEFAULT 0`,            'ord_orders.total_amount'],
  [`ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS currency_code VARCHAR(8) DEFAULT 'LAK'`,           'ord_orders.currency_code'],
  [`ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS status        VARCHAR(32) DEFAULT 'DRAFT'`,        'ord_orders.status'],
  [`ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS order_no      VARCHAR(64)`,                        'ord_orders.order_no'],
  [`ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS sales_rep_id  BIGINT`,                             'ord_orders.sales_rep_id'],
  [`ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS delivery_date DATE`,                               'ord_orders.delivery_date'],
  [`ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS remark        TEXT`,                               'ord_orders.remark'],
  [`ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS created_by    BIGINT`,                             'ord_orders.created_by'],
  [`ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS created_at    TIMESTAMP DEFAULT NOW()`,            'ord_orders.created_at'],
  [`ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMP DEFAULT NOW()`,            'ord_orders.updated_at'],
  [`ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMP`,                          'ord_orders.deleted_at'],

  // wms_outbound 补全
  [`ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS order_no      VARCHAR(64)`,                      'wms_outbound.order_no'],
  [`ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS source_type   VARCHAR(32) DEFAULT 'SALE'`,       'wms_outbound.source_type'],
  [`ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS warehouse_code VARCHAR(32)`,                     'wms_outbound.warehouse_code'],
  [`ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS total_amount  DECIMAL(18,2) DEFAULT 0`,          'wms_outbound.total_amount'],
  [`ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS currency_code VARCHAR(8) DEFAULT 'LAK'`,         'wms_outbound.currency_code'],
  [`ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS status        VARCHAR(32) DEFAULT 'PENDING'`,    'wms_outbound.status'],
  [`ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS store_code    VARCHAR(64) DEFAULT 'ALL'`,        'wms_outbound.store_code'],
  [`ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS created_at    TIMESTAMP DEFAULT NOW()`,          'wms_outbound.created_at'],
  [`ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMP DEFAULT NOW()`,          'wms_outbound.updated_at'],

  // b2b_customers 补全
  [`ALTER TABLE b2b_customers ADD COLUMN IF NOT EXISTS area_code     VARCHAR(32)`,                    'b2b_customers.area_code'],
  [`ALTER TABLE b2b_customers ADD COLUMN IF NOT EXISTS store_code    VARCHAR(64) DEFAULT 'ALL'`,       'b2b_customers.store_code'],
  [`ALTER TABLE b2b_customers ADD COLUMN IF NOT EXISTS status        VARCHAR(16) DEFAULT 'ACTIVE'`,    'b2b_customers.status'],
  [`ALTER TABLE b2b_customers ADD COLUMN IF NOT EXISTS customer_name VARCHAR(128)`,                    'b2b_customers.customer_name'],
  [`ALTER TABLE b2b_customers ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(32)`,                     'b2b_customers.contact_phone'],
  [`ALTER TABLE b2b_customers ADD COLUMN IF NOT EXISTS credit_limit  DECIMAL(18,2) DEFAULT 0`,         'b2b_customers.credit_limit'],
  [`ALTER TABLE b2b_customers ADD COLUMN IF NOT EXISTS sales_rep_id  BIGINT`,                          'b2b_customers.sales_rep_id'],
  [`ALTER TABLE b2b_customers ADD COLUMN IF NOT EXISTS created_at    TIMESTAMP DEFAULT NOW()`,         'b2b_customers.created_at'],
  [`ALTER TABLE b2b_customers ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMP DEFAULT NOW()`,         'b2b_customers.updated_at'],

  // 重建4个失败的索引
  [`CREATE INDEX IF NOT EXISTS idx_ord_orders_store    ON ord_orders(store_code)`,                    'idx: ord_orders(store_code)'],
  [`CREATE INDEX IF NOT EXISTS idx_ord_orders_customer ON ord_orders(customer_id) WHERE customer_id IS NOT NULL`, 'idx: ord_orders(customer_id)'],
  [`CREATE INDEX IF NOT EXISTS idx_wms_outbound_order  ON wms_outbound(order_no) WHERE order_no IS NOT NULL`,    'idx: wms_outbound(order_no)'],
  [`CREATE INDEX IF NOT EXISTS idx_b2b_area            ON b2b_customers(area_code) WHERE area_code IS NOT NULL`, 'idx: b2b_customers(area_code)'],

  // 顺便确认 fin_transactions 有 paid_amount 字段（应付核销需要）
  [`ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(18,2) DEFAULT 0`,       'fin_transactions.paid_amount'],
  [`ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS counterparty VARCHAR(128)`,                  'fin_transactions.counterparty'],
  [`ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS ref_no       VARCHAR(64)`,                   'fin_transactions.ref_no'],
  [`ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS transaction_no VARCHAR(64)`,                 'fin_transactions.transaction_no'],
];

async function run() {
  await client.connect();
  console.log('🔗 连接成功，开始补全...\n');
  let ok = 0, skip = 0, fail = 0;
  for (const [sql, label] of steps) {
    try {
      await client.query(sql);
      console.log('✅', label);
      ok++;
    } catch(e) {
      if (e.message.includes('already exists')) {
        console.log('⏭  跳过:', label);
        skip++;
      } else {
        console.error('❌', label, '—', e.message);
        fail++;
      }
    }
  }
  console.log(`\n${'─'.repeat(45)}`);
  console.log(`✅ ${ok}  ⏭  ${skip}  ❌ ${fail}`);
  if (!fail) console.log('🎉 全部完成，数据库字段 100% 补齐！');
  await client.end();
}

run().catch(e => { console.error('连接失败:', e.message); process.exit(1); });
