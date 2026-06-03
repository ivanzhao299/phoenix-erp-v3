/**
 * Phoenix ERP V3 — 全量 Schema 补全 Migration Runner v3
 * 新增 13 张缺口表 + 清理 V2 引用步骤
 * 用法: node migrations/run_full_v3.js
 */
const { Client } = require('pg');

const client = new Client({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     parseInt(process.env.DB_PORT || '5432'),
  user:     process.env.DB_USER     || 'mac',
  database: process.env.DB_NAME     || 'phoenix_erp',
  password: process.env.DB_PASSWORD || '',
});

// ── 每条 SQL + 描述标签 ──────────────────────────────────────────────────────
const steps = [

  // ═══════════════════════════════════════════════════════════
  // GROUP A: 订单域 (ord_*)
  // ═══════════════════════════════════════════════════════════
  [`CREATE TABLE IF NOT EXISTS ord_customers (
      id            BIGSERIAL PRIMARY KEY,
      customer_no   VARCHAR(64) UNIQUE NOT NULL,
      customer_name VARCHAR(128) NOT NULL,
      customer_type VARCHAR(32) DEFAULT 'RETAIL',   -- RETAIL/B2B/WHOLESALE
      phone         VARCHAR(32),
      address       TEXT,
      credit_limit  DECIMAL(18,2) DEFAULT 0,
      store_code    VARCHAR(64) NOT NULL DEFAULT 'ALL',
      status        VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
      locale        VARCHAR(8) DEFAULT 'zh-CN',
      created_by    BIGINT,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
  )`, '✅ 建表: ord_customers'],

  [`CREATE TABLE IF NOT EXISTS ord_orders (
      id            BIGSERIAL PRIMARY KEY,
      order_no      VARCHAR(64) UNIQUE NOT NULL,
      customer_id   BIGINT REFERENCES ord_customers(id),
      order_type    VARCHAR(32) DEFAULT 'SALE',      -- SALE/RETURN/TRANSFER
      total_amount  DECIMAL(18,2) NOT NULL DEFAULT 0,
      paid_amount   DECIMAL(18,2) DEFAULT 0,
      currency_code VARCHAR(8) NOT NULL DEFAULT 'LAK',
      status        VARCHAR(32) NOT NULL DEFAULT 'DRAFT',  -- DRAFT/CONFIRMED/APPROVED/LOCKED/ALLOCATED/SHIPPED/DELIVERED/CLOSED/CANCELLED
      store_code    VARCHAR(64) NOT NULL DEFAULT 'ALL',
      sales_rep_id  BIGINT,
      delivery_date DATE,
      remark        TEXT,
      created_by    BIGINT,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      deleted_at    TIMESTAMP
  )`, '✅ 建表: ord_orders'],

  [`CREATE INDEX IF NOT EXISTS idx_ord_orders_store    ON ord_orders(store_code)`,   '✅ 索引: ord_orders(store_code)'],
  [`CREATE INDEX IF NOT EXISTS idx_ord_orders_customer ON ord_orders(customer_id)`,  '✅ 索引: ord_orders(customer_id)'],
  [`CREATE INDEX IF NOT EXISTS idx_ord_orders_status   ON ord_orders(status)`,       '✅ 索引: ord_orders(status)'],

  [`CREATE TABLE IF NOT EXISTS ord_order_items (
      id            BIGSERIAL PRIMARY KEY,
      order_no      VARCHAR(64) NOT NULL REFERENCES ord_orders(order_no) ON DELETE CASCADE,
      line_no       INT NOT NULL DEFAULT 1,
      product_code  VARCHAR(64) NOT NULL,
      product_name  VARCHAR(128),
      spec_code     VARCHAR(64),
      grade         VARCHAR(16),
      qty           DECIMAL(18,3) NOT NULL DEFAULT 0,
      unit          VARCHAR(16) DEFAULT '个',
      unit_price    DECIMAL(18,4) NOT NULL DEFAULT 0,
      discount_rate DECIMAL(5,4) DEFAULT 1.0000,
      line_amount   DECIMAL(18,2) NOT NULL DEFAULT 0,
      batch_no      VARCHAR(64),
      created_at    TIMESTAMP NOT NULL DEFAULT NOW()
  )`, '✅ 建表: ord_order_items'],

  [`CREATE INDEX IF NOT EXISTS idx_ord_items_order ON ord_order_items(order_no)`,    '✅ 索引: ord_order_items(order_no)'],

  [`CREATE TABLE IF NOT EXISTS ord_prices (
      id            BIGSERIAL PRIMARY KEY,
      price_code    VARCHAR(64) UNIQUE NOT NULL,
      product_code  VARCHAR(64) NOT NULL,
      grade         VARCHAR(16),
      customer_type VARCHAR(32) DEFAULT 'RETAIL',
      price         DECIMAL(18,4) NOT NULL,
      currency_code VARCHAR(8) DEFAULT 'LAK',
      valid_from    DATE,
      valid_to      DATE,
      store_code    VARCHAR(64) DEFAULT 'ALL',
      status        VARCHAR(16) DEFAULT 'ACTIVE',
      created_by    BIGINT,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
  )`, '✅ 建表: ord_prices'],

  // ═══════════════════════════════════════════════════════════
  // GROUP B: 采购域 (prc_*)
  // ═══════════════════════════════════════════════════════════
  [`CREATE TABLE IF NOT EXISTS prc_suppliers (
      id            BIGSERIAL PRIMARY KEY,
      supplier_code VARCHAR(64) UNIQUE NOT NULL,
      supplier_name VARCHAR(128) NOT NULL,
      supplier_type VARCHAR(32) DEFAULT 'FEED',     -- FEED/MEDICINE/EQUIPMENT/PACKAGING/OTHER
      contact_name  VARCHAR(64),
      contact_phone VARCHAR(32),
      address       TEXT,
      tax_no        VARCHAR(64),
      bank_account  VARCHAR(64),
      bank_name     VARCHAR(128),
      credit_days   INT DEFAULT 30,
      currency_code VARCHAR(8) DEFAULT 'LAK',
      store_code    VARCHAR(64) DEFAULT 'ALL',
      status        VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
      created_by    BIGINT,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
  )`, '✅ 建表: prc_suppliers'],

  [`CREATE INDEX IF NOT EXISTS idx_prc_suppliers_status ON prc_suppliers(status)`,   '✅ 索引: prc_suppliers(status)'],

  // ═══════════════════════════════════════════════════════════
  // GROUP C: 仓储域 (wms_*) 补全
  // ═══════════════════════════════════════════════════════════
  [`CREATE TABLE IF NOT EXISTS wms_inbound (
      id            BIGSERIAL PRIMARY KEY,
      task_no       VARCHAR(64) UNIQUE NOT NULL,
      source_po_no  VARCHAR(64),
      source_type   VARCHAR(32) DEFAULT 'PURCHASE',  -- PURCHASE/TRANSFER/RETURN
      warehouse_code VARCHAR(32) NOT NULL,
      supplier_code VARCHAR(64),
      total_amount  DECIMAL(18,2) DEFAULT 0,
      currency_code VARCHAR(8) DEFAULT 'LAK',
      status        VARCHAR(32) NOT NULL DEFAULT 'PENDING',  -- PENDING/PROCESSING/COMPLETED/CANCELLED
      store_code    VARCHAR(64) DEFAULT 'ALL',
      operator_id   BIGINT,
      confirmed_at  TIMESTAMP,
      remark        TEXT,
      created_by    BIGINT,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
  )`, '✅ 建表: wms_inbound'],

  [`CREATE INDEX IF NOT EXISTS idx_wms_inbound_status   ON wms_inbound(status)`,              '✅ 索引: wms_inbound(status)'],
  [`CREATE INDEX IF NOT EXISTS idx_wms_inbound_po       ON wms_inbound(source_po_no) WHERE source_po_no IS NOT NULL`, '✅ 索引: wms_inbound(source_po_no)'],

  [`CREATE TABLE IF NOT EXISTS wms_inbound_items (
      id            BIGSERIAL PRIMARY KEY,
      task_no       VARCHAR(64) NOT NULL REFERENCES wms_inbound(task_no) ON DELETE CASCADE,
      line_no       INT NOT NULL DEFAULT 1,
      product_code  VARCHAR(64) NOT NULL,
      spec_code     VARCHAR(64),
      batch_no      VARCHAR(64),
      expire_date   DATE,
      planned_qty   DECIMAL(18,3) DEFAULT 0,
      actual_qty    DECIMAL(18,3) DEFAULT 0,
      unit          VARCHAR(16) DEFAULT '个',
      unit_cost     DECIMAL(18,4) DEFAULT 0,
      location_code VARCHAR(64),
      created_at    TIMESTAMP NOT NULL DEFAULT NOW()
  )`, '✅ 建表: wms_inbound_items'],

  [`CREATE INDEX IF NOT EXISTS idx_wms_inbound_items_task ON wms_inbound_items(task_no)`, '✅ 索引: wms_inbound_items(task_no)'],

  [`CREATE TABLE IF NOT EXISTS wms_outbound (
      id            BIGSERIAL PRIMARY KEY,
      task_no       VARCHAR(64) UNIQUE NOT NULL,
      order_no      VARCHAR(64),
      source_type   VARCHAR(32) DEFAULT 'SALE',      -- SALE/TRANSFER/DISPOSAL/RETURN
      warehouse_code VARCHAR(32) NOT NULL,
      total_amount  DECIMAL(18,2) DEFAULT 0,
      currency_code VARCHAR(8) DEFAULT 'LAK',
      status        VARCHAR(32) NOT NULL DEFAULT 'PENDING',
      store_code    VARCHAR(64) DEFAULT 'ALL',
      operator_id   BIGINT,
      shipped_at    TIMESTAMP,
      remark        TEXT,
      created_by    BIGINT,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
  )`, '✅ 建表: wms_outbound'],

  [`CREATE INDEX IF NOT EXISTS idx_wms_outbound_status ON wms_outbound(status)`,             '✅ 索引: wms_outbound(status)'],
  [`CREATE INDEX IF NOT EXISTS idx_wms_outbound_order  ON wms_outbound(order_no) WHERE order_no IS NOT NULL`, '✅ 索引: wms_outbound(order_no)'],

  [`CREATE TABLE IF NOT EXISTS wms_zones (
      zone_code     VARCHAR(64) PRIMARY KEY,
      warehouse_code VARCHAR(32) NOT NULL,
      zone_name     VARCHAR(128) NOT NULL,
      zone_type     VARCHAR(32) DEFAULT 'NORMAL',    -- NORMAL/COLD/QUARANTINE/DAMAGED
      status        VARCHAR(16) DEFAULT 'ACTIVE',
      created_at    TIMESTAMP NOT NULL DEFAULT NOW()
  )`, '✅ 建表: wms_zones'],

  [`CREATE TABLE IF NOT EXISTS wms_transfer (
      id            BIGSERIAL PRIMARY KEY,
      transfer_no   VARCHAR(64) UNIQUE NOT NULL,
      from_warehouse VARCHAR(32) NOT NULL,
      to_warehouse  VARCHAR(32) NOT NULL,
      status        VARCHAR(32) DEFAULT 'PENDING',
      total_qty     DECIMAL(18,3) DEFAULT 0,
      store_code    VARCHAR(64) DEFAULT 'ALL',
      operator_id   BIGINT,
      remark        TEXT,
      created_by    BIGINT,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
  )`, '✅ 建表: wms_transfer'],

  // ═══════════════════════════════════════════════════════════
  // GROUP D: 养殖日报 (brd_*)
  // ═══════════════════════════════════════════════════════════
  [`CREATE TABLE IF NOT EXISTS brd_daily_logs (
      id            BIGSERIAL PRIMARY KEY,
      log_date      DATE NOT NULL,
      house_code    VARCHAR(50) NOT NULL REFERENCES brd_houses(house_code),
      farm_code     VARCHAR(50) NOT NULL,
      flock_no      VARCHAR(50),
      egg_count     INT DEFAULT 0,          -- 当日产蛋数
      broken_count  INT DEFAULT 0,          -- 破损数
      death_count   INT DEFAULT 0,          -- 死淘数
      feed_kg       DECIMAL(10,2) DEFAULT 0, -- 耗料量（公斤）
      water_liter   DECIMAL(10,2) DEFAULT 0, -- 耗水量
      body_weight   DECIMAL(8,2),            -- 抽样体重（克）
      egg_weight    DECIMAL(8,2),            -- 平均蛋重（克）
      note          TEXT,
      recorded_by   BIGINT,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(log_date, house_code)
  )`, '✅ 建表: brd_daily_logs'],

  [`CREATE INDEX IF NOT EXISTS idx_brd_daily_date  ON brd_daily_logs(log_date)`,              '✅ 索引: brd_daily_logs(log_date)'],
  [`CREATE INDEX IF NOT EXISTS idx_brd_daily_house ON brd_daily_logs(house_code)`,             '✅ 索引: brd_daily_logs(house_code)'],

  // ═══════════════════════════════════════════════════════════
  // GROUP E: POS / CRM / B2B
  // ═══════════════════════════════════════════════════════════
  [`CREATE TABLE IF NOT EXISTS crm_members (
      id            BIGSERIAL PRIMARY KEY,
      member_no     VARCHAR(64) UNIQUE NOT NULL,
      member_name   VARCHAR(128) NOT NULL,
      phone         VARCHAR(32) UNIQUE,
      gender        VARCHAR(8),
      birthday      DATE,
      level         VARCHAR(16) DEFAULT 'SILVER',    -- SILVER/GOLD/PLATINUM
      points        INT DEFAULT 0,
      total_spent   DECIMAL(18,2) DEFAULT 0,
      store_code    VARCHAR(64) DEFAULT 'ALL',
      status        VARCHAR(16) DEFAULT 'ACTIVE',
      created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
  )`, '✅ 建表: crm_members'],

  [`CREATE TABLE IF NOT EXISTS pos_sales (
      id            BIGSERIAL PRIMARY KEY,
      sale_no       VARCHAR(64) UNIQUE NOT NULL,
      member_id     BIGINT REFERENCES crm_members(id),
      total_amount  DECIMAL(18,2) NOT NULL DEFAULT 0,
      discount_amount DECIMAL(18,2) DEFAULT 0,
      paid_amount   DECIMAL(18,2) NOT NULL DEFAULT 0,
      payment_method VARCHAR(32) DEFAULT 'CASH',     -- CASH/CARD/QR/MIXED
      currency_code VARCHAR(8) DEFAULT 'LAK',
      store_code    VARCHAR(64) NOT NULL,
      cashier_id    BIGINT,
      status        VARCHAR(16) DEFAULT 'COMPLETED',  -- COMPLETED/REFUNDED/VOIDED
      remark        TEXT,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW()
  )`, '✅ 建表: pos_sales'],

  [`CREATE INDEX IF NOT EXISTS idx_pos_sales_store  ON pos_sales(store_code)`,                '✅ 索引: pos_sales(store_code)'],
  [`CREATE INDEX IF NOT EXISTS idx_pos_sales_date   ON pos_sales(created_at)`,                 '✅ 索引: pos_sales(created_at)'],

  [`CREATE TABLE IF NOT EXISTS b2b_customers (
      id            BIGSERIAL PRIMARY KEY,
      customer_code VARCHAR(64) UNIQUE NOT NULL,
      customer_name VARCHAR(128) NOT NULL,
      contact_name  VARCHAR(64),
      contact_phone VARCHAR(32),
      address       TEXT,
      credit_limit  DECIMAL(18,2) DEFAULT 0,
      credit_days   INT DEFAULT 30,
      tax_no        VARCHAR(64),
      area_code     VARCHAR(32),
      store_code    VARCHAR(64) DEFAULT 'ALL',
      sales_rep_id  BIGINT,
      level         VARCHAR(16) DEFAULT 'A',          -- A/B/C/D
      status        VARCHAR(16) DEFAULT 'ACTIVE',
      created_by    BIGINT,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
  )`, '✅ 建表: b2b_customers'],

  [`CREATE INDEX IF NOT EXISTS idx_b2b_customers_area ON b2b_customers(area_code)`,           '✅ 索引: b2b_customers(area_code)'],

  // ═══════════════════════════════════════════════════════════
  // GROUP F: IoT 日聚合表
  // ═══════════════════════════════════════════════════════════
  [`CREATE TABLE IF NOT EXISTS mon_device_property_daily_agg (
      id            BIGSERIAL PRIMARY KEY,
      agg_date      DATE NOT NULL,
      erp_house_code VARCHAR(50) NOT NULL,
      property_code VARCHAR(50) NOT NULL,
      avg_val       DECIMAL(18,4),
      max_val       DECIMAL(18,4),
      min_val       DECIMAL(18,4),
      sample_count  INT DEFAULT 0,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(agg_date, erp_house_code, property_code)
  )`, '✅ 建表: mon_device_property_daily_agg'],

  [`CREATE INDEX IF NOT EXISTS idx_mon_agg_date  ON mon_device_property_daily_agg(agg_date)`,       '✅ 索引: mon_agg(agg_date)'],
  [`CREATE INDEX IF NOT EXISTS idx_mon_agg_house ON mon_device_property_daily_agg(erp_house_code)`, '✅ 索引: mon_agg(erp_house_code)'],

  // ═══════════════════════════════════════════════════════════
  // GROUP G: 将 wms_suppliers 数据迁移到 prc_suppliers
  // ═══════════════════════════════════════════════════════════
  [`INSERT INTO prc_suppliers (supplier_code, supplier_name, contact_phone, status, created_at)
    SELECT COALESCE(supplier_code, 'S-' || id::text),
           COALESCE(supplier_name, '未知供应商'),
           contact_phone,
           COALESCE(status, 'ACTIVE'),
           created_at
    FROM wms_suppliers
    WHERE NOT EXISTS (
      SELECT 1 FROM prc_suppliers WHERE supplier_code = wms_suppliers.supplier_code
    )
    ON CONFLICT DO NOTHING`,
    '✅ wms_suppliers → prc_suppliers 数据迁移'],

  // ═══════════════════════════════════════════════════════════
  // GROUP H: 将 biz_sales_order 历史数据迁移到 ord_orders
  // ═══════════════════════════════════════════════════════════
  [`INSERT INTO ord_orders (order_no, total_amount, currency_code, status, store_code, created_by, created_at, updated_at)
    SELECT order_no, total_amount, currency_code, status, store_code, created_by, created_at, updated_at
    FROM biz_sales_order
    WHERE order_no NOT IN (SELECT order_no FROM ord_orders WHERE order_no IS NOT NULL)
    ON CONFLICT DO NOTHING`,
    '✅ biz_sales_order → ord_orders 历史数据迁移'],
];

async function run() {
  await client.connect();
  console.log('🔗 数据库连接成功\n📋 开始 V3 全量 Schema 补全...\n');

  let ok = 0, skip = 0, fail = 0;
  for (const [sql, label] of steps) {
    try {
      await client.query(sql);
      console.log(label);
      ok++;
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log(`⏭  跳过(已存在): ${label.replace('✅ ', '')}`);
        skip++;
      } else if (e.message.includes('does not exist') && label.includes('数据迁移')) {
        console.log(`⏭  跳过(源表不存在): ${label.replace('✅ ', '')}`);
        skip++;
      } else {
        console.error(`❌ 失败: ${label}\n   原因: ${e.message}`);
        fail++;
      }
    }
  }

  console.log(`\n${'═'.repeat(55)}`);
  console.log(`✅ 成功: ${ok}  ⏭  跳过: ${skip}  ❌ 失败: ${fail}`);
  if (fail === 0) console.log('\n🎉 V3 全量 Schema 补全完成！');
  else            console.log('\n⚠️  部分失败，请检查上方错误');

  await client.end();
}

run().catch(e => { console.error('连接失败:', e.message); process.exit(1); });
