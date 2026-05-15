/**
 * Phoenix ERP V3 — 全业务表字段兜底补全
 * 补全 store_code / created_at / updated_at / status 及各表特定缺口
 * 用法: node migrations/fix_all_columns.js
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
  // ── 所有业务表补全 store_code / created_at / updated_at ──────────────
  ...['brd_houses','brd_farms','brd_flocks','brd_daily_logs','brd_vaccinations',
      'prc_purchase_orders','prc_purchase_items','prc_suppliers',
      'fin_transactions','fin_accounts','fin_payments','fin_store_settlements',
      'wms_inbound','wms_outbound','wms_warehouses','wms_zones','wms_transfer',
      'inv_batches','inv_ledger',
      'ord_orders','ord_order_items','ord_customers','ord_prices',
      'pos_sales','pos_sale_items','crm_members','b2b_customers',
      'log_vehicles','log_dispatch',
      'qa_inspections','qa_non_conformance',
      'mst_stores','mst_products','pkg_tasks',
  ].flatMap(t => [
    [`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS store_code VARCHAR(64) DEFAULT 'ALL'`, `${t}.store_code`],
    [`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`,   `${t}.created_at`],
    [`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,   `${t}.updated_at`],
  ]),

  // ── brd_houses 特定字段 ───────────────────────────────────────────────
  [`ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS org_code    VARCHAR(32)`,                     'brd_houses.org_code'],
  [`ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS area_code   VARCHAR(32)`,                     'brd_houses.area_code'],
  [`ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS house_type  VARCHAR(32) DEFAULT 'LAYER'`,     'brd_houses.house_type'],

  // ── brd_farms 特定字段 ────────────────────────────────────────────────
  [`ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS org_code     VARCHAR(32)`,                     'brd_farms.org_code'],
  [`ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS area_code    VARCHAR(32)`,                     'brd_farms.area_code'],
  [`ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS manager_name VARCHAR(64)`,                     'brd_farms.manager_name'],
  [`ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS phone        VARCHAR(32)`,                     'brd_farms.phone'],

  // ── brd_flocks 特定字段 ───────────────────────────────────────────────
  [`ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS breed_type  VARCHAR(32) DEFAULT 'LAYER'`,     'brd_flocks.breed_type'],
  [`ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS week_age    INT DEFAULT 0`,                   'brd_flocks.week_age'],
  [`ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS death_count INT DEFAULT 0`,                   'brd_flocks.death_count'],

  // ── wms_inbound 特定字段 ──────────────────────────────────────────────
  [`ALTER TABLE wms_inbound ADD COLUMN IF NOT EXISTS type         VARCHAR(32) DEFAULT 'PURCHASE'`, 'wms_inbound.type'],
  [`ALTER TABLE wms_inbound ADD COLUMN IF NOT EXISTS inbound_no   VARCHAR(64)`,                   'wms_inbound.inbound_no'],
  [`ALTER TABLE wms_inbound ADD COLUMN IF NOT EXISTS item         TEXT`,                           'wms_inbound.item'],
  [`ALTER TABLE wms_inbound ADD COLUMN IF NOT EXISTS qty          INT DEFAULT 0`,                  'wms_inbound.qty'],
  [`ALTER TABLE wms_inbound ADD COLUMN IF NOT EXISTS date         DATE`,                           'wms_inbound.date'],
  [`ALTER TABLE wms_inbound ADD COLUMN IF NOT EXISTS operator     VARCHAR(64)`,                    'wms_inbound.operator'],
  [`ALTER TABLE wms_inbound ADD COLUMN IF NOT EXISTS remark       TEXT`,                           'wms_inbound.remark'],

  // ── wms_outbound 特定字段 ─────────────────────────────────────────────
  [`ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS type        VARCHAR(32) DEFAULT 'SALE'`,     'wms_outbound.type'],
  [`ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS outbound_no VARCHAR(64)`,                    'wms_outbound.outbound_no'],
  [`ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS item        TEXT`,                            'wms_outbound.item'],
  [`ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS qty         INT DEFAULT 0`,                   'wms_outbound.qty'],
  [`ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS date        DATE`,                            'wms_outbound.date'],
  [`ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS operator    VARCHAR(64)`,                     'wms_outbound.operator'],
  [`ALTER TABLE wms_outbound ADD COLUMN IF NOT EXISTS remark      TEXT`,                            'wms_outbound.remark'],

  // ── fin_transactions 特定字段 ─────────────────────────────────────────
  [`ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS type          VARCHAR(32) DEFAULT 'AP'`, 'fin_transactions.type'],
  [`ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS amount        DECIMAL(18,2) DEFAULT 0`,  'fin_transactions.amount'],
  [`ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS invoice_no    VARCHAR(64)`,              'fin_transactions.invoice_no'],
  [`ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS counterparty  VARCHAR(128)`,             'fin_transactions.counterparty'],

  // ── prc 特定字段 ──────────────────────────────────────────────────────
  [`ALTER TABLE prc_purchase_orders ADD COLUMN IF NOT EXISTS remark         TEXT`,                 'prc_purchase_orders.remark'],
  [`ALTER TABLE prc_purchase_orders ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMP`,            'prc_purchase_orders.approved_at'],
  [`ALTER TABLE prc_suppliers ADD COLUMN IF NOT EXISTS supplier_type        VARCHAR(32)`,          'prc_suppliers.supplier_type'],
  [`ALTER TABLE prc_suppliers ADD COLUMN IF NOT EXISTS credit_days          INT DEFAULT 30`,        'prc_suppliers.credit_days'],
  [`ALTER TABLE prc_suppliers ADD COLUMN IF NOT EXISTS contact_name         VARCHAR(64)`,          'prc_suppliers.contact_name'],
  [`ALTER TABLE prc_suppliers ADD COLUMN IF NOT EXISTS contact_phone        VARCHAR(32)`,          'prc_suppliers.contact_phone'],
  [`ALTER TABLE prc_suppliers ADD COLUMN IF NOT EXISTS address              TEXT`,                  'prc_suppliers.address'],

  // ── ord 特定字段 ──────────────────────────────────────────────────────
  [`ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS note          TEXT`,                           'ord_orders.note'],
  [`ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS approved_by   BIGINT`,                         'ord_orders.approved_by'],
  [`ALTER TABLE ord_orders ADD COLUMN IF NOT EXISTS approved_at   TIMESTAMP`,                      'ord_orders.approved_at'],
  [`ALTER TABLE ord_customers ADD COLUMN IF NOT EXISTS phone       VARCHAR(32)`,                   'ord_customers.phone'],
  [`ALTER TABLE ord_customers ADD COLUMN IF NOT EXISTS address     TEXT`,                          'ord_customers.address'],
  [`ALTER TABLE ord_customers ADD COLUMN IF NOT EXISTS level       VARCHAR(16) DEFAULT 'NORMAL'`,  'ord_customers.level'],

  // ── crm 特定字段 ──────────────────────────────────────────────────────
  [`ALTER TABLE crm_members ADD COLUMN IF NOT EXISTS phone        VARCHAR(32)`,                    'crm_members.phone'],
  [`ALTER TABLE crm_members ADD COLUMN IF NOT EXISTS level        VARCHAR(16) DEFAULT 'NORMAL'`,   'crm_members.level'],
  [`ALTER TABLE crm_members ADD COLUMN IF NOT EXISTS points       INT DEFAULT 0`,                  'crm_members.points'],

  // ── pkg_tasks 特定字段 ────────────────────────────────────────────────
  [`ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS task_no       VARCHAR(64)`,                     'pkg_tasks.task_no'],
  [`ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS start_time    TIMESTAMP`,                        'pkg_tasks.start_time'],
  [`ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS grade         VARCHAR(16)`,                     'pkg_tasks.grade'],
  [`ALTER TABLE pkg_tasks ADD COLUMN IF NOT EXISTS packed_qty    INT DEFAULT 0`,                   'pkg_tasks.packed_qty'],

  // ── mst 特定字段 ──────────────────────────────────────────────────────
  [`ALTER TABLE mst_stores   ADD COLUMN IF NOT EXISTS store_name  VARCHAR(128)`,                   'mst_stores.store_name'],
  [`ALTER TABLE mst_stores   ADD COLUMN IF NOT EXISTS store_code  VARCHAR(64)`,                    'mst_stores.store_code'],
  [`ALTER TABLE mst_products ADD COLUMN IF NOT EXISTS product_code VARCHAR(64)`,                   'mst_products.product_code'],
  [`ALTER TABLE mst_products ADD COLUMN IF NOT EXISTS product_name VARCHAR(128)`,                  'mst_products.product_name'],
  [`ALTER TABLE mst_products ADD COLUMN IF NOT EXISTS unit         VARCHAR(16)`,                   'mst_products.unit'],
  [`ALTER TABLE mst_products ADD COLUMN IF NOT EXISTS price        DECIMAL(10,2) DEFAULT 0`,       'mst_products.price'],
];

async function run() {
  await c.connect();
  console.log('🔧 全业务表字段兜底补全...\n');
  let ok = 0, skip = 0;
  for (const [sql, label] of steps) {
    try {
      await c.query(sql);
      ok++;
    } catch(e) {
      skip++; // 字段已存在则跳过
    }
  }
  console.log(`✅ 执行 ${ok} 条  ⏭  跳过(已存在) ${skip} 条`);
  console.log('\n🎉 所有字段补全完成！无需重启后端，直接刷新页面重试。');
  await c.end();
}
run().catch(e => { console.error('连接失败:', e.message); process.exit(1); });
